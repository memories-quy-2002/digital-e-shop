const FAILURE_CATEGORIES = new Set(['branch-caused', 'flaky', 'infrastructure', 'protected', 'ambiguous']);
const RUNNER_OUTCOMES = new Set(['check_failed', 'runner_error', 'network_error']);
const CHECK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/;
const REVISION_PATTERN = /^[a-f0-9]{7,64}$/i;
const REQUIRED_KEYS = Object.freeze([
  'protectedPathTouched',
  'runnerOutcome',
  'checkId',
  'currentRevision',
  'coversRelevantScope',
]);
const OPTIONAL_KEYS = Object.freeze(['previouslyPassedRevision']);

export class FailureEvidenceError extends TypeError {
  constructor(message) {
    super(message);
    this.name = 'FailureEvidenceError';
  }
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertExactEvidence(value) {
  if (!isPlainObject(value)) throw new FailureEvidenceError('failure evidence must be a plain object');

  const allowedKeys = new Set([...REQUIRED_KEYS, ...OPTIONAL_KEYS]);
  const unknownKeys = Object.keys(value).filter((key) => !allowedKeys.has(key));
  if (unknownKeys.length > 0) throw new FailureEvidenceError('failure evidence contains unsupported fields');
  const missingKeys = REQUIRED_KEYS.filter((key) => !Object.hasOwn(value, key));
  if (missingKeys.length > 0) throw new FailureEvidenceError(`failure evidence is missing ${missingKeys.join(', ')}`);

  if (typeof value.protectedPathTouched !== 'boolean') {
    throw new FailureEvidenceError('protectedPathTouched must be a boolean');
  }
  if (!RUNNER_OUTCOMES.has(value.runnerOutcome)) {
    throw new FailureEvidenceError('runnerOutcome is not a supported verification outcome');
  }
  if (typeof value.checkId !== 'string' || !CHECK_ID_PATTERN.test(value.checkId)) {
    throw new FailureEvidenceError('checkId must be a stable identifier');
  }
  if (typeof value.currentRevision !== 'string' || !REVISION_PATTERN.test(value.currentRevision)) {
    throw new FailureEvidenceError('currentRevision must be a hexadecimal revision');
  }
  if (typeof value.coversRelevantScope !== 'boolean') {
    throw new FailureEvidenceError('coversRelevantScope must be a boolean from the verifier');
  }
  if (Object.hasOwn(value, 'previouslyPassedRevision')
      && (typeof value.previouslyPassedRevision !== 'string' || !REVISION_PATTERN.test(value.previouslyPassedRevision))) {
    throw new FailureEvidenceError('previouslyPassedRevision must be a hexadecimal revision when present');
  }
}

function result(category, mayRepair, retryWithinBudget, reasonCode) {
  if (!FAILURE_CATEGORIES.has(category)) throw new FailureEvidenceError('unsupported failure category');
  return Object.freeze({ category, mayRepair, retryWithinBudget, reasonCode });
}

export function classifyFailure(evidence) {
  assertExactEvidence(evidence);

  if (evidence.protectedPathTouched) {
    return result('protected', false, false, 'protected_path_touched');
  }
  if (evidence.runnerOutcome === 'runner_error' || evidence.runnerOutcome === 'network_error') {
    return result('infrastructure', false, false, evidence.runnerOutcome);
  }
  if (Object.hasOwn(evidence, 'previouslyPassedRevision')
      && evidence.previouslyPassedRevision.toLowerCase() === evidence.currentRevision.toLowerCase()) {
    return result('flaky', false, true, 'same_revision_pass_then_fail');
  }
  if (evidence.coversRelevantScope) {
    return result('branch-caused', true, false, 'relevant_check_failed');
  }
  return result('ambiguous', false, false, 'check_scope_not_relevant');
}
