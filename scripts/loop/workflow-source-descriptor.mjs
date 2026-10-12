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
const DISPATCH_TARGET_KEYS = Object.freeze([
  'number', 'baseSha', 'headSha', 'mergeSha', 'testedSha', 'context', 'appId', 'checkRunId',
  'policyFingerprint', 'requestId', 'actorId', 'actorLogin',
]);
const STAGE1_WORKFLOW_PATH = '.github/workflows/stage1-trusted-retry.yml';
const STAGE1_ACTOR_LOGIN = 'digital-e-loop-runner[bot]';

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

function normalizeDispatchTarget(value, testedSha) {
  assertExactKeys(value, DISPATCH_TARGET_KEYS);
  assertSha(value.baseSha);
  assertSha(value.headSha);
  if (value.mergeSha !== null) assertSha(value.mergeSha);
  assertSha(value.testedSha);
  if (!isPositiveInteger(value.number) || !['client', 'server'].includes(value.context)
      || value.appId !== 15368 || !isPositiveInteger(value.checkRunId)
      || typeof value.policyFingerprint !== 'string' || !/^[a-f0-9]{64}$/i.test(value.policyFingerprint)
      || typeof value.requestId !== 'string' || !/^[a-f0-9]{32}$/.test(value.requestId)
      || !isPositiveInteger(value.actorId) || value.actorLogin !== STAGE1_ACTOR_LOGIN
      || value.testedSha !== value.headSha && value.testedSha !== value.mergeSha
      || testedSha !== value.baseSha) throw new TypeError('invalid_workflow_source_descriptor');
  return Object.freeze({
    number: value.number,
    baseSha: value.baseSha,
    headSha: value.headSha,
    mergeSha: value.mergeSha,
    testedSha: value.testedSha,
    context: value.context,
    appId: value.appId,
    checkRunId: value.checkRunId,
    policyFingerprint: value.policyFingerprint.toLowerCase(),
    requestId: value.requestId,
    actorId: value.actorId,
    actorLogin: value.actorLogin,
  });
}

export function createWorkflowSourceDescriptor(input) {
  if (!isRecord(input)) throw new TypeError('invalid_workflow_source_descriptor');
  const isDispatch = input.eventName === 'workflow_dispatch';
  assertExactKeys(input, isDispatch ? [...DESCRIPTOR_KEYS, 'dispatchTarget'] : DESCRIPTOR_KEYS);
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
  let dispatchTarget = null;
  if (input.eventName === 'pull_request') {
    pullRequest = normalizePullRequest(input.pullRequest);
    if (input.testedSha !== pullRequest.headSha && input.testedSha !== pullRequest.mergeSha) {
      throw new TypeError('invalid_workflow_source_descriptor');
    }
  } else if (isDispatch) {
    if (input.workflowPath !== STAGE1_WORKFLOW_PATH || input.workflowRef !== 'refs/heads/main' || input.pullRequest !== null) {
      throw new TypeError('invalid_workflow_source_descriptor');
    }
    dispatchTarget = normalizeDispatchTarget(input.dispatchTarget, input.testedSha);
  } else if (input.pullRequest !== null) {
    throw new TypeError('invalid_workflow_source_descriptor');
  }

  return Object.freeze({
    schemaVersion: isDispatch ? 2 : WORKFLOW_SOURCE_DESCRIPTOR_VERSION,
    repositoryId: input.repositoryId,
    workflowId: input.workflowId,
    workflowPath: input.workflowPath,
    workflowRef: input.workflowRef,
    runId: input.runId,
    runAttempt: input.runAttempt,
    eventName: input.eventName,
    testedSha: input.testedSha,
    pullRequest,
    ...(isDispatch ? { dispatchTarget } : {}),
  });
}

export function serializeWorkflowSourceDescriptor(input) {
  return Buffer.from(JSON.stringify(createWorkflowSourceDescriptor(input)), 'utf8');
}
