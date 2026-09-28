const REVISION_PATTERN = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i;
const FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/i;
const STABLE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/;
const PR_STATES = new Set(['open', 'closed']);
const COLLECTION_STATUSES = new Set(['complete', 'incomplete', 'unavailable']);
const PROVIDERS = new Set(['github-actions', 'github-check', 'external']);
const CHECK_STATUSES = new Set(['queued', 'in_progress', 'completed']);
const CONCLUSIONS = new Set([
  'success',
  'failure',
  'cancelled',
  'timed_out',
  'action_required',
  'neutral',
  'skipped',
]);
const RUNNER_OUTCOMES = new Set(['check_failed', 'runner_error', 'network_error']);
const PR_KEYS = Object.freeze([
  'repository',
  'number',
  'state',
  'draft',
  'baseRef',
  'baseSha',
  'headRef',
  'headSha',
  'mergeSha',
  'headRepository',
  'updatedAt',
]);
const REQUIRED_CHECK_KEYS = Object.freeze([
  'baseRef',
  'policyFingerprint',
  'requiredChecks',
  'requiredWorkflows',
  'collectionStatus',
]);
const OBSERVATION_REQUIRED_KEYS = Object.freeze([
  'checkId',
  'requiredCheckKey',
  'requiredWorkflowKey',
  'provider',
  'headSha',
  'baseSha',
  'mergeSha',
  'testedSha',
  'attemptKey',
  'status',
  'conclusion',
  'runnerOutcome',
  'coversRelevantScope',
  'protectedPathTouched',
  'failureFingerprint',
]);
const OBSERVATION_OPTIONAL_KEYS = Object.freeze(['previouslyPassedRevision']);

export class PrEvidenceError extends TypeError {
  constructor(message) {
    super(message);
    this.name = 'PrEvidenceError';
  }
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertExactKeys(value, requiredKeys, optionalKeys = []) {
  if (!isPlainObject(value)) throw new PrEvidenceError('input must be a plain object');

  const allowedKeys = new Set([...requiredKeys, ...optionalKeys]);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    throw new PrEvidenceError('input contains unsupported fields');
  }
  if (requiredKeys.some((key) => !Object.hasOwn(value, key))) {
    throw new PrEvidenceError('input is missing required fields');
  }
}

function normalizeRevision(value, fieldName) {
  if (typeof value !== 'string' || !REVISION_PATTERN.test(value)) {
    throw new PrEvidenceError(`${fieldName} must be a full hexadecimal revision`);
  }
  return value.toLowerCase();
}

function normalizeRef(value, fieldName) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 255
      || value === '@' || value.startsWith('/') || value.endsWith('/')
      || value.includes('//') || value.includes('..') || value.includes('@{')
      || /[\x00-\x20\x7f~^:?*[\\]/.test(value)) {
    throw new PrEvidenceError(`${fieldName} must be a safe Git ref`);
  }

  const segments = value.split('/');
  if (segments.some((segment) => segment.length === 0
      || segment.startsWith('.') || segment.endsWith('.') || segment.endsWith('.lock'))) {
    throw new PrEvidenceError(`${fieldName} must be a safe Git ref`);
  }
  return value;
}

function normalizeRepository(value, fieldName) {
  if (typeof value !== 'string') throw new PrEvidenceError(`${fieldName} must use owner/name form`);
  const parts = value.split('/');
  if (parts.length !== 2 || parts.some((part) => part.length === 0 || part.length > 100
      || !/^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/.test(part)
      || part.includes('..'))) {
    throw new PrEvidenceError(`${fieldName} must use a safe owner/name form`);
  }
  return `${parts[0].toLowerCase()}/${parts[1].toLowerCase()}`;
}

function normalizeTimestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    throw new PrEvidenceError('updatedAt must be a canonical UTC timestamp');
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) {
    throw new PrEvidenceError('updatedAt must be a canonical UTC timestamp');
  }
  return value;
}

