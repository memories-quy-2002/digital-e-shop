import { STAGE0_LIMITS } from '../limits';
import { GITHUB_USER_AGENT, type GitHubCapability, type FetchImplementation } from './app-auth';
import type { Stage0PrSnapshot, Stage0RequiredCheckSnapshot } from './observer';

const API_ORIGIN = 'https://api.github.com';
const API_VERSION = '2026-03-10';
const REPORT_NAME = 'Loop Engineering Stage 0';
const REVISION_PATTERN = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i;
const FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/i;
const REPOSITORY_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?\/[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;
const REASON_PATTERN = /^[a-z][a-z0-9_]{0,79}$/;
const ALLOWED_ACTIONS = new Set(['wait', 'retry-check', 'request-repair', 'escalate', 'ready-for-human']);

export interface GitHubReportConfiguration {
  appId: number;
  installationId: number;
  repositoryId: number;
  repository: string;
  privateKey: string;
  checkRunName: string;
}

interface GitHubReportAuth {
  getInstallationToken(capability: GitHubCapability): Promise<string>;
}

interface ReportDecision {
  action: string;
  reasonCode: string;
  headSha: string;
  baseSha: string;
  mergeSha: string | null;
  requiredCheckPolicyFingerprint: string;
}

interface ReportInput {
  snapshot: Stage0PrSnapshot;
  decision: ReportDecision;
  requiredCheckSnapshot: Stage0RequiredCheckSnapshot;
  existingCheckRunId: number | null;
  refresh(): Promise<{ snapshot: Stage0PrSnapshot; requiredCheckSnapshot: Stage0RequiredCheckSnapshot }>;
}

export class GitHubReportError extends Error {
  readonly code:
    | 'report_configuration_invalid'
    | 'report_input_invalid'
    | 'policy_incomplete'
    | 'report_check_is_required'
    | 'stale_pr_tuple'
    | 'stale_required_check_policy'
    | 'lookup_incomplete'
    | 'lookup_ambiguous'
    | 'api_unavailable'
    | 'redirect_rejected'
    | 'response_too_large'
    | 'response_invalid'
    | 'report_write_refused';

  constructor(code: GitHubReportError['code']) {
    super(code);
    this.name = 'GitHubReportError';
    this.code = code;
  }
}

interface CheckRunIdentity {
  id: number;
  name: string;
  head_sha: string;
  app: { id: number } | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function normalizeSha(value: unknown): string | null {
  return typeof value === 'string' && REVISION_PATTERN.test(value) ? value.toLowerCase() : null;
}

function canonicalList(values: unknown): string[] | null {
  if (!Array.isArray(values) || values.length > 1000
      || values.some((value) => typeof value !== 'string' || value.length > 2048)) return null;
  const result = [...values] as string[];
  if (new Set(result).size !== result.length) return null;
  return result.sort();
}

function sameTuple(left: Stage0PrSnapshot, right: Stage0PrSnapshot): boolean {
  return left.repository.toLowerCase() === right.repository.toLowerCase()
    && left.repositoryId === right.repositoryId
    && left.number === right.number
    && left.state === 'open' && right.state === 'open'
    && left.baseRef === right.baseRef
    && normalizeSha(left.baseSha) !== null && normalizeSha(left.baseSha) === normalizeSha(right.baseSha)
    && normalizeSha(left.headSha) !== null && normalizeSha(left.headSha) === normalizeSha(right.headSha)
    && (left.mergeSha === null ? right.mergeSha === null
      : normalizeSha(left.mergeSha) !== null && normalizeSha(left.mergeSha) === normalizeSha(right.mergeSha));
}

function isPolicyComplete(snapshot: Stage0RequiredCheckSnapshot, expectedFingerprint: string): boolean {
  if (!isRecord(snapshot) || snapshot.collectionStatus !== 'complete'
      || typeof snapshot.baseRef !== 'string' || snapshot.baseRef.length === 0
      || !FINGERPRINT_PATTERN.test(snapshot.policyFingerprint)
      || snapshot.policyFingerprint.toLowerCase() !== expectedFingerprint.toLowerCase()) return false;
  const checkKeys = canonicalList(snapshot.requiredCheckKeys);
  const workflowKeys = canonicalList(snapshot.requiredWorkflowKeys);
  if (!checkKeys || !workflowKeys || !Array.isArray(snapshot.requiredChecks)
      || !Array.isArray(snapshot.requiredWorkflows)
      || snapshot.requiredChecks.length > 1000 || snapshot.requiredWorkflows.length > 1000) return false;
  if (snapshot.requiredChecks.some((check) => !isRecord(check)
      || typeof check.context !== 'string' || check.context.length === 0 || check.context.length > 2048
      || !(check.appId === null || isPositiveInteger(check.appId)))) return false;
  return !snapshot.requiredChecks.some((check) => check.context.toLowerCase() === REPORT_NAME.toLowerCase());
}

function isSameRequiredPolicy(
  initial: Stage0RequiredCheckSnapshot,
  current: Stage0RequiredCheckSnapshot,
  expectedFingerprint: string,
): boolean {
  if (!isPolicyComplete(current, expectedFingerprint)
      || initial.baseRef !== current.baseRef
      || initial.policyFingerprint.toLowerCase() !== current.policyFingerprint.toLowerCase()) return false;
  const initialCheckKeys = canonicalList(initial.requiredCheckKeys);
  const currentCheckKeys = canonicalList(current.requiredCheckKeys);
  const initialWorkflowKeys = canonicalList(initial.requiredWorkflowKeys);
  const currentWorkflowKeys = canonicalList(current.requiredWorkflowKeys);
  return initialCheckKeys !== null && currentCheckKeys !== null
    && initialWorkflowKeys !== null && currentWorkflowKeys !== null
    && initialCheckKeys.join('\n') === currentCheckKeys.join('\n')
    && initialWorkflowKeys.join('\n') === currentWorkflowKeys.join('\n');
}

function parseIdentity(value: unknown): CheckRunIdentity {
  if (!isRecord(value) || !isPositiveInteger(value.id)
      || value.name !== REPORT_NAME || normalizeSha(value.head_sha) === null
      || !(value.app === null || (isRecord(value.app) && isPositiveInteger(value.app.id)))) {
    throw new GitHubReportError('response_invalid');
  }
  return {
    id: value.id,
    name: value.name,
    head_sha: String(value.head_sha).toLowerCase(),
    app: value.app === null ? null : { id: (value.app as { id: number }).id },
  };
}

function parseNextLink(link: string | null, current: URL, expectedPath: string): URL | null {
  if (!link) return null;
  const match = /<([^>]+)>\s*;\s*rel\s*=\s*"?next"?/i.exec(link);
  if (!match) return null;
  let next: URL;
  try {
    next = new URL(match[1]);
  } catch {
    throw new GitHubReportError('lookup_incomplete');
  }
  const nextPage = Number(current.searchParams.get('page')) + 1;
  const queryWithoutPage = (url: URL) => [...url.searchParams.entries()]
    .filter(([key]) => key !== 'page')
    .sort(([ak, av], [bk, bv]) => ak.localeCompare(bk) || av.localeCompare(bv));
  if (next.origin !== API_ORIGIN || next.pathname !== expectedPath
      || next.username || next.password || next.hash
      || next.searchParams.get('page') !== String(nextPage)
      || JSON.stringify(queryWithoutPage(next)) !== JSON.stringify(queryWithoutPage(current))) {
    throw new GitHubReportError('lookup_incomplete');
  }
  return next;
}

async function boundedJson(response: Response): Promise<unknown> {
  const limit = STAGE0_LIMITS.maxGitHubApiResponseBytes;
  const contentLength = response.headers.get('content-length');
  if (contentLength !== null) {
    const declaredLength = Number(contentLength);
    if (!Number.isSafeInteger(declaredLength) || declaredLength < 0 || declaredLength > limit) {
      throw new GitHubReportError('response_too_large');
    }
  }
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel().catch(() => undefined);
        throw new GitHubReportError('response_too_large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new GitHubReportError('response_invalid');
  }
}

function reportBody(input: ReportInput, now: number, includeHeadSha: boolean): Record<string, unknown> {
  if (!Number.isFinite(now) || now < 1 || !ALLOWED_ACTIONS.has(input.decision.action)
      || !REASON_PATTERN.test(input.decision.reasonCode)) throw new GitHubReportError('report_input_invalid');
  const timestamp = new Date(now).toISOString();
  const body: Record<string, unknown> = {
    name: REPORT_NAME,
    status: 'completed',
    conclusion: 'neutral',
    started_at: timestamp,
    completed_at: timestamp,
    output: {
      title: 'Loop Engineering Stage 0 observation',
      summary: [
        `Observed at: ${timestamp}`,
        `Decision: ${input.decision.action}`,
        `Reason: ${input.decision.reasonCode}`,
        `Required policy fingerprint: ${input.decision.requiredCheckPolicyFingerprint.slice(0, 16)}`,
        '',
        'This report is observational and does not grant merge readiness.',
      ].join('\n'),
    },
  };
  if (includeHeadSha) body.head_sha = input.snapshot.headSha.toLowerCase();
  return body;
}

export function createGitHubReportClient(options: {
  configuration: GitHubReportConfiguration;
  auth: GitHubReportAuth;
  fetchImpl?: FetchImplementation;
  now?: () => number;
}) {
  const { configuration } = options ?? {};
  if (!configuration || !isPositiveInteger(configuration.appId)
      || !isPositiveInteger(configuration.installationId) || !isPositiveInteger(configuration.repositoryId)
      || typeof configuration.repository !== 'string' || !REPOSITORY_PATTERN.test(configuration.repository)
      || typeof configuration.privateKey !== 'string' || configuration.privateKey.length === 0
      || configuration.checkRunName !== REPORT_NAME || !options.auth
      || typeof options.auth.getInstallationToken !== 'function') {
    throw new GitHubReportError('report_configuration_invalid');
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const [owner, repo] = configuration.repository.split('/');
  const repositoryPath = '/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo);
  const lookupPath = repositoryPath + '/commits/';

  async function request(
    method: 'GET' | 'POST' | 'PATCH',
    url: URL,
    token: string,
    body?: Record<string, unknown>,
  ): Promise<{ value: unknown; link: string | null }> {
    const expectedLookupPrefix = lookupPath;
    const isLookup = method === 'GET'
      && url.origin === API_ORIGIN
      && url.pathname.startsWith(expectedLookupPrefix)
      && /\/commits\/[a-f0-9]{40}(?:[a-f0-9]{24})?\/check-runs$/i.test(url.pathname)
      && url.searchParams.getAll('check_name').length === 1
      && url.searchParams.get('check_name') === REPORT_NAME
      && url.searchParams.getAll('app_id').length === 1
      && url.searchParams.get('app_id') === String(configuration.appId)
      && url.searchParams.get('filter') === 'all'
      && url.searchParams.get('per_page') === '100'
      && /^[1-9][0-9]*$/.test(url.searchParams.get('page') ?? '')
      && [...url.searchParams.keys()].sort().join('|') === 'app_id|check_name|filter|page|per_page';
    const isCreate = method === 'POST' && url.origin === API_ORIGIN && url.pathname === repositoryPath + '/check-runs';
    const isUpdate = method === 'PATCH' && url.origin === API_ORIGIN
      && new RegExp('^' + repositoryPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/check-runs/[1-9][0-9]*$').test(url.pathname);
    if (!isLookup && !isCreate && !isUpdate) throw new GitHubReportError('report_write_refused');
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: 'Bearer ' + token,
          'User-Agent': GITHUB_USER_AGENT,
          'X-GitHub-Api-Version': API_VERSION,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        redirect: 'manual',
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      if (error instanceof GitHubReportError) throw error;
      throw new GitHubReportError('api_unavailable');
    }
    if (response.redirected || (response.status >= 300 && response.status < 400)) {
      throw new GitHubReportError('redirect_rejected');
    }
    if (!response.ok) throw new GitHubReportError('api_unavailable');
    return { value: await boundedJson(response), link: response.headers.get('link') };
  }

  async function lookup(headSha: string, token: string): Promise<CheckRunIdentity[]> {
    const path = lookupPath + headSha + '/check-runs';
    const first = new URL(path, API_ORIGIN);
    first.searchParams.set('check_name', REPORT_NAME);
    first.searchParams.set('app_id', String(configuration.appId));
    first.searchParams.set('filter', 'all');
    first.searchParams.set('per_page', '100');
    first.searchParams.set('page', '1');
    let current = first;
    const candidates: CheckRunIdentity[] = [];
    let totalCount: number | null = null;
    for (let page = 0; page < STAGE0_LIMITS.maxPaginationPages; page += 1) {
      const response = await request('GET', current, token);
      if (!isRecord(response.value) || !Array.isArray(response.value.check_runs)
          || !isPositiveInteger(response.value.total_count) && response.value.total_count !== 0) {
        throw new GitHubReportError('response_invalid');
      }
      const pageTotal = response.value.total_count as number;
      if (totalCount !== null && totalCount !== pageTotal) throw new GitHubReportError('lookup_incomplete');
      totalCount = pageTotal;
      for (const item of response.value.check_runs) candidates.push(parseIdentity(item));
      if (candidates.length > totalCount) throw new GitHubReportError('response_invalid');
      const next = parseNextLink(response.link, current, path);
      if (!next) {
        if (candidates.length !== totalCount) throw new GitHubReportError('lookup_incomplete');
        return candidates;
      }
      if (page + 1 === STAGE0_LIMITS.maxPaginationPages) throw new GitHubReportError('lookup_incomplete');
      current = next;
    }
    throw new GitHubReportError('lookup_incomplete');
  }

  async function validateFresh(input: ReportInput): Promise<void> {
    const current = await input.refresh();
    if (!sameTuple(input.snapshot, current.snapshot)
        || input.snapshot.repository.toLowerCase() !== configuration.repository.toLowerCase()
        || input.snapshot.repositoryId !== configuration.repositoryId
        || input.snapshot.state !== 'open'
        || input.decision.headSha.toLowerCase() !== input.snapshot.headSha.toLowerCase()
        || input.decision.baseSha.toLowerCase() !== input.snapshot.baseSha.toLowerCase()
        || (input.decision.mergeSha === null ? input.snapshot.mergeSha !== null
          : input.snapshot.mergeSha === null || input.decision.mergeSha.toLowerCase() !== input.snapshot.mergeSha.toLowerCase())) {
      throw new GitHubReportError('stale_pr_tuple');
    }
    if (!isPolicyComplete(input.requiredCheckSnapshot, input.decision.requiredCheckPolicyFingerprint)) {
      if (Array.isArray(input.requiredCheckSnapshot.requiredChecks)
          && input.requiredCheckSnapshot.requiredChecks.some((check) => isRecord(check)
            && typeof check.context === 'string' && check.context.toLowerCase() === REPORT_NAME.toLowerCase())) {
        throw new GitHubReportError('report_check_is_required');
      }
      throw new GitHubReportError('policy_incomplete');
    }
    if (current.requiredCheckSnapshot.collectionStatus !== 'complete') throw new GitHubReportError('policy_incomplete');
    if (!isPolicyComplete(current.requiredCheckSnapshot, input.decision.requiredCheckPolicyFingerprint)) {
      if (Array.isArray(current.requiredCheckSnapshot.requiredChecks)
          && current.requiredCheckSnapshot.requiredChecks.some((check) => isRecord(check)
            && typeof check.context === 'string' && check.context.toLowerCase() === REPORT_NAME.toLowerCase())) {
        throw new GitHubReportError('report_check_is_required');
      }
      throw new GitHubReportError('stale_required_check_policy');
    }
    if (!isSameRequiredPolicy(input.requiredCheckSnapshot, current.requiredCheckSnapshot,
      input.decision.requiredCheckPolicyFingerprint)) throw new GitHubReportError('stale_required_check_policy');
  }

  async function publish(input: ReportInput): Promise<{ checkRunId: number }> {
    if (!input || !input.snapshot || !input.decision || !input.requiredCheckSnapshot
        || typeof input.refresh !== 'function'
        || !(input.existingCheckRunId === null || isPositiveInteger(input.existingCheckRunId))
        || typeof input.decision.action !== 'string' || typeof input.decision.reasonCode !== 'string'
        || typeof input.decision.headSha !== 'string' || typeof input.decision.baseSha !== 'string'
        || !(input.decision.mergeSha === null || typeof input.decision.mergeSha === 'string')
        || !FINGERPRINT_PATTERN.test(input.decision.requiredCheckPolicyFingerprint)) {
      throw new GitHubReportError('report_input_invalid');
    }
    await validateFresh(input);
    const token = await options.auth.getInstallationToken('report');
    if (typeof token !== 'string' || token.length === 0 || token.length > 8192) {
      throw new GitHubReportError('report_configuration_invalid');
    }
    const runs = await lookup(input.snapshot.headSha.toLowerCase(), token);
    const owned = runs.filter((run) => run.name === REPORT_NAME
      && run.head_sha === input.snapshot.headSha.toLowerCase()
      && run.app?.id === configuration.appId);
    if (owned.length > 1) throw new GitHubReportError('lookup_ambiguous');
    const mapped = owned.find((run) => run.id === input.existingCheckRunId) ?? null;
    const known = mapped ?? owned[0] ?? null;
    await validateFresh(input);

    const timestamp = now();
    const body = reportBody(input, timestamp, known === null);
    const url = known === null
      ? new URL(repositoryPath + '/check-runs', API_ORIGIN)
      : new URL(repositoryPath + '/check-runs/' + known.id, API_ORIGIN);
    if (url.pathname !== repositoryPath + '/check-runs'
        && !new RegExp('^' + repositoryPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/check-runs/[1-9][0-9]*$').test(url.pathname)) {
      throw new GitHubReportError('report_write_refused');
    }
    const result = await request(known === null ? 'POST' : 'PATCH', url, token, body);
    const written = parseIdentity(result.value);
    if (written.name !== REPORT_NAME || written.head_sha !== input.snapshot.headSha.toLowerCase()
        || written.app?.id !== configuration.appId
        || (known !== null && written.id !== known.id)) {
      throw new GitHubReportError('response_invalid');
    }
    return { checkRunId: written.id };
  }

  return Object.freeze({ publish });
}
