const SHA_PATTERN = /^[a-f0-9]{40}$/;
const DESCRIPTOR_KEYS = Object.freeze([
  'repositoryId',
  'workflowId',
  'workflowPath',
  'workflowRef',
  'runId',
  'runAttempt',
  'eventName',
  'testedSha',
  'pullRequest',
]);
const PULL_REQUEST_KEYS = Object.freeze(['number', 'baseSha', 'headSha', 'mergeSha']);

export const WORKFLOW_SOURCE_DESCRIPTOR_VERSION = 1;

function isRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertExactKeys(value, expectedKeys) {
  if (!isRecord(value)) throw new TypeError('invalid_workflow_source_descriptor');
  const actualKeys = Object.keys(value);
  if (actualKeys.length !== expectedKeys.length
      || actualKeys.some((key) => !expectedKeys.includes(key))) {
    throw new TypeError('invalid_workflow_source_descriptor');
  }
}

function isPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function isValidWorkflowPath(value) {
  if (typeof value !== 'string' || value.length > 1024 || !value.startsWith('.github/workflows/')
      || value.includes('\\') || /[\x00-\x20\x7f]/.test(value)) return false;
  const segments = value.split('/');
  return segments.length >= 3
    && segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..')
    && /\.(?:ya?ml)$/i.test(segments.at(-1));
}

function isValidWorkflowRef(value) {
  if (typeof value !== 'string' || value.length > 255 || !value.startsWith('refs/')) return false;
  if (/[\x00-\x20\x7f~^:?*[\\]/.test(value) || value.includes('..')
      || value.includes('@{') || value.includes('//') || value.endsWith('/') || value.endsWith('.')) return false;
  const segments = value.split('/');
  return segments.length >= 3
    && segments.every((segment) => segment.length > 0
      && !segment.startsWith('.')
      && !segment.endsWith('.lock'));
}

function assertSha(value) {
  if (typeof value !== 'string' || !SHA_PATTERN.test(value)) {
    throw new TypeError('invalid_workflow_source_descriptor');
  }
}

function normalizePullRequest(value) {
  assertExactKeys(value, PULL_REQUEST_KEYS);
  if (!isPositiveInteger(value.number)) throw new TypeError('invalid_workflow_source_descriptor');
  assertSha(value.baseSha);
  assertSha(value.headSha);
  assertSha(value.mergeSha);
  return Object.freeze({
    number: value.number,
    baseSha: value.baseSha,
    headSha: value.headSha,
    mergeSha: value.mergeSha,
  });
}

export function createWorkflowSourceDescriptor(input) {
  assertExactKeys(input, DESCRIPTOR_KEYS);
  if (!isPositiveInteger(input.repositoryId)
      || !isPositiveInteger(input.workflowId)
      || !isValidWorkflowPath(input.workflowPath)
      || !isValidWorkflowRef(input.workflowRef)
      || !isPositiveInteger(input.runId)
      || !isPositiveInteger(input.runAttempt)
      || typeof input.eventName !== 'string'
      || !/^[a-z][a-z0-9_]{0,63}$/.test(input.eventName)) {
    throw new TypeError('invalid_workflow_source_descriptor');
  }
  assertSha(input.testedSha);

  let pullRequest = null;
  if (input.eventName === 'pull_request') {
    pullRequest = normalizePullRequest(input.pullRequest);
    if (input.testedSha !== pullRequest.headSha && input.testedSha !== pullRequest.mergeSha) {
      throw new TypeError('invalid_workflow_source_descriptor');
    }
  } else if (input.pullRequest !== null) {
    throw new TypeError('invalid_workflow_source_descriptor');
  }

  return Object.freeze({
    schemaVersion: WORKFLOW_SOURCE_DESCRIPTOR_VERSION,
    repositoryId: input.repositoryId,
    workflowId: input.workflowId,
    workflowPath: input.workflowPath,
    workflowRef: input.workflowRef,
    runId: input.runId,
    runAttempt: input.runAttempt,
    eventName: input.eventName,
    testedSha: input.testedSha,
    pullRequest,
  });
}

export function serializeWorkflowSourceDescriptor(input) {
  return Buffer.from(JSON.stringify(createWorkflowSourceDescriptor(input)), 'utf8');
}