function normalizeStableId(value, fieldName) {
  if (typeof value !== 'string' || !STABLE_ID_PATTERN.test(value)) {
    throw new PrEvidenceError(`${fieldName} must be a stable identifier`);
  }
  return value;
}

function normalizeRequiredCheckKey(value) {
  if (value === null) return null;
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value || /[\x00-\x1f\x7f]/.test(value)) {
    throw new PrEvidenceError('requiredCheckKey must be a canonical key or null');
  }
  return value;
}

export function normalizePrSnapshot(input) {
  assertExactKeys(input, PR_KEYS);

  if (!Number.isSafeInteger(input.number) || input.number < 1) {
    throw new PrEvidenceError('number must be a positive safe integer');
  }
  if (!PR_STATES.has(input.state)) throw new PrEvidenceError('state is unsupported');
  if (typeof input.draft !== 'boolean') throw new PrEvidenceError('draft must be a boolean');

  return Object.freeze({
    repository: normalizeRepository(input.repository, 'repository'),
    number: input.number,
    state: input.state,
    draft: input.draft,
    baseRef: normalizeRef(input.baseRef, 'baseRef'),
    baseSha: normalizeRevision(input.baseSha, 'baseSha'),
    headRef: normalizeRef(input.headRef, 'headRef'),
    headSha: normalizeRevision(input.headSha, 'headSha'),
    mergeSha: input.mergeSha === null ? null : normalizeRevision(input.mergeSha, 'mergeSha'),
    headRepository: normalizeRepository(input.headRepository, 'headRepository'),
    updatedAt: normalizeTimestamp(input.updatedAt),
  });
}

function normalizeRequiredCheck(value) {
  assertExactKeys(value, ['context', 'appId']);
  if (typeof value.context !== 'string' || value.context.trim().length === 0
      || value.context.length > 255 || /[\x00-\x1f\x7f]/.test(value.context)) {
    throw new PrEvidenceError('required check context must be a non-empty canonical value');
  }
  const context = value.context.trim();
  if (value.appId !== null && (!Number.isSafeInteger(value.appId) || value.appId < 1)) {
    throw new PrEvidenceError('required check appId must be a positive safe integer or null');
  }
  return value.appId === null ? `${context}|legacy` : `${context}|app:${value.appId}`;
}

function normalizeWorkflowPath(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 255
      || value.trim() !== value || value.includes('\\') || /[\x00-\x1f\x7f]/.test(value)) {
    throw new PrEvidenceError('required workflow path must be a canonical repository-relative path');
  }
  const segments = value.split('/');
  if (segments.length < 3 || segments[0] !== '.github' || segments[1] !== 'workflows'
      || segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')
      || !/\.ya?ml$/i.test(value)) {
    throw new PrEvidenceError('required workflow path must identify a YAML file under .github/workflows');
  }
  return value;
}

function requiredWorkflowKey({ repositoryId, path: workflowPath, ref, sha }) {
  return `workflow|repo:${repositoryId}|path:${encodeURIComponent(workflowPath)}|ref:${encodeURIComponent(ref)}|sha:${sha}`;
}

function normalizeRequiredWorkflow(value) {
  assertExactKeys(value, ['repositoryId', 'path', 'ref', 'sha']);
  if (!Number.isSafeInteger(value.repositoryId) || value.repositoryId < 1) {
    throw new PrEvidenceError('required workflow repositoryId must be a positive safe integer');
  }
  const normalized = {
    repositoryId: value.repositoryId,
    path: normalizeWorkflowPath(value.path),
    ref: normalizeRef(value.ref, 'required workflow ref'),
    sha: normalizeRevision(value.sha, 'required workflow sha'),
  };
  return Object.freeze({ ...normalized, key: requiredWorkflowKey(normalized) });
}

