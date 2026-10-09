import { createInterface } from 'node:readline/promises';
import { isDeepStrictEqual } from 'node:util';

const SHA_PATTERN = /^[a-f0-9]{40}$/i;
const JOB_STATUSES = new Set(['queued', 'in_progress', 'completed']);
const JOB_CONCLUSIONS = new Set([
  'success', 'failure', 'cancelled', 'skipped', 'timed_out', 'action_required', 'neutral', 'stale', null,
]);

function isRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function hasExactKeys(value, keys) {
  return isRecord(value)
    && Object.keys(value).length === keys.length
    && Object.keys(value).every((key) => keys.includes(key));
}

function isPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function isSafeText(value, maxLength = 255) {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength
    && !/[\x00-\x1f\x7f]/.test(value);
}

function isSha(value) {
  return typeof value === 'string' && SHA_PATTERN.test(value);
}

function isFutureTimestamp(value, now) {
  if (!isSafeText(value, 40)) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value && timestamp > now;
}

function isSafeRepoPath(path) {
  if (typeof path !== 'string' || path.length === 0 || path.length > 1024
      || path.startsWith('/') || path.includes('\\') || /[\x00-\x1f\x7f]/.test(path)) return false;
  return !path.split('/').some((segment) => segment === '' || segment === '.' || segment === '..');
}

function validRepositoryName(value) {
  const segments = typeof value === 'string' ? value.split('/') : [];
  return segments.length === 2 && segments.every((part) => part.length > 0 && part.length <= 100
    && /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/.test(part) && !part.includes('..'));
}

function validActionTarget(value, repositoryId) {
  if (!hasExactKeys(value, ['workflowId', 'runId', 'runAttempt', 'failedJobIds', 'requiredIdentity'])
      || !isPositiveInteger(value.workflowId) || !isPositiveInteger(value.runId)
      || !isPositiveInteger(value.runAttempt) || !Array.isArray(value.failedJobIds)
      || value.failedJobIds.length < 1 || value.failedJobIds.length > 100
      || value.failedJobIds.some((id) => !isPositiveInteger(id))
      || new Set(value.failedJobIds).size !== value.failedJobIds.length) return false;

  const identity = value.requiredIdentity;
  return hasExactKeys(identity, ['type', 'repositoryId', 'path', 'ref', 'sha'])
    && identity.type === 'workflow'
    && identity.repositoryId === repositoryId
    && isSafeRepoPath(identity.path)
    && identity.path.toLowerCase().startsWith('.github/workflows/')
    && isSafeText(identity.ref)
    && isSha(identity.sha);
}

