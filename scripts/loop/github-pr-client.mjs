import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';

import { fingerprintFailure } from './fingerprint-failure.mjs';
import { normalizeCheckObservation, normalizePrSnapshot, normalizeRequiredCheckSnapshot } from './pr-evidence.mjs';
import { redactVerificationOutput } from './verify.mjs';

const API_ORIGIN = 'https://api.github.com';
const API_VERSION = '2026-03-10';
const MAX_JSON_BYTES = 1024 * 1024;
const MAX_LOG_ARCHIVE_BYTES = 5 * 1024 * 1024;
const MAX_LOG_EXPANDED_BYTES = 10 * 1024 * 1024;
const DEFAULT_LOG_OUTPUT_BYTES = 16 * 1024;
const MAX_LOG_OUTPUT_BYTES = 64 * 1024;
const MAX_PAGES = 10;
const PAGE_SIZE = 100;
const MAX_RULESET_DETAILS = 100;
const MAX_WORKFLOW_SOURCE_REPOSITORIES = 20;
const REVISION_PATTERN = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i;
const SUPPORTED_CONCLUSIONS = new Set(['success', 'failure', 'cancelled', 'timed_out', 'action_required', 'neutral', 'skipped']);
const OBSERVATION_STATUSES = new Set(['queued', 'in_progress', 'completed']);

const GRAPHQL_PULL_REQUEST_QUERY = `query LoopPrSnapshot($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      baseRefName
      baseRefOid
      headRefName
      headRefOid
      potentialMergeCommit { oid }
      mergeable
      isDraft
      state
      baseRepository { databaseId nameWithOwner defaultBranchRef { name } }
      headRepository { databaseId nameWithOwner }
    }
  }
}`;

const ERROR_MESSAGES = Object.freeze({
  invalid_configuration: 'GitHub PR client configuration is invalid.',
  invalid_repository: 'The configured GitHub repository identifier is invalid.',
  invalid_response: 'GitHub returned an invalid or incomplete response.',
  response_too_large: 'GitHub returned a response larger than the configured limit.',
  unauthorized: 'GitHub rejected the installation token.',
  forbidden: 'GitHub denied the requested read operation.',
  not_found: 'GitHub could not find the requested repository resource.',
  rate_limited: 'GitHub rate-limited the requested read operation.',
  network_error: 'GitHub could not be reached safely.',
  redirect_rejected: 'GitHub redirected an authenticated API request.',
  log_redirect_rejected: 'The job log redirect is not on the configured HTTPS allowlist.',
  pagination_rejected: 'GitHub returned an unsafe pagination link.',
  pagination_limit: 'GitHub pagination exceeded the configured page limit.',
  pr_tuple_mismatch: 'REST and GraphQL returned different pull request revisions.',
  repository_mismatch: 'GitHub returned a pull request from another repository.',
  stale_pr_snapshot: 'The requested evidence does not match the current pull request snapshot.',
  pr_snapshot_required: 'Read the pull request snapshot before collecting revision-bound evidence.',
  run_not_observed: 'The workflow run has not been observed in this client session.',
  unsupported_observation: 'GitHub returned check data that cannot be represented safely.',
  invalid_log_archive: 'The job log archive is invalid or unsupported.',
  invalid_options: 'The requested adapter options are invalid.',
});

export class GitHubPrClientError extends Error {
  constructor(code) {
    super(ERROR_MESSAGES[code] ?? 'GitHub PR observation failed.');
    this.name = 'GitHubPrClientError';
    this.code = code;
  }
}