function normalizeRequiredWorkflowKey(value) {
  if (value === null) return null;
  if (typeof value !== 'string' || value.length > 1200) {
    throw new PrEvidenceError('requiredWorkflowKey must be a canonical key or null');
  }
  const match = /^workflow\|repo:([1-9]\d*)\|path:([^|]+)\|ref:([^|]+)\|sha:([a-f0-9]{40}(?:[a-f0-9]{24})?)$/i.exec(value);
  if (!match) throw new PrEvidenceError('requiredWorkflowKey must be a canonical key or null');
  let workflowPath;
  let ref;
  try {
    workflowPath = decodeURIComponent(match[2]);
    ref = decodeURIComponent(match[3]);
  } catch {
    throw new PrEvidenceError('requiredWorkflowKey contains invalid encoding');
  }
  const normalized = normalizeRequiredWorkflow({
    repositoryId: Number(match[1]),
    path: workflowPath,
    ref,
    sha: match[4],
  });
  if (normalized.key !== value) throw new PrEvidenceError('requiredWorkflowKey must be canonical');
  return normalized.key;
}

export function normalizeRequiredCheckSnapshot(input) {
  assertExactKeys(input, REQUIRED_CHECK_KEYS);

  if (!Array.isArray(input.requiredChecks)) throw new PrEvidenceError('requiredChecks must be an array');
  if (!COLLECTION_STATUSES.has(input.collectionStatus)) throw new PrEvidenceError('collectionStatus is unsupported');
  if (typeof input.policyFingerprint !== 'string' || !FINGERPRINT_PATTERN.test(input.policyFingerprint)) {
    throw new PrEvidenceError('policyFingerprint must be a SHA-256 hexadecimal fingerprint');
  }

  const requiredCheckKeys = input.requiredChecks.map(normalizeRequiredCheck).sort();
  if (new Set(requiredCheckKeys).size !== requiredCheckKeys.length) {
    throw new PrEvidenceError('requiredChecks must not contain duplicate canonical keys');
  }
  if (!Array.isArray(input.requiredWorkflows)) throw new PrEvidenceError('requiredWorkflows must be an array');
  const requiredWorkflows = input.requiredWorkflows.map(normalizeRequiredWorkflow)
    .sort((left, right) => left.key.localeCompare(right.key));
  const requiredWorkflowKeys = requiredWorkflows.map((workflow) => workflow.key);
  if (new Set(requiredWorkflowKeys).size !== requiredWorkflowKeys.length) {
    throw new PrEvidenceError('requiredWorkflows must not contain duplicate canonical identities');
  }

  return Object.freeze({
    baseRef: normalizeRef(input.baseRef, 'baseRef'),
    policyFingerprint: input.policyFingerprint.toLowerCase(),
    requiredCheckKeys: Object.freeze(requiredCheckKeys),
    requiredWorkflowKeys: Object.freeze(requiredWorkflowKeys),
    requiredWorkflows: Object.freeze(requiredWorkflows),
    collectionStatus: input.collectionStatus,
  });
}