function validApprovalPayload(payload, now) {
  if (payload?.capability === 'stage1:required-check-recovery') {
    const target = payload.stage1Target;
    return hasExactKeys(payload, ['type', 'repositoryId', 'repository', 'prNumber', 'revision', 'capability', 'paths', 'stage1Target', 'approverId', 'expiresAt'])
      && isPositiveInteger(payload.repositoryId) && validRepositoryName(payload.repository)
      && isPositiveInteger(payload.prNumber) && isPositiveInteger(payload.approverId)
      && isFutureTimestamp(payload.expiresAt, now) && hasExactKeys(payload.revision, ['baseSha', 'headSha', 'mergeSha'])
      && isSha(payload.revision.baseSha) && isSha(payload.revision.headSha)
      && (payload.revision.mergeSha === null || isSha(payload.revision.mergeSha))
      && Array.isArray(payload.paths) && payload.paths.length === 1 && payload.paths[0] === '.github/workflows/stage1-trusted-retry.yml'
      && hasExactKeys(target, ['repositoryId', 'prNumber', 'baseSha', 'headSha', 'mergeSha', 'testedSha', 'context', 'appId', 'checkRunId', 'workflowId', 'workflowPath', 'workflowRef', 'workflowSourceSha', 'requestId', 'actorId', 'actorLogin'])
      && target.repositoryId === payload.repositoryId && target.prNumber === payload.prNumber
      && target.baseSha.toLowerCase() === payload.revision.baseSha.toLowerCase() && target.headSha.toLowerCase() === payload.revision.headSha.toLowerCase()
      && target.mergeSha === payload.revision.mergeSha && isSha(target.testedSha)
      && [target.headSha.toLowerCase(), target.mergeSha?.toLowerCase()].includes(target.testedSha.toLowerCase())
      && ['client', 'server'].includes(target.context) && target.appId === 15368 && isPositiveInteger(target.checkRunId)
      && isPositiveInteger(target.workflowId) && target.workflowPath === '.github/workflows/stage1-trusted-retry.yml'
      && target.workflowRef === 'main' && target.workflowSourceSha.toLowerCase() === target.baseSha.toLowerCase()
      && /^[a-f0-9]{32}$/.test(target.requestId) && isPositiveInteger(target.actorId)
      && target.actorLogin === 'digital-e-loop-runner[bot]';
  }
  const keys = [
    'type', 'repositoryId', 'repository', 'prNumber', 'revision', 'capability', 'paths',
    'testedSha', 'actionTarget', 'approverId', 'expiresAt',
  ];
  if (!hasExactKeys(payload, keys)
      || !isPositiveInteger(payload.repositoryId) || !validRepositoryName(payload.repository)
      || !isPositiveInteger(payload.prNumber) || payload.capability !== 'actions:rerun'
      || !isPositiveInteger(payload.approverId) || !isFutureTimestamp(payload.expiresAt, now)
      || !hasExactKeys(payload.revision, ['baseSha', 'headSha', 'mergeSha'])
      || !isSha(payload.revision.baseSha) || !isSha(payload.revision.headSha)
      || (payload.revision.mergeSha !== null && !isSha(payload.revision.mergeSha))
      || !isSha(payload.testedSha)
      || (payload.testedSha.toLowerCase() !== payload.revision.headSha.toLowerCase()
        && payload.testedSha.toLowerCase() !== payload.revision.mergeSha?.toLowerCase())
      || !Array.isArray(payload.paths) || payload.paths.length !== 1
      || payload.paths.some((path) => !isSafeRepoPath(path) || !path.toLowerCase().startsWith('.github/workflows/'))
      || !validActionTarget(payload.actionTarget, payload.repositoryId)) return false;
  return payload.actionTarget.requiredIdentity.path === payload.paths[0];
}

function validJobGraph(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) return false;
  const names = new Set();
  for (const job of value) {
    if (!hasExactKeys(job, ['name', 'status', 'conclusion', 'needs'])
        || !isSafeText(job.name, 100) || !JOB_STATUSES.has(job.status)
        || !JOB_CONCLUSIONS.has(job.conclusion) || !Array.isArray(job.needs)
        || job.needs.length > 100 || job.needs.some((name) => !isSafeText(name, 100))
        || new Set(job.needs).size !== job.needs.length) return false;
    if (names.has(job.name)) return false;
    names.add(job.name);
  }
  return value.every((job) => job.needs.every((dependency) => names.has(dependency) && dependency !== job.name));
}

