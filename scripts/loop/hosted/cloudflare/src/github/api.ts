import { STAGE0_LIMITS } from '../limits';
import { GITHUB_USER_AGENT, type FetchImplementation, type GitHubCapability } from './app-auth';

const API_ORIGIN = 'https://api.github.com';
const API_VERSION = '2026-03-10';
const PAGE_SIZE = 100;
const REVISION_PATTERN = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i;
const REPOSITORY_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?\/[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;

function githubRequestHeaders(token: string): HeadersInit {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: 'Bearer ' + token,
    'User-Agent': GITHUB_USER_AGENT,
    'X-GitHub-Api-Version': API_VERSION,
  };
}

export class GitHubApiError extends Error {
  readonly code:
    | 'configuration_invalid'
    | 'request_limit_reached'
    | 'network_error'
    | 'redirect_rejected'
    | 'response_too_large'
    | 'invalid_response'
    | 'api_unavailable'
    | 'pagination_rejected'
    | 'pagination_limit';

  constructor(code: GitHubApiError['code']) {
    super(code);
    this.name = 'GitHubApiError';
    this.code = code;
  }
}

export interface GitHubListResult<T = unknown> {
  items: T[];
  collectionStatus: 'complete' | 'incomplete';
  pageCount: number;
  itemCount: number;
}

export interface GitHubApiClient {
  readonly repository: string;
  readonly repositoryId: number;
  readonly requestCount: number;
  readonly requestLimit: number;
  getPullRequest(number: number): Promise<unknown | null>;
  getRepository(): Promise<unknown | null>;
  getRepositoryById(id: number): Promise<unknown | null>;
  getBranchProtection(baseRef: string): Promise<unknown | null>;
  getRuleset(id: number): Promise<unknown | null>;
  getPolicyFile(path: string, ref: string): Promise<unknown | null>;
  listRulesets(): Promise<GitHubListResult>;
  listCommitCheckRuns(sha: string): Promise<GitHubListResult>;
  listCommitStatuses(sha: string): Promise<GitHubListResult>;
  listWorkflowRuns(sha: string): Promise<GitHubListResult>;
  listPullRequestFiles(number: number): Promise<GitHubListResult>;
  listPullRequestReviews(number: number): Promise<GitHubListResult>;
  listPullRequestReviewComments(number: number): Promise<GitHubListResult>;
  listPullRequestIssueComments(number: number): Promise<GitHubListResult>;
  listOpenPullRequests(page: number): Promise<{ items: unknown[]; hasNext: boolean; pageCount: 1 }>;
}

interface GitHubApiOptions {
  repository: string;
  repositoryId: number;
  getToken: (capability?: GitHubCapability) => Promise<string>;
  fetchImpl?: FetchImplementation;
  maxSubrequests?: number;
  maxPages?: number;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (isRecord(value)) {
    return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonicalJson(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

function sameQuery(left: URL, right: URL): boolean {
  const stripPaging = (url: URL) => [...url.searchParams.entries()]
    .filter(([key]) => key !== 'page' && key !== 'per_page')
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue));
  return canonicalJson(stripPaging(left)) === canonicalJson(stripPaging(right));
}

function parseNextLink(link: string | null, current: URL, page: number): URL | null {
  if (!link) return null;
  const match = /<([^>]+)>\s*;\s*rel\s*=\s*"?next"?/i.exec(link);
  if (!match) return null;
  let next: URL;
  try {
    next = new URL(match[1]);
  } catch {
    throw new GitHubApiError('pagination_rejected');
  }
  if (next.origin !== API_ORIGIN || next.pathname !== current.pathname
      || next.username || next.password || next.hash
      || next.searchParams.get('page') !== String(page + 1)
      || next.searchParams.get('per_page') !== current.searchParams.get('per_page')
      || !sameQuery(current, next)) {
    throw new GitHubApiError('pagination_rejected');
  }
  return next;
}

async function readBoundedBytes(response: Response): Promise<Uint8Array> {
  const limit = STAGE0_LIMITS.maxGitHubApiResponseBytes;
  const contentLength = response.headers.get('content-length');
  if (contentLength !== null) {
    const declared = Number(contentLength);
    if (!Number.isSafeInteger(declared) || declared < 0 || declared > limit) {
      throw new GitHubApiError('response_too_large');
    }
  }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel().catch(() => undefined);
        throw new GitHubApiError('response_too_large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function parseJson(response: Response): Promise<unknown> {
  const bytes = await readBoundedBytes(response);
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new GitHubApiError('invalid_response');
  }
}

export function createGitHubApiClient(options: GitHubApiOptions) {
  if (!options || typeof options.repository !== 'string' || !REPOSITORY_PATTERN.test(options.repository)
      || !isPositiveInteger(options.repositoryId) || typeof options.getToken !== 'function') {
    throw new GitHubApiError('configuration_invalid');
  }
  const [owner, repo] = options.repository.split('/');
  const repositoryPath = '/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo);
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxSubrequests = options.maxSubrequests ?? STAGE0_LIMITS.maxSubrequestsPerInvocation;
  const maxPages = options.maxPages ?? STAGE0_LIMITS.maxPaginationPages;
  if (!isPositiveInteger(maxSubrequests) || !isPositiveInteger(maxPages)) {
    throw new GitHubApiError('configuration_invalid');
  }
  let subrequestCount = 0;

  async function getJson(route: string, query: Record<string, string | number> = {}): Promise<unknown | null> {
    if (!route.startsWith(repositoryPath + '/') && route !== repositoryPath
        && !route.startsWith('/repositories/')) {
      throw new GitHubApiError('configuration_invalid');
    }
    const url = new URL(route, API_ORIGIN);
    if (url.origin !== API_ORIGIN) throw new GitHubApiError('configuration_invalid');
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
    if (subrequestCount >= maxSubrequests) throw new GitHubApiError('request_limit_reached');
    subrequestCount += 1;

    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: 'GET',
        headers: githubRequestHeaders(await options.getToken('observe')),
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      if (error instanceof GitHubApiError) throw error;
      throw new GitHubApiError('network_error');
    }
    if (response.redirected || (response.status >= 300 && response.status < 400)) {
      throw new GitHubApiError('redirect_rejected');
    }
    if (!response.ok) throw new GitHubApiError('api_unavailable');
    return parseJson(response);
  }