function fail(code) {
  throw new GitHubPrClientError(code);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (isRecord(value)) {
    return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonicalJson(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function parseRepository(value) {
  if (typeof value !== 'string') fail('invalid_repository');
  const pieces = value.split('/');
  if (pieces.length !== 2 || pieces.some((piece) => piece.length === 0 || piece.length > 100
      || !/^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/.test(piece) || piece.includes('..'))) {
    fail('invalid_repository');
  }
  return { owner: pieces[0], name: pieces[1], fullName: pieces.join('/').toLowerCase() };
}

function repositoryName(value) {
  if (typeof value !== 'string') return null;
  const parsed = parseRepository(value);
  return parsed.fullName;
}

function normalizeSha(value) {
  return typeof value === 'string' && REVISION_PATTERN.test(value) ? value.toLowerCase() : null;
}

function normalizedTuple(snapshot) {
  return {
    baseSha: snapshot.baseSha,
    headSha: snapshot.headSha,
    mergeSha: snapshot.mergeSha,
  };
}

function sameTuple(left, right) {
  return left.baseSha === right.baseSha && left.headSha === right.headSha && left.mergeSha === right.mergeSha;
}

function codeForStatus(response) {
  if (response.status === 401) return 'unauthorized';
  if (response.status === 403) return response.headers.get('x-ratelimit-remaining') === '0' ? 'rate_limited' : 'forbidden';
  if (response.status === 404) return 'not_found';
  if (response.status === 429) return 'rate_limited';
  if (response.status >= 300 && response.status < 400) return 'redirect_rejected';
  return 'network_error';
}

async function readBoundedBytes(response, maxBytes) {
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > maxBytes) fail('response_too_large');

  if (!response.body?.getReader) {
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > maxBytes) fail('response_too_large');
    return bytes;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        fail('response_too_large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

async function readJson(response) {
  const bytes = await readBoundedBytes(response, MAX_JSON_BYTES);
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    fail('invalid_response');
  }
}

function parseNextLink(link, currentUrl, page) {
  if (!link) return null;
  const match = /<([^>]+)>\s*;\s*rel\s*=\s*"?next"?/i.exec(link);
  if (!match) return null;
  let next;
  try {
    next = new URL(match[1]);
  } catch {
    fail('pagination_rejected');
  }
  if (next.origin !== API_ORIGIN || next.pathname !== currentUrl.pathname
      || next.username || next.password || next.hash
      || next.searchParams.get('page') !== String(page + 1)
      || next.searchParams.get('per_page') !== String(PAGE_SIZE)) {
    fail('pagination_rejected');
  }
  const withoutPage = (url) => [...url.searchParams.entries()]
    .filter(([key]) => key !== 'page' && key !== 'per_page')
    .sort(([aKey, aValue], [bKey, bValue]) => compareStrings(aKey, bKey) || compareStrings(aValue, bValue));
  if (canonicalJson(withoutPage(currentUrl)) !== canonicalJson(withoutPage(next))) fail('pagination_rejected');
  return next;
}

function sanitizeContext(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 255
    && !/[\x00-\x1f\x7f]/.test(value) ? value.trim() : null;
}

function normalizeRepositoryFilename(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 1024
      || value.startsWith('/') || value.includes('\\') || /[\x00-\x1f\x7f]/.test(value)) return null;
  const segments = value.split('/');
  if (segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')) return null;
  return value;
}

function canonicalRequiredWorkflow(workflow) {
  const normalized = normalizeRequiredCheckSnapshot({
    baseRef: 'main',
    policyFingerprint: '0'.repeat(64),
    requiredChecks: [],
    requiredWorkflows: [workflow],
    collectionStatus: 'complete',
  });
  return normalized.requiredWorkflows[0];
}

function stableTimestamp(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function parseWorkflowPath(value) {
  if (typeof value !== 'string' || value.length > 512) return null;
  const separator = value.lastIndexOf('@');
  if (separator < 1 || separator === value.length - 1) return null;
  const path = value.slice(0, separator);
  const ref = value.slice(separator + 1);
  if (!path.startsWith('.github/workflows/') || path.includes('\\') || path.split('/').some((part) => part === '.' || part === '..' || !part)) return null;
  return { path, ref };
}

function globMatches(pattern, value, wildcardCrossesSlash = false) {
  if (typeof pattern !== 'string' || pattern.length === 0 || pattern.length > 255) return null;
  if (pattern === '~ALL') return true;
  if (pattern === '~NONE') return false;
  if (pattern === '~DEFAULT_BRANCH') return null;
  const branchPattern = pattern.startsWith('refs/heads/') ? pattern.slice('refs/heads/'.length) : pattern;
  if (/[{}\[\]!]/.test(branchPattern)) return null;
  let expression = '^';
  for (let index = 0; index < branchPattern.length; index += 1) {
    const char = branchPattern[index];
    if (char === '*') {
      if (branchPattern[index + 1] === '*') {
        expression += '.*';
        index += 1;
      } else {
        expression += wildcardCrossesSlash ? '.*' : '[^/]*';
      }
    } else if (char === '?') {
      expression += wildcardCrossesSlash ? '.' : '[^/]';
    } else {
      expression += char.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
    }
  }
  expression += '$';
  try {
    return new RegExp(expression).test(value);
  } catch {
    return null;
  }
}

function rulesetApplies(ruleset, baseRef, defaultBranch, repository) {
  if (!isRecord(ruleset)) return null;
  if (ruleset.target !== 'branch') return ruleset.target === 'tag' ? false : null;
  if (ruleset.enforcement === 'disabled' || ruleset.enforcement === 'evaluate') return false;
  if (ruleset.enforcement !== 'active') return null;
  const conditions = ruleset.conditions;
  if (conditions === undefined || conditions === null) return true;
  if (!isRecord(conditions)) return null;
  const supportedConditions = new Set(['ref_name', 'repository_name', 'repository_id']);
  if (Object.keys(conditions).some((key) => !supportedConditions.has(key))) return null;
  for (const [conditionName, candidate] of Object.entries(conditions)) {
    if (!isRecord(candidate)) return null;
    if (conditionName === 'repository_id') {
      const include = candidate.include;
      const exclude = candidate.exclude;
      if (include !== undefined && (!Array.isArray(include) || include.some((id) => !isPositiveInteger(id)))) return null;
      if (exclude !== undefined && (!Array.isArray(exclude) || exclude.some((id) => !isPositiveInteger(id)))) return null;
      if (Array.isArray(include) && include.length > 0 && !include.includes(repository.id)) return false;
      if (Array.isArray(exclude) && exclude.includes(repository.id)) return false;
      continue;
    }
    const value = conditionName === 'repository_name' ? repository.fullName.toLowerCase() : baseRef;
    for (const setName of ['include', 'exclude']) {
      if (candidate[setName] === undefined) continue;
      if (!Array.isArray(candidate[setName])) return null;
      const results = candidate[setName].map((pattern) => {
        if (pattern === '~DEFAULT_BRANCH') {
          if (conditionName !== 'ref_name' || typeof defaultBranch !== 'string' || defaultBranch.length === 0) return null;
          return value === defaultBranch;
        }
        const normalizedPattern = conditionName === 'repository_name' && typeof pattern === 'string'
          ? pattern.toLowerCase()
          : pattern;
        return globMatches(normalizedPattern, value, conditionName === 'repository_name');
      });
      if (results.some((result) => result === null)) return null;
      if (setName === 'include' && results.length > 0 && !results.some(Boolean)) return false;
      if (setName === 'exclude' && results.some(Boolean)) return false;
    }
  }
  return true;
}

function safeRequiredCheck(context, appId) {
  const normalizedContext = sanitizeContext(context);
  if (!normalizedContext) return null;
  if (appId !== null && appId !== undefined && (!isPositiveInteger(appId))) return null;
  return { context: normalizedContext, appId: appId ?? null };
}

function parseRequiredWorkflows(rule) {
  if (!isRecord(rule.parameters) || !Array.isArray(rule.parameters.workflows)) return { valid: false, workflows: [] };
  const workflows = [];
  for (const workflow of rule.parameters.workflows) {
    if (!isRecord(workflow) || !isPositiveInteger(workflow.repository_id)
      || typeof workflow.path !== 'string' || typeof workflow.ref !== 'string'
      || !normalizeSha(workflow.sha)) {
      return { valid: false, workflows: [] };
    }
    workflows.push({
      repositoryId: workflow.repository_id,
      path: workflow.path,
      ref: workflow.ref,
      sha: normalizeSha(workflow.sha),
    });
  }
  return { valid: true, workflows };
}

function parseRequiredStatusChecks(rule) {
  if (!isRecord(rule.parameters) || !Array.isArray(rule.parameters.required_status_checks)) return { valid: false, checks: [] };
  const checks = [];
  for (const check of rule.parameters.required_status_checks) {
    if (!isRecord(check)) return { valid: false, checks: [] };
    const appId = check.integration_id ?? check.app_id ?? null;
    const normalized = safeRequiredCheck(check.context, appId === -1 ? null : appId);
    if (!normalized) return { valid: false, checks: [] };
    checks.push(normalized);
  }
  return { valid: true, checks };
}

function parseBranchProtectionChecks(protection) {
  if (!isRecord(protection) || protection.required_status_checks === null) return { valid: true, checks: [], strict: false };
  const required = protection.required_status_checks;
  if (!isRecord(required)) return { valid: false, checks: [], strict: false };
  const checks = [];
  if (Array.isArray(required.checks)) {
    for (const check of required.checks) {
      const normalized = safeRequiredCheck(check?.context, check?.app_id ?? null);
      if (!normalized) return { valid: false, checks: [], strict: false };
      checks.push(normalized);
    }
  }
  if (Array.isArray(required.contexts)) {
    for (const context of required.contexts) {
      const normalized = safeRequiredCheck(context, null);
      if (!normalized) return { valid: false, checks: [], strict: false };
      checks.push(normalized);
    }
  }
  if (!Array.isArray(required.checks) && !Array.isArray(required.contexts)) {
    return { valid: false, checks: [], strict: false };
  }
  return { valid: true, checks, strict: required.strict === true };
}

function conclusionForStatus(state) {
  if (state === 'success') return 'success';
  if (state === 'failure' || state === 'error') return 'failure';
  return null;
}

function mapCheckRun(check, snapshot, testedSha) {
  if (!isRecord(check) || !isPositiveInteger(check.id) || normalizeSha(check.head_sha) !== testedSha) return null;
  if (!OBSERVATION_STATUSES.has(check.status)) return null;
  const completed = check.status === 'completed';
  if (completed && !SUPPORTED_CONCLUSIONS.has(check.conclusion)) return null;
  if (!completed && check.conclusion !== null && check.conclusion !== undefined) return null;
  const context = sanitizeContext(check.name);
  if (!context) return null;
  const appId = isPositiveInteger(check.app?.id) ? check.app.id : null;
  let failureFingerprint = null;
  if (completed && check.conclusion === 'failure') {
    const safeTitle = redactVerificationOutput(typeof check.output?.title === 'string' ? check.output.title.slice(0, 2048) : '');
    const safeSummary = redactVerificationOutput(typeof check.output?.summary === 'string' ? check.output.summary.slice(0, 8192) : '');
    failureFingerprint = fingerprintFailure({
      commandId: 'github-check:' + check.id,
      exitCode: 1,
      stdout: safeSummary,
      stderr: safeTitle,
    });
  }
  return normalizeCheckObservation({
    checkId: 'check:' + check.id,
    requiredCheckKey: context + (appId === null ? '|legacy' : '|app:' + appId),
    requiredWorkflowKey: null,
    provider: 'github-check',
    headSha: snapshot.headSha,
    baseSha: snapshot.baseSha,
    mergeSha: snapshot.mergeSha,
    testedSha,
    attemptKey: 'check:' + check.id,
    status: check.status,
    conclusion: completed ? check.conclusion : null,
    runnerOutcome: null,
    coversRelevantScope: false,
    protectedPathTouched: false,
    failureFingerprint,
  });
}

function mapCommitStatus(status, snapshot, testedSha) {
  if (!isRecord(status) || !sanitizeContext(status.context)) return null;
  const conclusion = conclusionForStatus(status.state);
  if (status.state !== 'pending' && conclusion === null) return null;
  const context = sanitizeContext(status.context);
  const creatorId = isPositiveInteger(status.creator?.id) ? status.creator.id : 'unknown';
  const identity = sha256(context + '|' + creatorId + '|' + (status.created_at ?? '')).slice(0, 32);
  const completed = status.state !== 'pending';
  let failureFingerprint = null;
  if (completed && conclusion === 'failure') {
    const safeDescription = redactVerificationOutput(typeof status.description === 'string' ? status.description.slice(0, 8192) : '');
    failureFingerprint = fingerprintFailure({
      commandId: 'commit-status:' + identity,
      exitCode: 1,
      stdout: safeDescription,
      stderr: context,
    });
  }
  return normalizeCheckObservation({
    checkId: 'status:' + identity,
    requiredCheckKey: context + '|legacy',
    requiredWorkflowKey: null,
    provider: 'external',
    headSha: snapshot.headSha,
    baseSha: snapshot.baseSha,
    mergeSha: snapshot.mergeSha,
    testedSha,
    attemptKey: 'status:' + identity,
    status: completed ? 'completed' : 'in_progress',
    conclusion: completed ? conclusion : null,
    runnerOutcome: null,
    coversRelevantScope: false,
    protectedPathTouched: false,
    failureFingerprint,
  });
}

function findEndOfCentralDirectory(bytes) {
  const earliest = Math.max(0, bytes.length - 65_557);
  for (let offset = bytes.length - 22; offset >= earliest; offset -= 1) {
    if (bytes.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  return -1;
}

function extractZipEntries(bytes) {
  const endOffset = findEndOfCentralDirectory(bytes);
  if (endOffset < 0) fail('invalid_log_archive');
  const disk = bytes.readUInt16LE(endOffset + 4);
  const centralDisk = bytes.readUInt16LE(endOffset + 6);
  const diskEntries = bytes.readUInt16LE(endOffset + 8);
  const entryCount = bytes.readUInt16LE(endOffset + 10);
  const centralSize = bytes.readUInt32LE(endOffset + 12);
  const centralOffset = bytes.readUInt32LE(endOffset + 16);
  const commentLength = bytes.readUInt16LE(endOffset + 20);
  if (disk !== 0 || centralDisk !== 0 || diskEntries !== entryCount || entryCount > 200
      || entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff
      || endOffset + 22 + commentLength > bytes.length || centralOffset + centralSize > endOffset) {
    fail('invalid_log_archive');
  }

  const entries = [];
  let cursor = centralOffset;
  let expandedTotal = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > bytes.length || bytes.readUInt32LE(cursor) !== 0x02014b50) fail('invalid_log_archive');
    const flags = bytes.readUInt16LE(cursor + 8);
    const method = bytes.readUInt16LE(cursor + 10);
    const compressedSize = bytes.readUInt32LE(cursor + 20);
    const uncompressedSize = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const entryCommentLength = bytes.readUInt16LE(cursor + 32);
    const localOffset = bytes.readUInt32LE(cursor + 42);
    const nextCursor = cursor + 46 + nameLength + extraLength + entryCommentLength;
    if (nextCursor > bytes.length || compressedSize === 0xffffffff || uncompressedSize === 0xffffffff
        || localOffset === 0xffffffff || (flags & 1) !== 0 || ![0, 8].includes(method)) {
      fail('invalid_log_archive');
    }
    let name;
    try {
      name = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    } catch {
      fail('invalid_log_archive');
    }
    if (name.startsWith('/') || name.includes('\\') || /[\x00-\x1f\x7f]/.test(name)
        || name.split('/').some((part) => part === '..' || part === '.')) fail('invalid_log_archive');
    expandedTotal += uncompressedSize;
    if (expandedTotal > MAX_LOG_EXPANDED_BYTES) fail('response_too_large');

      if (!name.endsWith('/')) {
        if (localOffset + 30 > bytes.length || bytes.readUInt32LE(localOffset) !== 0x04034b50) fail('invalid_log_archive');
        const localFlags = bytes.readUInt16LE(localOffset + 6);
        const localMethod = bytes.readUInt16LE(localOffset + 8);
        const localNameLength = bytes.readUInt16LE(localOffset + 26);
        const localExtraLength = bytes.readUInt16LE(localOffset + 28);
        const dataStart = localOffset + 30 + localNameLength + localExtraLength;
        const dataEnd = dataStart + compressedSize;
        if (dataEnd > bytes.length || dataStart < 0 || (localFlags & 1) !== 0 || localMethod !== method) fail('invalid_log_archive');
        let localName;
        try {
          localName = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(localOffset + 30, localOffset + 30 + localNameLength));
        } catch {
          fail('invalid_log_archive');
        }
        if (localName !== name) fail('invalid_log_archive');
      const compressed = bytes.subarray(dataStart, dataEnd);
      let content;
      try {
        content = method === 0
          ? Buffer.from(compressed)
          : inflateRawSync(compressed, { maxOutputLength: Math.min(MAX_LOG_EXPANDED_BYTES, uncompressedSize + 1) });
      } catch {
        fail('invalid_log_archive');
      }
      if (content.length !== uncompressedSize) fail('invalid_log_archive');
      entries.push({ path: name, content });
    }
    cursor = nextCursor;
  }
  if (cursor !== centralOffset + centralSize) fail('invalid_log_archive');
  return entries;
}

function decodeLogBody(bytes, contentType, maxBytes) {
  let rawFiles;
  const isZip = bytes.length >= 4 && bytes.readUInt32LE(0) === 0x04034b50;
  if (isZip || /zip|octet-stream/i.test(contentType)) rawFiles = extractZipEntries(bytes);
  else if (/text\//i.test(contentType) || contentType === '' || contentType.includes('json')) rawFiles = [{ path: 'job.log', content: bytes }];
  else fail('invalid_log_archive');

  const files = [];
  let used = 0;
  let truncated = false;
  for (const file of rawFiles) {
    if (used >= maxBytes) {
      truncated = true;
      break;
    }
    const rawText = file.content.toString('utf8');
    const safeText = redactVerificationOutput(rawText);
    const safeBytes = Buffer.from(safeText, 'utf8');
    const remaining = maxBytes - used;
    const chunk = safeBytes.subarray(0, remaining);
    if (chunk.length < safeBytes.length) truncated = true;
    files.push({ path: file.path, text: chunk.toString('utf8') });
    used += chunk.length;
  }
  return { files, truncated };
}

export function createGitHubPrClient(options) {
  const allowedOptions = new Set(['repository', 'getToken', 'apiOrigin', 'graphqlOrigin', 'fetchImpl', 'downloadHostAllowlist']);
  if (!isRecord(options) || Object.keys(options).some((key) => !allowedOptions.has(key))) fail('invalid_configuration');
  const parsedRepository = parseRepository(options.repository);
  const apiOrigin = options.apiOrigin ?? API_ORIGIN;
  const graphqlOrigin = options.graphqlOrigin ?? API_ORIGIN + '/graphql';
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const getToken = options.getToken;
  const downloadHostAllowlist = options.downloadHostAllowlist ?? [];

  let parsedApi;
  let parsedGraphql;
  try {
    parsedApi = new URL(apiOrigin);
    parsedGraphql = new URL(graphqlOrigin);
  } catch {
    fail('invalid_configuration');
  }
  if (parsedApi.origin !== API_ORIGIN || parsedApi.href !== API_ORIGIN + '/'
      || parsedGraphql.origin !== API_ORIGIN || parsedGraphql.href !== API_ORIGIN + '/graphql'
      || typeof getToken !== 'function' || typeof fetchImpl !== 'function'
      || !Array.isArray(downloadHostAllowlist)
      || downloadHostAllowlist.some((host) => typeof host !== 'string' || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(host))) {
    fail('invalid_configuration');
  }

  const allowedDownloadHosts = new Set(downloadHostAllowlist.map((host) => host.toLowerCase()));
  const repositoryPath = '/repos/' + encodeURIComponent(parsedRepository.owner) + '/' + encodeURIComponent(parsedRepository.name);
  let activePrNumber = null;
  let activeSnapshot = null;
  const observedWorkflowRuns = new Map();

  async function authenticatedFetch(urlValue, init = {}) {
    let url;
    try {
      url = new URL(urlValue, API_ORIGIN);
    } catch {
      fail('invalid_configuration');
    }
    if (url.origin !== API_ORIGIN || url.username || url.password || url.hash) fail('invalid_configuration');
    let token;
    try {
      token = await getToken('observe');
    } catch {
      fail('unauthorized');
    }
    if (typeof token !== 'string' || token.length === 0 || token.length > 8192) fail('unauthorized');
    let response;
    try {
      response = await fetchImpl(url, {
        ...init,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: 'Bearer ' + token,
          'X-GitHub-Api-Version': API_VERSION,
          ...(init.headers ?? {}),
        },
        redirect: 'manual',
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      fail('network_error');
    }
    return response;
  }

  async function apiJson(url, init = {}) {
    const response = await authenticatedFetch(url, init);
    if (response.status >= 300 && response.status < 400) fail('redirect_rejected');
    if (!response.ok) fail(codeForStatus(response));
    return readJson(response);
  }

  async function paginate(path, listKey, fixedParams = {}, constraints = {}) {
    let url = new URL(path, API_ORIGIN);
    for (const [key, value] of Object.entries(fixedParams)) url.searchParams.set(key, String(value));
    url.searchParams.set('per_page', String(PAGE_SIZE));
    url.searchParams.set('page', '1');
    const values = [];
    let page = 1;
    let complete = true;
    let expectedTotal = null;
    while (page <= MAX_PAGES) {
      let response;
      try {
        response = await authenticatedFetch(url);
        if (response.status >= 300 && response.status < 400) fail('redirect_rejected');
        if (!response.ok) fail(codeForStatus(response));
      } catch (error) {
        if (page > 1 && error instanceof GitHubPrClientError) {
          complete = false;
          break;
        }
        throw error;
      }
      let body;
      let pageValues;
      let next;
      try {
        body = await readJson(response);
        pageValues = Array.isArray(body) ? body : body?.[listKey];
        if (!Array.isArray(pageValues) || pageValues.length > PAGE_SIZE) fail('invalid_response');
        if (constraints.expectedSha && normalizeSha(body.sha) !== constraints.expectedSha) fail('invalid_response');
        if (!Array.isArray(body) && body.total_count !== undefined) {
          if (!Number.isSafeInteger(body.total_count) || body.total_count < 0
              || (expectedTotal !== null && expectedTotal !== body.total_count)) fail('invalid_response');
          expectedTotal = body.total_count;
        }
        next = parseNextLink(response.headers.get('link'), url, page);
      } catch (error) {
        if (page > 1 && error instanceof GitHubPrClientError) {
          complete = false;
          break;
        }
        throw error;
      }
      values.push(...pageValues);
      if (values.length > MAX_PAGES * PAGE_SIZE) fail('pagination_limit');
      if (!next) break;
      if (page === MAX_PAGES) {
        complete = false;
        break;
      }
      page += 1;
      url = next;
    }
    if (expectedTotal !== null && values.length < expectedTotal) complete = false;
    return { values, complete };
  }

  async function readPullRequest(prNumber) {
    if (!isPositiveInteger(prNumber)) fail('invalid_options');
    const [rest, graphql] = await Promise.all([
      apiJson(repositoryPath + '/pulls/' + prNumber),
      apiJson('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: GRAPHQL_PULL_REQUEST_QUERY,
          variables: { owner: parsedRepository.owner, name: parsedRepository.name, number: prNumber },
        }),
      }),
    ]);
    const graph = graphql?.data?.repository?.pullRequest;
    if (graphql?.errors?.length || !isRecord(rest) || !isRecord(graph)
        || rest.number !== prNumber || !isRecord(rest.base) || !isRecord(rest.head)
        || !isRecord(rest.base.repo) || !isRecord(rest.head.repo)
        || !isRecord(graph.baseRepository) || !isRecord(graph.headRepository)) {
      fail('invalid_response');
    }

    const restRepository = repositoryName(rest.base.repo.full_name);
    const graphRepository = repositoryName(graph.baseRepository.nameWithOwner);
    if (restRepository !== parsedRepository.fullName || graphRepository !== parsedRepository.fullName) {
      fail('repository_mismatch');
    }
    if (!isPositiveInteger(rest.base.repo.id) || !isPositiveInteger(graph.baseRepository.databaseId)
        || rest.base.repo.id !== graph.baseRepository.databaseId) fail('invalid_response');
    if (repositoryName(rest.head.repo.full_name) !== repositoryName(graph.headRepository.nameWithOwner)
        || rest.base.ref !== graph.baseRefName || rest.head.ref !== graph.headRefName
        || normalizeSha(rest.base.sha) !== normalizeSha(graph.baseRefOid)
        || normalizeSha(rest.head.sha) !== normalizeSha(graph.headRefOid)) {
      fail('pr_tuple_mismatch');
    }
    if (isPositiveInteger(rest.head.repo.id) && isPositiveInteger(graph.headRepository.databaseId)
        && rest.head.repo.id !== graph.headRepository.databaseId) fail('repository_mismatch');

    const mergeSha = isRecord(graph.potentialMergeCommit) ? normalizeSha(graph.potentialMergeCommit.oid) : null;
    const graphState = graph.state === 'OPEN' ? 'open' : graph.state === 'CLOSED' ? 'closed' : null;
    const updatedAt = stableTimestamp(rest.updated_at);
    if (!graphState || typeof graph.isDraft !== 'boolean' || !updatedAt
        || (graph.mergeable !== 'MERGEABLE' && graph.mergeable !== 'CONFLICTING' && graph.mergeable !== 'UNKNOWN')) {
      fail('invalid_response');
    }
    let normalized;
    try {
      normalized = normalizePrSnapshot({
        repository: parsedRepository.fullName,
        number: prNumber,
        state: graphState,
        draft: graph.isDraft,
        baseRef: rest.base.ref,
        baseSha: rest.base.sha,
        headRef: rest.head.ref,
        headSha: rest.head.sha,
        mergeSha,
        headRepository: rest.head.repo.full_name,
        updatedAt,
      });
    } catch {
      fail('invalid_response');
    }
    return Object.freeze({
      ...normalized,
      repositoryId: rest.base.repo.id,
      baseRepositoryId: graph.baseRepository.databaseId,
      headRepositoryId: graph.headRepository.databaseId ?? rest.head.repo.id ?? null,
      mergeability: graph.potentialMergeCommit === undefined || graph.potentialMergeCommit === null ? 'UNKNOWN' : graph.mergeable,
      defaultBranch: typeof graph.baseRepository.defaultBranchRef?.name === 'string'
        ? graph.baseRepository.defaultBranchRef.name
        : null,
    });
  }

  async function refreshForCollection(testedSha) {
    if (!activePrNumber) fail('pr_snapshot_required');
    const snapshot = await readPullRequest(activePrNumber);
    activeSnapshot = snapshot;
    const tested = normalizeSha(testedSha);
    if (!tested || (tested !== snapshot.headSha && (snapshot.mergeSha === null || tested !== snapshot.mergeSha))) return null;
    return snapshot;
  }

  async function refreshAfterCollection(before) {
    const after = await readPullRequest(before.number);
    activeSnapshot = after;
    return sameTuple(normalizedTuple(before), normalizedTuple(after)) ? after : null;
  }

  function staleResult(reasonCode, snapshot = activeSnapshot) {
    return Object.freeze({
      status: 'stale',
      reasonCode,
      snapshot: snapshot ?? null,
      collectionStatus: 'unavailable',
      observations: Object.freeze([]),
    });
  }

  async function getPullRequest(prNumber) {
    const snapshot = await readPullRequest(prNumber);
    activePrNumber = prNumber;
    activeSnapshot = snapshot;
    return snapshot;
  }

  async function getPullRequestFiles(prNumber) {
    if (!isPositiveInteger(prNumber) || activePrNumber !== prNumber || !activeSnapshot) fail('pr_snapshot_required');
    const expected = activeSnapshot;
    const before = await readPullRequest(prNumber);
    activeSnapshot = before;
    if (!sameTuple(normalizedTuple(before), normalizedTuple(expected))) {
      return Object.freeze({
        status: 'stale',
        reasonCode: 'pr_tuple_changed',
        prNumber,
        snapshot: before,
        files: Object.freeze([]),
        collectionStatus: 'unavailable',
      });
    }

    const result = await paginate(repositoryPath + '/pulls/' + prNumber + '/files', 'files');
    const files = [];
    const seen = new Set();
    let complete = result.complete;
    for (const entry of result.values) {
      if (!isRecord(entry)) {
        complete = false;
        continue;
      }
      const filename = normalizeRepositoryFilename(entry.filename);
      const previousFilename = entry.previous_filename === undefined
        ? null
        : normalizeRepositoryFilename(entry.previous_filename);
      const status = typeof entry.status === 'string' ? entry.status : null;
      if (!filename || (entry.previous_filename !== undefined && !previousFilename)
          || !['added', 'modified', 'removed', 'renamed', 'copied', 'changed', 'unchanged'].includes(status)
          || (['renamed', 'copied'].includes(status) && !previousFilename)) {
        complete = false;
        continue;
      }
      const key = filename + '\0' + (previousFilename ?? '');
      if (seen.has(key)) {
        complete = false;
        continue;
      }
      seen.add(key);
      files.push(Object.freeze({ filename, previousFilename, status }));
    }

    const after = await readPullRequest(prNumber);
    activeSnapshot = after;
    if (!sameTuple(normalizedTuple(before), normalizedTuple(after))) {
      return Object.freeze({
        status: 'stale',
        reasonCode: 'pr_tuple_changed',
        prNumber,
        snapshot: after,
        files: Object.freeze([]),
        collectionStatus: 'unavailable',
      });
    }
    files.sort((left, right) => compareStrings(left.filename, right.filename)
      || compareStrings(left.previousFilename ?? '', right.previousFilename ?? ''));
    return Object.freeze({
      status: 'current',
      prNumber,
      snapshot: after,
      files: Object.freeze(files),
      collectionStatus: complete ? 'complete' : 'incomplete',
    });
  }

  async function getCommitCheckRuns(testedShaInput) {
    const testedSha = normalizeSha(testedShaInput);
    const before = await refreshForCollection(testedShaInput);
    if (!before) return staleResult('tested_sha_mismatch');
    const checkRunsPath = repositoryPath + '/commits/' + encodeURIComponent(testedSha) + '/check-runs';
    const statusPath = repositoryPath + '/commits/' + encodeURIComponent(testedSha) + '/status';
    const [checkRuns, statuses] = await Promise.all([
      paginate(checkRunsPath, 'check_runs'),
      paginate(statusPath, 'statuses', {}, { expectedSha: testedSha }),
    ]);
    const observations = [];
    let complete = checkRuns.complete && statuses.complete;
    for (const check of checkRuns.values) {
      const observation = mapCheckRun(check, before, testedSha);
      if (observation) observations.push(observation);
      else complete = false;
    }
    for (const status of statuses.values) {
      const observation = mapCommitStatus(status, before, testedSha);
      if (observation) observations.push(observation);
      else complete = false;
    }
    const after = await refreshAfterCollection(before);
    if (!after) return staleResult('pr_tuple_changed');
    observations.sort((left, right) => compareStrings(left.checkId, right.checkId));
    return Object.freeze({
      status: 'current',
      snapshot: after,
      testedSha,
      observations: Object.freeze(observations),
      collectionStatus: complete ? 'complete' : 'incomplete',
      checkCollectionComplete: complete,
    });
  }

  async function getWorkflowRuns(testedShaInput) {
    const testedSha = normalizeSha(testedShaInput);
    const before = await refreshForCollection(testedShaInput);
    if (!before) return staleResult('tested_sha_mismatch');
    const result = await paginate(repositoryPath + '/actions/runs', 'workflow_runs', { head_sha: testedSha });
    let complete = result.complete;
    const runs = [];
    for (const run of result.values) {
      if (!isRecord(run) || !isPositiveInteger(run.id)) {
        complete = false;
        continue;
      }
      const headSha = normalizeSha(run.head_sha);
      const workflow = parseWorkflowPath(run.path);
      if (headSha !== testedSha || !workflow) {
        complete = false;
        continue;
      }
      const repositoryId = isPositiveInteger(run.repository?.id) ? run.repository.id
        : isPositiveInteger(run.repository_id) ? run.repository_id
          : null;
      const item = Object.freeze({
        id: run.id,
        repositoryId,
        path: workflow.path,
        ref: workflow.ref,
        workflowId: isPositiveInteger(run.workflow_id) ? run.workflow_id : null,
        event: typeof run.event === 'string' ? run.event : null,
        headSha,
        testedSha,
        sourceSha: null,
        sourceShaAttested: false,
        runNumber: isPositiveInteger(run.run_number) ? run.run_number : null,
        runAttempt: isPositiveInteger(run.run_attempt) ? run.run_attempt : 1,
        status: typeof run.status === 'string' ? run.status : 'unknown',
        conclusion: typeof run.conclusion === 'string' ? run.conclusion : null,
        createdAt: stableTimestamp(run.created_at),
        updatedAt: stableTimestamp(run.updated_at),
      });
      runs.push(item);
      observedWorkflowRuns.set(run.id, { run: item, snapshot: before });
    }
    const after = await refreshAfterCollection(before);
    if (!after) return staleResult('pr_tuple_changed');
    runs.sort((left, right) => left.id - right.id);
    return Object.freeze({
      status: 'current',
      snapshot: after,
      testedSha,
      runs: Object.freeze(runs),
      collectionStatus: complete ? 'complete' : 'incomplete',
      checkCollectionComplete: complete,
    });
  }

  async function getRequiredWorkflowEvidence(requiredWorkflowInput, testedShaInput) {
    let requiredWorkflow;
    try {
      requiredWorkflow = canonicalRequiredWorkflow(requiredWorkflowInput);
    } catch {
      return Object.freeze({ status: 'unavailable', reasonCode: 'required_workflow_invalid', testedSha: null, sourceSha: null });
    }
    const testedSha = normalizeSha(testedShaInput);
    const requiredWorkflowKey = requiredWorkflow.key;
    const collection = await getWorkflowRuns(testedShaInput);
    if (collection.status === 'stale') {
      return Object.freeze({ ...collection, requiredWorkflowKey, testedSha, sourceSha: null });
    }
    const matches = collection.runs.filter((run) => run.repositoryId === requiredWorkflow.repositoryId
      && run.path === requiredWorkflow.path && run.ref === requiredWorkflow.ref && run.testedSha === testedSha);
    if (collection.collectionStatus !== 'complete') {
      return Object.freeze({
        status: 'unavailable',
        reasonCode: 'workflow_collection_incomplete',
        requiredWorkflowKey,
        testedSha,
        sourceSha: null,
      });
    }
    if (matches.length === 0) {
      return Object.freeze({
        status: 'unavailable',
        reasonCode: 'required_workflow_not_found',
        requiredWorkflowKey,
        testedSha,
        sourceSha: null,
      });
    }
    return Object.freeze({
      status: 'unavailable',
      reasonCode: 'workflow_source_sha_unattested',
      requiredWorkflowKey,
      testedSha,
      sourceSha: null,
    });
  }

  async function getWorkflowRunJobs(runId) {
    if (!isPositiveInteger(runId) || !observedWorkflowRuns.has(runId)) fail('run_not_observed');
    const observed = observedWorkflowRuns.get(runId);
    const before = await readPullRequest(observed.snapshot.number);
    activeSnapshot = before;
    if (!sameTuple(normalizedTuple(before), normalizedTuple(observed.snapshot))) fail('stale_pr_snapshot');
    const result = await paginate(repositoryPath + '/actions/runs/' + runId + '/jobs', 'jobs');
    const jobs = [];
    let complete = result.complete;
    for (const job of result.values) {
      if (!isRecord(job) || !isPositiveInteger(job.id) || job.run_id !== runId) {
        complete = false;
        continue;
      }
      jobs.push(Object.freeze({
        id: job.id,
        runId,
        name: typeof job.name === 'string' ? job.name.slice(0, 255) : 'unknown',
        status: typeof job.status === 'string' ? job.status : 'unknown',
        conclusion: typeof job.conclusion === 'string' ? job.conclusion : null,
        startedAt: stableTimestamp(job.started_at),
        completedAt: stableTimestamp(job.completed_at),
        steps: Object.freeze(Array.isArray(job.steps) ? job.steps.slice(0, 100).map((step) => Object.freeze({
          number: isPositiveInteger(step?.number) ? step.number : null,
          name: typeof step?.name === 'string' ? step.name.slice(0, 255) : 'unknown',
          status: typeof step?.status === 'string' ? step.status : 'unknown',
          conclusion: typeof step?.conclusion === 'string' ? step.conclusion : null,
        })) : []),
      }));
    }
    const after = await readPullRequest(observed.snapshot.number);
    activeSnapshot = after;
    if (!sameTuple(normalizedTuple(before), normalizedTuple(after))) fail('stale_pr_snapshot');
    return Object.freeze({
      runId,
      snapshot: after,
      jobs: Object.freeze(jobs),
      collectionStatus: complete ? 'complete' : 'incomplete',
      checkCollectionComplete: complete,
    });
  }

  async function getRequiredCheckSnapshot(input) {
    if (!isRecord(input) || Object.keys(input).some((key) => !['baseRef', 'headSha'].includes(key))
        || typeof input.baseRef !== 'string' || !normalizeSha(input.headSha)) fail('invalid_options');
    if (!activePrNumber) fail('pr_snapshot_required');
    const before = await readPullRequest(activePrNumber);
    activeSnapshot = before;
    if (before.baseRef !== input.baseRef || before.headSha !== normalizeSha(input.headSha)) fail('stale_pr_snapshot');

    let complete = true;
    let branchProtection = null;
    const sources = [];
    const requiredChecks = [];
    const requiredWorkflows = [];
    const repoPath = repositoryPath;
    const [repoResult, protectionResult, rulesetResult] = await Promise.all([
      (async () => {
        try { return { value: await apiJson(repoPath), complete: true }; }
        catch { return { value: null, complete: false }; }
      })(),
      (async () => {
        try {
          const response = await authenticatedFetch(repoPath + '/branches/' + encodeURIComponent(input.baseRef) + '/protection');
          if (response.status === 404) return { value: null, complete: true };
          if (!response.ok || response.status >= 300) return { value: null, complete: false };
          try { return { value: await readJson(response), complete: true }; }
          catch { return { value: null, complete: false }; }
        } catch {
          return { value: null, complete: false };
        }
      })(),
      (async () => {
        try { return await paginate(repoPath + '/rulesets', null, { includes_parents: 'true' }); }
        catch { return { values: [], complete: false }; }
      })(),
    ]);
    if (!repoResult.complete || !isRecord(repoResult.value) || repoResult.value.id !== before.repositoryId) complete = false;
    if (!protectionResult.complete) complete = false;
    if (!rulesetResult.complete) complete = false;

    if (protectionResult.value !== null) {
      const parsed = parseBranchProtectionChecks(protectionResult.value);
      if (!parsed.valid) complete = false;
      else {
        requiredChecks.push(...parsed.checks);
        branchProtection = { requiredChecks: parsed.checks, strict: parsed.strict };
        sources.push({ type: 'branch-protection', requiredChecks: parsed.checks, strict: parsed.strict });
      }
    } else {
      sources.push({ type: 'branch-protection', requiredChecks: [], strict: false });
    }

    const rulesets = [];
    if (rulesetResult.values.length > MAX_RULESET_DETAILS) complete = false;
    for (const listed of rulesetResult.values.slice(0, MAX_RULESET_DETAILS)) {
      if (!isRecord(listed) || !isPositiveInteger(listed.id)) {
        complete = false;
        continue;
      }
      let ruleset;
      try {
        ruleset = await apiJson(repoPath + '/rulesets/' + listed.id);
      } catch {
        complete = false;
        continue;
      }
      if (!isRecord(ruleset) || ruleset.id !== listed.id || !Array.isArray(ruleset.rules)) {
        complete = false;
        continue;
      }
      const applies = rulesetApplies(ruleset, input.baseRef, repoResult.value?.default_branch, {
        id: before.repositoryId,
        fullName: parsedRepository.fullName,
      });
      if (applies === null) {
        complete = false;
        continue;
      }
      if (applies === false) continue;
      let rulesetComplete = true;
      const ruleSources = [];
      for (const rule of ruleset.rules) {
        if (rule?.type === 'required_status_checks') {
          const parsed = parseRequiredStatusChecks(rule);
          if (!parsed.valid) {
            complete = false;
            rulesetComplete = false;
            continue;
          }
          requiredChecks.push(...parsed.checks);
          ruleSources.push({ type: rule.type, checks: parsed.checks, ruleFingerprint: sha256(canonicalJson(rule)) });
        } else if (rule?.type === 'required_workflows') {
          const parsed = parseRequiredWorkflows(rule);
          if (!parsed.valid) {
            complete = false;
            rulesetComplete = false;
            continue;
          }
          requiredWorkflows.push(...parsed.workflows);
          ruleSources.push({ type: rule.type, workflows: parsed.workflows, ruleFingerprint: sha256(canonicalJson(rule)) });
        } else if (!isRecord(rule) || typeof rule.type !== 'string') {
          complete = false;
          rulesetComplete = false;
        } else {
          ruleSources.push({ type: rule.type, ruleFingerprint: sha256(canonicalJson(rule)) });
        }
      }
      if (rulesetComplete) {
        const { id, target, enforcement, conditions } = ruleset;
        rulesets.push({ id, target, enforcement, conditions: conditions ?? null, rules: ruleSources });
      }
    }

    const workflowSourceRepositories = [...new Set(requiredWorkflows.map((workflow) => workflow.repositoryId))]
      .filter((id) => id !== before.repositoryId)
      .sort((left, right) => left - right);
    if (workflowSourceRepositories.length > MAX_WORKFLOW_SOURCE_REPOSITORIES) complete = false;
    const sourceResults = await Promise.all(workflowSourceRepositories.slice(0, MAX_WORKFLOW_SOURCE_REPOSITORIES).map(async (sourceRepositoryId) => {
      try {
        const sourceRepository = await apiJson('/repositories/' + sourceRepositoryId);
        return { repositoryId: sourceRepositoryId, accessible: isRecord(sourceRepository) && sourceRepository.id === sourceRepositoryId };
      } catch {
        return { repositoryId: sourceRepositoryId, accessible: false };
      }
    }));
    for (const source of sourceResults) {
      sources.push({ type: 'workflow-source', repositoryId: source.repositoryId, accessible: source.accessible });
      if (!source.accessible) complete = false;
    }
    sources.push(...rulesets);

    const after = await readPullRequest(before.number);
    activeSnapshot = after;
    if (!sameTuple(normalizedTuple(before), normalizedTuple(after)) || before.baseRef !== after.baseRef) fail('stale_pr_snapshot');

    const uniqueChecks = new Map();
    for (const check of requiredChecks) {
      const key = check.context + (check.appId === null ? '|legacy' : '|app:' + check.appId);
      uniqueChecks.set(key, check);
    }
    const uniqueWorkflows = new Map();
    for (const workflow of requiredWorkflows) {
      try {
        const normalized = canonicalRequiredWorkflow(workflow);
        uniqueWorkflows.set(normalized.key, {
          repositoryId: normalized.repositoryId,
          path: normalized.path,
          ref: normalized.ref,
          sha: normalized.sha,
        });
      } catch {
        complete = false;
      }
    }

    const fingerprint = sha256(canonicalJson({
      repository: parsedRepository.fullName,
      repositoryId: before.repositoryId,
      baseRef: input.baseRef,
      sources: sources.sort((left, right) => compareStrings(canonicalJson(left), canonicalJson(right))),
      collectionStatus: complete ? 'complete' : 'unavailable',
    }));
    const normalized = normalizeRequiredCheckSnapshot({
      baseRef: input.baseRef,
      policyFingerprint: fingerprint,
      requiredChecks: [...uniqueChecks.values()].sort((left, right) => compareStrings(left.context, right.context)
        || (left.appId ?? 0) - (right.appId ?? 0)),
      requiredWorkflows: [...uniqueWorkflows.values()],
      collectionStatus: complete ? 'complete' : 'unavailable',
    });
    return Object.freeze({
      ...normalized,
      requiredChecks: Object.freeze([...uniqueChecks.values()].sort((left, right) => compareStrings(left.context, right.context)
        || (left.appId ?? 0) - (right.appId ?? 0))),
      requiredWorkflows: Object.freeze([...uniqueWorkflows.values()].sort((left, right) => compareStrings(left.path, right.path)
        || compareStrings(left.ref, right.ref) || compareStrings(left.sha, right.sha))),
      branchProtection: branchProtection === null ? null : Object.freeze(branchProtection),
    });
  }

  async function getJobLog(jobId, requestOptions = {}) {
    if (!isPositiveInteger(jobId)) fail('invalid_options');
    if (!isRecord(requestOptions) || Object.keys(requestOptions).some((key) => key !== 'maxBytes')) fail('invalid_options');
    const maxBytes = requestOptions.maxBytes ?? DEFAULT_LOG_OUTPUT_BYTES;
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_LOG_OUTPUT_BYTES) fail('invalid_options');
    const response = await authenticatedFetch(repositoryPath + '/actions/jobs/' + jobId + '/logs', { headers: { Accept: '*/*' } });
    let logResponse = response;
    if (response.status === 302) {
      const location = response.headers.get('location');
      let target;
      try { target = new URL(location); } catch { fail('log_redirect_rejected'); }
      if (target.protocol !== 'https:' || !allowedDownloadHosts.has(target.hostname.toLowerCase())
          || target.username || target.password || target.hash || target.port && target.port !== '443') {
        fail('log_redirect_rejected');
      }
      try {
        logResponse = await fetchImpl(target, {
          method: 'GET',
          headers: { Accept: '*/*' },
          redirect: 'manual',
          signal: AbortSignal.timeout(15_000),
        });
      } catch {
        fail('network_error');
      }
      if (logResponse.status >= 300 && logResponse.status < 400) fail('redirect_rejected');
    } else if (response.status >= 300 && response.status < 400) {
      fail('redirect_rejected');
    }
    if (!logResponse.ok) fail(codeForStatus(logResponse));
    const bytes = await readBoundedBytes(logResponse, MAX_LOG_ARCHIVE_BYTES);
    const decoded = decodeLogBody(bytes, logResponse.headers.get('content-type') ?? '', maxBytes);
    return Object.freeze({ jobId, files: Object.freeze(decoded.files.map((file) => Object.freeze(file))), truncated: decoded.truncated });
  }

  async function getReviewMetadata(prNumber) {
    if (!isPositiveInteger(prNumber)) fail('invalid_options');
    const [reviews, comments] = await Promise.all([
      paginate(repositoryPath + '/pulls/' + prNumber + '/reviews', null),
      paginate(repositoryPath + '/pulls/' + prNumber + '/comments', null),
    ]);
    let complete = reviews.complete && comments.complete;
    const safeReviews = [];
    const safeComments = [];
    for (const review of reviews.values) {
      if (!isRecord(review) || !isPositiveInteger(review.id) || !isRecord(review.user)) {
        complete = false;
        continue;
      }
      safeReviews.push(Object.freeze({
        id: review.id,
        author: Object.freeze({ id: isPositiveInteger(review.user.id) ? review.user.id : null, login: typeof review.user.login === 'string' ? review.user.login.slice(0, 100) : null }),
        state: typeof review.state === 'string' ? review.state : 'unknown',
        submittedAt: stableTimestamp(review.submitted_at),
        commitSha: normalizeSha(review.commit_id),
      }));
    }
    for (const comment of comments.values) {
      if (!isRecord(comment) || !isPositiveInteger(comment.id) || !isRecord(comment.user)
          || typeof comment.path !== 'string' || /[\x00-\x1f\x7f]/.test(comment.path)) {
        complete = false;
        continue;
      }
      safeComments.push(Object.freeze({
        id: comment.id,
        reviewId: isPositiveInteger(comment.pull_request_review_id) ? comment.pull_request_review_id : null,
        author: Object.freeze({ id: isPositiveInteger(comment.user.id) ? comment.user.id : null, login: typeof comment.user.login === 'string' ? comment.user.login.slice(0, 100) : null }),
        createdAt: stableTimestamp(comment.created_at),
        updatedAt: stableTimestamp(comment.updated_at),
        commitSha: normalizeSha(comment.commit_id),
        path: comment.path.slice(0, 1024),
        line: isPositiveInteger(comment.line) ? comment.line : null,
        originalLine: isPositiveInteger(comment.original_line) ? comment.original_line : null,
      }));
    }
    safeReviews.sort((left, right) => left.id - right.id);
    safeComments.sort((left, right) => left.id - right.id);
    return Object.freeze({
      prNumber,
      reviews: Object.freeze(safeReviews),
      reviewComments: Object.freeze(safeComments),
      collectionStatus: complete ? 'complete' : 'incomplete',
    });
  }

  return Object.freeze({
    getPullRequest,
    getPullRequestFiles,
    getCommitCheckRuns,
    getWorkflowRuns,
    getRequiredWorkflowEvidence,
    getWorkflowRunJobs,
    getRequiredCheckSnapshot,
    getJobLog,
    getReviewMetadata,
  });
}