function validReviewContext(review, payload) {
  if (payload.capability === 'stage1:required-check-recovery') {
    return isRecord(review) && ['repositoryId', 'prNumber', 'revision', 'capability', 'paths', 'stage1Target',
      'branch', 'classification', 'remainingCIRuns', 'remainingFlakyRetries'].every((key) => Object.hasOwn(review, key))
      && ['repositoryId', 'prNumber', 'revision', 'capability', 'paths', 'stage1Target'].every((key) => isDeepStrictEqual(review[key], payload[key]))
      && isSafeText(review.branch) && review.classification === 'flaky'
      && Number.isSafeInteger(review.remainingCIRuns) && review.remainingCIRuns > 0 && review.remainingCIRuns <= 100_000
      && Number.isSafeInteger(review.remainingFlakyRetries) && review.remainingFlakyRetries > 0 && review.remainingFlakyRetries <= 100_000;
  }
  if (!isRecord(review)
      || !['repositoryId', 'prNumber', 'revision', 'capability', 'paths', 'testedSha', 'actionTarget',
        'branch', 'classification', 'remainingCIRuns', 'remainingFlakyRetries', 'jobGraph']
        .every((key) => Object.hasOwn(review, key))) return false;

  const targetKeys = ['repositoryId', 'prNumber', 'revision', 'capability', 'paths', 'testedSha', 'actionTarget'];
  if (!targetKeys.every((key) => isDeepStrictEqual(review[key], payload[key]))) return false;
  return isSafeText(review.branch)
    && review.classification === 'flaky'
    && Number.isSafeInteger(review.remainingCIRuns) && review.remainingCIRuns > 0 && review.remainingCIRuns <= 100_000
    && Number.isSafeInteger(review.remainingFlakyRetries) && review.remainingFlakyRetries > 0
    && review.remainingFlakyRetries <= 100_000
    && validJobGraph(review.jobGraph);
}

function validDevicePayload(payload, now) {
  return hasExactKeys(payload, ['type', 'verificationUri', 'userCode', 'expiresAt'])
    && payload.verificationUri === 'https://github.com/login/device'
    && typeof payload.userCode === 'string' && /^[A-Z0-9]{4,5}-[A-Z0-9]{4,5}$/.test(payload.userCode)
    && isFutureTimestamp(payload.expiresAt, now);
}

export function createStage1Prompt({ input, output, getReviewContext, now = Date.now }) {
  if (!input || !output || typeof getReviewContext !== 'function' || typeof now !== 'function') {
    throw new TypeError('Stage 1 prompt requires input, output, review context, and clock functions.');
  }

  const prompt = async (payload) => {
    if (prompt.isTTY !== true || !isRecord(payload)) return false;
    const currentTime = now();
    if (!Number.isFinite(currentTime)) return false;

    if (payload.type === 'device-code') {
      if (!validDevicePayload(payload, currentTime)) return false;
      const terminal = createInterface({ input, output });
      try {
        output.write(`Open ${payload.verificationUri}; enter code ${payload.userCode} (expires ${payload.expiresAt})\n`);
        return await terminal.question('Continue GitHub authentication? Type CONTINUE: ') === 'CONTINUE';
      } finally {
        terminal.close();
      }
    }

    if (payload.type !== 'approval' || !validApprovalPayload(payload, currentTime)) return false;
    let review;
    try {
      review = await getReviewContext();
    } catch {
      return false;
    }
    if (!validReviewContext(review, payload)) return false;

    const terminal = createInterface({ input, output });
    try {
      output.write(JSON.stringify({
        repository: payload.repository,
        repositoryId: payload.repositoryId,
        prNumber: payload.prNumber,
        revision: payload.revision,
        capability: payload.capability,
        paths: payload.paths,
        testedSha: payload.testedSha,
        actionTarget: payload.actionTarget,
        approverId: payload.approverId,
        expiresAt: payload.expiresAt,
        branch: review.branch,
        classification: review.classification,
        remainingCIRuns: review.remainingCIRuns,
        remainingFlakyRetries: review.remainingFlakyRetries,
        jobGraph: review.jobGraph,
      ...(payload.stage1Target ? { stage1Target: payload.stage1Target } : {}),
      }, null, 2) + '\n');
      const confirmation = payload.capability === 'stage1:required-check-recovery'
        ? 'Dispatch the trusted verifier and update this existing Check Run only after success? Type RECOVER: '
        : 'Rerun failed jobs and their dependent jobs? Type RERUN: ';
      return await terminal.question(confirmation) === (payload.capability === 'stage1:required-check-recovery' ? 'RECOVER' : 'RERUN');
    } finally {
      terminal.close();
    }
  };

  prompt.isTTY = input.isTTY === true && output.isTTY === true;
  return prompt;
}
