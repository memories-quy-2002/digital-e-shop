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
  'headRef',
  'headSha',
  'headRepository',
  'updatedAt',
]);
const REQUIRED_CHECK_KEYS = Object.freeze([
  'baseRef',
  'policyFingerprint',
  'requiredChecks',
  'collectionStatus',
]);
const OBSERVATION_REQUIRED_KEYS = Object.freeze([
  'checkId',
  'requiredCheckKey',
  'provider',
  'headSha',
  'attemptKey',
  'status',
  'conclusion',
  'runnerOutcome',
  'coversRelevantScope',
  'protectedPathTouched',
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
    headRef: normalizeRef(input.headRef, 'headRef'),
    headSha: normalizeRevision(input.headSha, 'headSha'),
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

  return Object.freeze({
    baseRef: normalizeRef(input.baseRef, 'baseRef'),
    policyFingerprint: input.policyFingerprint.toLowerCase(),
    requiredCheckKeys: Object.freeze(requiredCheckKeys),
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
  if (input.runnerOutcome !== null && !RUNNER_OUTCOMES.has(input.runnerOutcome)) {
    throw new PrEvidenceError('runnerOutcome is unsupported');
  }
  if (typeof input.coversRelevantScope !== 'boolean' || typeof input.protectedPathTouched !== 'boolean') {
    throw new PrEvidenceError('verifier scope signals must be booleans');
  }

  const output = {
    checkId: normalizeStableId(input.checkId, 'checkId'),
    requiredCheckKey: normalizeRequiredCheckKey(input.requiredCheckKey),
    provider: input.provider,
    headSha: normalizeRevision(input.headSha, 'headSha'),
    attemptKey: normalizeStableId(input.attemptKey, 'attemptKey'),
    status: input.status,
    conclusion: input.conclusion,
    runnerOutcome: input.runnerOutcome,
    coversRelevantScope: input.coversRelevantScope,
    protectedPathTouched: input.protectedPathTouched,
  };
  if (Object.hasOwn(input, 'previouslyPassedRevision')) {
    output.previouslyPassedRevision = normalizeRevision(input.previouslyPassedRevision, 'previouslyPassedRevision');
  }
  return Object.freeze(output);
}

export function buildFailureEvidence(check, options) {
  const observation = normalizeCheckObservation(check);
  assertExactKeys(options, ['currentHeadSha']);
  const currentHeadSha = normalizeRevision(options.currentHeadSha, 'currentHeadSha');

  if (observation.headSha !== currentHeadSha) {
    return Object.freeze({
      status: 'stale',
      reasonCode: 'head_sha_mismatch',
      observedHeadSha: observation.headSha,
      currentHeadSha,
    });
  }
  if (observation.status !== 'completed' || observation.conclusion !== 'failure') return null;

  const evidence = {
    protectedPathTouched: observation.protectedPathTouched,
    runnerOutcome: observation.runnerOutcome ?? 'check_failed',
    checkId: observation.checkId,
    currentRevision: observation.headSha,
    coversRelevantScope: observation.coversRelevantScope,
  };
  if (Object.hasOwn(observation, 'previouslyPassedRevision')) {
    evidence.previouslyPassedRevision = observation.previouslyPassedRevision;
  }

  return Object.freeze({ status: 'actionable', evidence: Object.freeze(evidence) });
}