  async function getOptionalJson(route: string, query: Record<string, string | number> = {}): Promise<unknown | null> {
    if (!route.startsWith(repositoryPath + '/') && route !== repositoryPath) {
      throw new GitHubApiError('configuration_invalid');
    }
    const url = new URL(route, API_ORIGIN);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
    if (subrequestCount >= maxSubrequests) throw new GitHubApiError('request_limit_reached');
    subrequestCount += 1;
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: 'GET',
        headers: githubRequestHeaders(await options.getToken('observe')),
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new GitHubApiError('network_error');
    }
    if (response.redirected || (response.status >= 300 && response.status < 400)) {
      throw new GitHubApiError('redirect_rejected');
    }
    if (response.status === 404) return null;
    if (!response.ok) throw new GitHubApiError('api_unavailable');
    return parseJson(response);
  }

  async function getJsonWithHeaders(route: string): Promise<{ value: unknown | null; link: string | null }> {
    const url = new URL(route, API_ORIGIN);
    if (!url.pathname.startsWith(repositoryPath + '/') && url.pathname !== repositoryPath) {
      throw new GitHubApiError('configuration_invalid');
    }
    if (subrequestCount >= maxSubrequests) throw new GitHubApiError('request_limit_reached');
    subrequestCount += 1;
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: 'GET',
        headers: githubRequestHeaders(await options.getToken('observe')),
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new GitHubApiError('network_error');
    }
    if (response.redirected || (response.status >= 300 && response.status < 400)) {
      throw new GitHubApiError('redirect_rejected');
    }
    if (!response.ok) throw new GitHubApiError('api_unavailable');
    return { value: await parseJson(response), link: response.headers.get('link') };
  }

  async function paginateWithHeaders(
    route: string,
    field: string | null,
    initialQuery: Record<string, string | number> = {},
  ): Promise<GitHubListResult> {
    const firstUrl = new URL(route, API_ORIGIN);
    for (const [key, value] of Object.entries(initialQuery)) firstUrl.searchParams.set(key, String(value));
    firstUrl.searchParams.set('per_page', String(PAGE_SIZE));
    firstUrl.searchParams.set('page', '1');
    const items: unknown[] = [];
    let current = firstUrl;
    let pageCount = 0;
    let complete = true;
    while (pageCount < maxPages) {
      const result = await getJsonWithHeaders(current.pathname + current.search);
      pageCount += 1;
      const responseItems = field === null
        ? result.value
        : isRecord(result.value) ? result.value[field] : null;
      if (!Array.isArray(responseItems)) throw new GitHubApiError('invalid_response');
      items.push(...responseItems);
      const next = parseNextLink(result.link, current, pageCount);
      if (!next) break;
      if (pageCount === maxPages) {
        complete = false;
        break;
      }
      current = next;
    }
    return { items, collectionStatus: complete ? 'complete' : 'incomplete', pageCount, itemCount: items.length };
  }

  async function onePage(
    route: string,
    field: string | null,
    page: number,
    query: Record<string, string | number> = {},
  ): Promise<{ items: unknown[]; hasNext: boolean; pageCount: 1 }> {
    if (!isPositiveInteger(page) || page > STAGE0_LIMITS.maxReconciliationPagesPerSweep) {
      throw new GitHubApiError('configuration_invalid');
    }
    const url = new URL(route, API_ORIGIN);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
    url.searchParams.set('per_page', String(STAGE0_LIMITS.maxOpenPullRequestsPerSweep));
    url.searchParams.set('page', String(page));
    const result = await getJsonWithHeaders(url.pathname + url.search);
    const values = field === null
      ? result.value
      : isRecord(result.value) ? result.value[field] : null;
    if (!Array.isArray(values)) throw new GitHubApiError('invalid_response');
    const next = parseNextLink(result.link, url, page);
    return { items: values, hasNext: next !== null, pageCount: 1 };
  }

  function assertRevision(sha: string): string {
    if (typeof sha !== 'string' || !REVISION_PATTERN.test(sha)) throw new GitHubApiError('configuration_invalid');
    return sha.toLowerCase();
  }

  function assertPullNumber(number: number): number {
    if (!isPositiveInteger(number) || number > 2_147_483_647) throw new GitHubApiError('configuration_invalid');
    return number;
  }

  return Object.freeze({
    get requestCount() { return subrequestCount; },
    get requestLimit() { return maxSubrequests; },
    get repositoryId() { return options.repositoryId; },
    get repository() { return options.repository.toLowerCase(); },
    getPullRequest(number: number) {
      return getJson(repositoryPath + '/pulls/' + assertPullNumber(number));
    },
    getRepository() {
      return getJson(repositoryPath);
    },
    getRepositoryById(id: number) {
      if (!isPositiveInteger(id)) throw new GitHubApiError('configuration_invalid');
      return getJson('/repositories/' + id);
    },
    getBranchProtection(baseRef: string) {
      return getOptionalJson(repositoryPath + '/branches/' + encodeURIComponent(baseRef) + '/protection');
    },
    getRuleset(id: number) {
      if (!isPositiveInteger(id)) throw new GitHubApiError('configuration_invalid');
      return getJson(repositoryPath + '/rulesets/' + id);
    },
    getPolicyFile(path: string, ref: string) {
      if (!['protected-paths.yml', 'risk-rules.yml', 'stop-conditions.yml'].includes(path)
          || !REVISION_PATTERN.test(ref)) throw new GitHubApiError('configuration_invalid');
      return getJson(repositoryPath + '/contents/.agent/policy/' + path, { ref });
    },
    listRulesets() {
      return paginateWithHeaders(repositoryPath + '/rulesets', null, { includes_parents: 'true' });
    },
    listCommitCheckRuns(sha: string) {
      return paginateWithHeaders(repositoryPath + '/commits/' + encodeURIComponent(assertRevision(sha)) + '/check-runs', 'check_runs');
    },
    listCommitStatuses(sha: string) {
      return paginateWithHeaders(repositoryPath + '/commits/' + encodeURIComponent(assertRevision(sha)) + '/statuses', null);
    },
    listWorkflowRuns(sha: string) {
      return paginateWithHeaders(repositoryPath + '/actions/runs', 'workflow_runs', { head_sha: assertRevision(sha) });
    },
    listPullRequestFiles(number: number) {
      return paginateWithHeaders(repositoryPath + '/pulls/' + assertPullNumber(number) + '/files', null);
    },
    listPullRequestReviews(number: number) {
      return paginateWithHeaders(repositoryPath + '/pulls/' + assertPullNumber(number) + '/reviews', null);
    },
    listPullRequestReviewComments(number: number) {
      return paginateWithHeaders(repositoryPath + '/pulls/' + assertPullNumber(number) + '/comments', null);
    },
    listPullRequestIssueComments(number: number) {
      return paginateWithHeaders(repositoryPath + '/issues/' + assertPullNumber(number) + '/comments', null);
    },
    listOpenPullRequests(page: number) {
      return onePage(repositoryPath + '/pulls', null, page, { state: 'open', sort: 'updated', direction: 'desc' });
    },
  });
}