export function normalizeCheckObservation(input) {
  assertExactKeys(input, OBSERVATION_REQUIRED_KEYS, OBSERVATION_OPTIONAL_KEYS);

  if (!PROVIDERS.has(input.provider)) throw new PrEvidenceError('provider is unsupported');
  if (!CHECK_STATUSES.has(input.status)) throw new PrEvidenceError('status is unsupported');
  if (input.conclusion !== null && !CONCLUSIONS.has(input.conclusion)) {
    throw new PrEvidenceError('conclusion is unsupported');
  }
  if (input.status === 'completed' && input.conclusion === null) {
    throw new PrEvidenceError('completed observations must include a conclusion');
  }
  if (input.status !== 'completed' && input.conclusion !== null) {
    throw new PrEvidenceError('pending observations cannot include a conclusion');
  }
  const isCompletedFailure = input.status === 'completed' && input.conclusion === 'failure';
  if (isCompletedFailure) {
    if (typeof input.failureFingerprint !== 'string' || !FINGERPRINT_PATTERN.test(input.failureFingerprint)) {
      throw new PrEvidenceError('completed failures must include an adapter SHA-256 failureFingerprint');
    }
  } else if (input.failureFingerprint !== null) {
    throw new PrEvidenceError('non-failure observations must use a null failureFingerprint');
  }
  if (input.runnerOutcome !== null && !RUNNER_OUTCOMES.has(input.runnerOutcome)) {
    throw new PrEvidenceError('runnerOutcome is unsupported');
  }
  if (typeof input.coversRelevantScope !== 'boolean' || typeof input.protectedPathTouched !== 'boolean') {
    throw new PrEvidenceError('verifier scope signals must be booleans');
  }

  const output = {
    checkId: normalizeStableId(input.checkId, 'checkId'),
    requiredCheckKey: normalizeRequiredCheckKey(input.requiredCheckKey),
    requiredWorkflowKey: normalizeRequiredWorkflowKey(input.requiredWorkflowKey),
    provider: input.provider,
    headSha: normalizeRevision(input.headSha, 'headSha'),
    baseSha: normalizeRevision(input.baseSha, 'baseSha'),
    mergeSha: input.mergeSha === null ? null : normalizeRevision(input.mergeSha, 'mergeSha'),
    testedSha: normalizeRevision(input.testedSha, 'testedSha'),
    attemptKey: normalizeStableId(input.attemptKey, 'attemptKey'),
    status: input.status,
    conclusion: input.conclusion,
    runnerOutcome: input.runnerOutcome,
    coversRelevantScope: input.coversRelevantScope,
    protectedPathTouched: input.protectedPathTouched,
    failureFingerprint: isCompletedFailure ? input.failureFingerprint.toLowerCase() : null,
  };
  if (Object.hasOwn(input, 'previouslyPassedRevision')) {
    output.previouslyPassedRevision = normalizeRevision(input.previouslyPassedRevision, 'previouslyPassedRevision');
  }
  return Object.freeze(output);
}

export function buildFailureEvidence(check, options) {
  const observation = normalizeCheckObservation(check);
  assertExactKeys(options, ['currentHeadSha', 'currentBaseSha', 'currentMergeSha']);
  const currentHeadSha = normalizeRevision(options.currentHeadSha, 'currentHeadSha');
  const currentBaseSha = normalizeRevision(options.currentBaseSha, 'currentBaseSha');
  const currentMergeSha = options.currentMergeSha === null
    ? null
    : normalizeRevision(options.currentMergeSha, 'currentMergeSha');

  if (observation.headSha !== currentHeadSha) {
    return Object.freeze({
      status: 'stale',
      reasonCode: 'head_sha_mismatch',
      observedHeadSha: observation.headSha,
      currentHeadSha,
    });
  }
  if (observation.baseSha !== currentBaseSha) {
    return Object.freeze({ status: 'stale', reasonCode: 'base_sha_mismatch' });
  }
  if (observation.mergeSha !== currentMergeSha) {
    return Object.freeze({ status: 'stale', reasonCode: 'merge_sha_mismatch' });
  }
  if (observation.testedSha !== currentHeadSha
      && (currentMergeSha === null || observation.testedSha !== currentMergeSha)) {
    return Object.freeze({ status: 'stale', reasonCode: 'tested_sha_mismatch' });
  }
  if (observation.status !== 'completed' || observation.conclusion !== 'failure') return null;

  const evidence = {
    protectedPathTouched: observation.protectedPathTouched,
    runnerOutcome: observation.runnerOutcome ?? 'check_failed',
    checkId: observation.checkId,
    currentRevision: observation.testedSha,
    coversRelevantScope: observation.coversRelevantScope,
  };
  if (Object.hasOwn(observation, 'previouslyPassedRevision')) {
    evidence.previouslyPassedRevision = observation.previouslyPassedRevision;
  }

  return Object.freeze({
    status: 'actionable',
    evidence: Object.freeze(evidence),
    failureFingerprint: observation.failureFingerprint,
  });
}
