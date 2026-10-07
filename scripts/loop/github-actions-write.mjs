import { createHash } from 'node:crypto';

import { isVerifiedWorkflowSourceRecord } from './workflow-source-attestation.mjs';
import {
  evaluateBudgets,
  finishCIRunAttemptInRepository,
  loadLoopState,
  reserveCIRunAttemptInRepository,
} from './state.mjs';

const API_ORIGIN = 'https://api.github.com';
const API_VERSION = '2026-03-10';
const SHA_PATTERN = /^[a-f0-9]{40}$/i;
const TASK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
const SAFE_ATTEMPT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/;
const hostContexts = new WeakMap();

export class GitHubActionsWriteError extends Error {
  constructor(code) {
    super(code === 'invalid_configuration'
      ? 'GitHub Actions write adapter configuration is invalid.'
      : 'GitHub Actions write adapter refused an unsafe operation.');
    this.name = new.target.name;
    this.code = code;
  }
}

function failConfiguration() {
  throw new GitHubActionsWriteError('invalid_configuration');
}

function isRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function assertExactKeys(value, keys, required = keys, errorCode = 'invalid_configuration') {
  if (!isRecord(value) || Object.keys(value).some((key) => !keys.includes(key))
      || required.some((key) => !Object.hasOwn(value, key))) {
    throw new GitHubActionsWriteError(errorCode);
  }
}

function isPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (isRecord(value)) {
    return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonicalJson(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

function parseRepository(value) {
  if (typeof value !== 'string') failConfiguration();
  const parts = value.split('/');
  if (parts.length !== 2 || parts.some((part) => part.length === 0 || part.length > 100
      || !/^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/.test(part) || part.includes('..'))) failConfiguration();
  return Object.freeze({ owner: parts[0], name: parts[1], fullName: parts.join('/').toLowerCase() });
}

function normalizeRepoPath(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 1024
      || value.startsWith('/') || value.includes('\\') || /[\x00-\x1f\x7f]/.test(value)) return null;
  const segments = value.split('/');
  if (segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')) return null;
  return value;
}

function normalizeRequiredIdentity(identity, entry) {
  if (!isRecord(identity)) failConfiguration();
  if (identity.type === 'workflow') {
    assertExactKeys(identity, ['type', 'repositoryId', 'path', 'ref', 'sha']);
    if (!isPositiveInteger(identity.repositoryId) || typeof identity.path !== 'string'
        || typeof identity.ref !== 'string' || typeof identity.sha !== 'string' || !SHA_PATTERN.test(identity.sha)
        || identity.path !== entry.path
        || identity.ref !== entry.ref || identity.sha.toLowerCase() !== entry.sourceSha) failConfiguration();
    return Object.freeze({
      type: 'workflow',
      repositoryId: identity.repositoryId,
      path: identity.path,
      ref: identity.ref,
      sha: identity.sha.toLowerCase(),
    });
  }
  if (identity.type === 'check') {
    assertExactKeys(identity, ['type', 'context', 'appId']);
    if (typeof identity.context !== 'string' || identity.context.length === 0 || identity.context.length > 255
        || /[\x00-\x1f\x7f]/.test(identity.context)
        || (identity.appId !== null && !isPositiveInteger(identity.appId))) failConfiguration();
    return Object.freeze({ type: 'check', context: identity.context, appId: identity.appId });
  }
  failConfiguration();
}

function normalizeAllowlist(input, repositoryId) {
  if (!Array.isArray(input) || input.length > 100) failConfiguration();
  const identities = new Set();
  const entries = input.map((entry) => {
    assertExactKeys(entry, [
      'repositoryId', 'workflowId', 'path', 'ref', 'sourceSha', 'requiredIdentity', 'jobNames', 'safety',
    ]);
    const workflowPath = normalizeRepoPath(entry.path);
    if (entry.repositoryId !== repositoryId || !isPositiveInteger(entry.workflowId)
        || !workflowPath || !workflowPath.toLowerCase().startsWith('.github/workflows/')
        || typeof entry.ref !== 'string' || entry.ref.length === 0 || entry.ref.length > 255
        || /[\x00-\x1f\x7f]/.test(entry.ref)
        || typeof entry.sourceSha !== 'string' || !SHA_PATTERN.test(entry.sourceSha)) failConfiguration();
    assertExactKeys(entry.safety, ['noSecrets', 'noProtectedEnvironment', 'noWritePermissions']);
    if (entry.safety.noSecrets !== true || entry.safety.noProtectedEnvironment !== true
        || entry.safety.noWritePermissions !== true) failConfiguration();
    if (!Array.isArray(entry.jobNames) || entry.jobNames.length === 0 || entry.jobNames.length > 100
        || entry.jobNames.some((name) => typeof name !== 'string' || name.length === 0 || name.length > 255
          || /[\x00-\x1f\x7f]/.test(name))
        || new Set(entry.jobNames).size !== entry.jobNames.length) failConfiguration();
    const normalizedEntry = {
      repositoryId,
      workflowId: entry.workflowId,
      path: workflowPath,
      ref: entry.ref,
      sourceSha: entry.sourceSha.toLowerCase(),
      requiredIdentity: null,
      jobNames: Object.freeze([...entry.jobNames].sort()),
      safety: Object.freeze({
        noSecrets: true,
        noProtectedEnvironment: true,
        noWritePermissions: true,
      }),
    };
    normalizedEntry.requiredIdentity = normalizeRequiredIdentity(entry.requiredIdentity, normalizedEntry);
    const identityKey = canonicalJson(normalizedEntry.requiredIdentity);
    if (identities.has(identityKey)) failConfiguration();
    identities.add(identityKey);
    return Object.freeze(normalizedEntry);
  });
  return Object.freeze(entries);
}

function normalizeTarget(value, host) {
  assertExactKeys(value, [
    'repositoryId', 'prNumber', 'baseSha', 'headSha', 'mergeSha', 'testedSha', 'requiredIdentity',
    'workflowId', 'runId', 'runAttempt', 'failedJobIds', 'failureAttemptKey',
  ], undefined, 'invalid_target');
  if (value.repositoryId !== host.repositoryId || !isPositiveInteger(value.prNumber)
      || !SHA_PATTERN.test(value.baseSha) || !SHA_PATTERN.test(value.headSha)
      || (value.mergeSha !== null && !SHA_PATTERN.test(value.mergeSha))
      || !SHA_PATTERN.test(value.testedSha)
      || !isPositiveInteger(value.workflowId) || !isPositiveInteger(value.runId)
      || !isPositiveInteger(value.runAttempt) || !SAFE_ATTEMPT_PATTERN.test(value.failureAttemptKey)
      || !Array.isArray(value.failedJobIds) || value.failedJobIds.length === 0 || value.failedJobIds.length > 100
      || value.failedJobIds.some((id) => !isPositiveInteger(id))
      || new Set(value.failedJobIds).size !== value.failedJobIds.length) {
    throw new GitHubActionsWriteError('invalid_target');
  }
  const identityEntry = host.workflowAllowlist.find((entry) => canonicalJson(entry.requiredIdentity) === canonicalJson(value.requiredIdentity));
  if (!identityEntry || identityEntry.workflowId !== value.workflowId) throw new GitHubActionsWriteError('workflow_not_allowlisted');
  return {
    ...value,
    baseSha: value.baseSha.toLowerCase(),
    headSha: value.headSha.toLowerCase(),
    mergeSha: value.mergeSha?.toLowerCase() ?? null,
    testedSha: value.testedSha.toLowerCase(),
    failedJobIds: [...value.failedJobIds].sort((left, right) => left - right),
    requiredIdentity: identityEntry.requiredIdentity,
    entry: identityEntry,
  };
}

function normalizedSnapshot(value, host, prNumber) {
  if (!isRecord(value) || typeof value.repository !== 'string' || !Number.isSafeInteger(value.repositoryId)
      || value.number !== prNumber || typeof value.baseRef !== 'string' || typeof value.headRef !== 'string'
      || typeof value.headRepository !== 'string' || !SHA_PATTERN.test(value.baseSha)
      || !SHA_PATTERN.test(value.headSha) || (value.mergeSha !== null && !SHA_PATTERN.test(value.mergeSha))) return null;
  return {
    repository: value.repository.toLowerCase(),
    repositoryId: value.repositoryId,
    number: value.number,
    state: value.state,
    baseRef: value.baseRef,
    baseSha: value.baseSha.toLowerCase(),
    headRef: value.headRef,
    headSha: value.headSha.toLowerCase(),
    mergeSha: value.mergeSha?.toLowerCase() ?? null,
    headRepository: value.headRepository.toLowerCase(),
  };
}

function matchesTarget(snapshot, target, host) {
  return snapshot !== null
    && snapshot.repository === host.repository.fullName
    && snapshot.repositoryId === host.repositoryId
    && snapshot.number === target.prNumber
    && snapshot.state === 'open'
    && snapshot.baseRef === 'main'
    && snapshot.headRef.toLowerCase() !== 'main'
    && snapshot.headRepository === host.repository.fullName
    && snapshot.baseSha === target.baseSha
    && snapshot.headSha === target.headSha
    && snapshot.mergeSha === target.mergeSha
    && (target.testedSha === snapshot.headSha || (snapshot.mergeSha !== null && target.testedSha === snapshot.mergeSha));
}

function isWorkflowDefinitionPath(value) {
  const filename = value.toLowerCase();
  return filename.startsWith('.github/workflows/') || filename.startsWith('.github/actions/');
}

function actionAttemptDigest(host, target) {
  return createHash('sha256').update(canonicalJson({
    repository: host.repository.fullName,
    repositoryId: target.repositoryId,
    prNumber: target.prNumber,
    baseSha: target.baseSha,
    headSha: target.headSha,
    mergeSha: target.mergeSha,
    testedSha: target.testedSha,
    requiredIdentity: target.requiredIdentity,
    workflowId: target.workflowId,
    runId: target.runId,
    runAttempt: target.runAttempt,
    failedJobIds: target.failedJobIds,
    failureAttemptKey: target.failureAttemptKey,
  }), 'utf8').digest('hex');
}

function refused(reasonCode, status = 'refused', actionAttemptKey = undefined) {
  return Object.freeze({
    status,
    reasonCode,
    ...(actionAttemptKey ? { actionAttemptKey } : {}),
  });
}

async function collectTargetEvidence(host, target) {
  let snapshot;
  try {
    snapshot = normalizedSnapshot(await host.prClient.getPullRequest(target.prNumber), host, target.prNumber);
  } catch {
    return { reasonCode: 'pr_snapshot_unavailable' };
  }
  if (!matchesTarget(snapshot, target, host)) return { reasonCode: 'stale_pr_tuple' };

  let fileResult;
  try {
    fileResult = await host.prClient.getPullRequestFiles(target.prNumber);
  } catch {
    return { reasonCode: 'workflow_file_evidence_unavailable' };
  }
  if (fileResult?.status !== 'current' || fileResult.collectionStatus !== 'complete'
      || !matchesTarget(normalizedSnapshot(fileResult.snapshot, host, target.prNumber), target, host)
      || !Array.isArray(fileResult.files)) return { reasonCode: 'workflow_file_evidence_unavailable' };
  for (const file of fileResult.files) {
    const filename = normalizeRepoPath(file?.filename);
    const previousFilename = file?.previousFilename === null ? null : normalizeRepoPath(file?.previousFilename);
    if (!filename || (file?.previousFilename !== null && !previousFilename)) {
      return { reasonCode: 'workflow_file_evidence_unavailable' };
    }
    if (isWorkflowDefinitionPath(filename) || (previousFilename && isWorkflowDefinitionPath(previousFilename))) {
      return { reasonCode: 'pr_modified_workflow' };
    }
  }

  let runCollection;
  try {
    runCollection = await host.prClient.getWorkflowRuns(target.testedSha);
  } catch {
    return { reasonCode: 'workflow_run_evidence_unavailable' };
  }
  if (runCollection?.status !== 'current' || runCollection.collectionStatus !== 'complete'
      || runCollection.testedSha !== target.testedSha
      || !matchesTarget(normalizedSnapshot(runCollection.snapshot, host, target.prNumber), target, host)
      || !Array.isArray(runCollection.runs)) return { reasonCode: 'workflow_run_evidence_unavailable' };
  const matchingRuns = runCollection.runs.filter((run) => run?.id === target.runId);
  if (matchingRuns.length !== 1) return { reasonCode: 'run_not_observed' };
  const run = matchingRuns[0];
  if (run.runAttempt !== target.runAttempt) return { reasonCode: 'run_attempt_mismatch' };
  if (run.repositoryId !== target.repositoryId || run.workflowId !== target.workflowId
      || run.path !== target.entry.path || run.ref !== target.entry.ref
      || run.testedSha !== target.testedSha || run.headSha !== target.testedSha) {
    return { reasonCode: 'workflow_identity_mismatch' };
  }
  if (typeof host.verifyWorkflowSourceAttestation !== 'function') {
    return { reasonCode: 'workflow_source_sha_unattested' };
  }
  let sourceRecord = null;
  try {
    sourceRecord = await host.verifyWorkflowSourceAttestation({
      identity: target.requiredIdentity,
      run,
      snapshot,
    });
  } catch {
    sourceRecord = null;
  }
  if (!isVerifiedWorkflowSourceRecord(sourceRecord)
      || sourceRecord.repositoryId !== target.requiredIdentity.repositoryId
      || sourceRecord.workflowPath !== target.entry.path
      || sourceRecord.workflowRef !== target.entry.ref
      || sourceRecord.sourceSha !== target.entry.sourceSha
      || sourceRecord.runId !== target.runId
      || sourceRecord.runAttempt !== target.runAttempt
      || sourceRecord.testedSha !== target.testedSha) {
    return { reasonCode: 'workflow_source_sha_unattested' };
  }
  if (run.status !== 'completed' || !['failure', 'timed_out'].includes(run.conclusion)) {
    return { reasonCode: 'run_not_failed' };
  }

  let jobResult;
  try {
    jobResult = await host.prClient.getWorkflowRunJobs(target.runId, target.runAttempt);
  } catch {
    return { reasonCode: 'job_evidence_unavailable' };
  }
  if (jobResult?.runAttempt !== target.runAttempt) return { reasonCode: 'run_attempt_mismatch' };
  if (jobResult?.runId !== target.runId || jobResult.collectionStatus !== 'complete'
      || !matchesTarget(normalizedSnapshot(jobResult.snapshot, host, target.prNumber), target, host)
      || !Array.isArray(jobResult.jobs)) return { reasonCode: 'job_evidence_unavailable' };

  const jobIds = new Set();
  const jobNames = new Set();
  const failedJobs = [];
  for (const job of jobResult.jobs) {
    if (!isRecord(job) || job.runId !== target.runId || !isPositiveInteger(job.id)
        || typeof job.name !== 'string' || job.name.length === 0 || job.name.length > 255
        || /[\x00-\x1f\x7f]/.test(job.name) || jobIds.has(job.id) || jobNames.has(job.name)) {
      return { reasonCode: 'job_evidence_unavailable' };
    }
    if (job.runAttempt !== target.runAttempt) return { reasonCode: 'run_attempt_mismatch' };
    jobIds.add(job.id);
    jobNames.add(job.name);
    if (!target.entry.jobNames.includes(job.name)) return { reasonCode: 'job_not_allowlisted' };
    if (job.status !== 'completed') return { reasonCode: 'job_evidence_unavailable' };
    if (job.conclusion === 'failure' || job.conclusion === 'timed_out') failedJobs.push(job);
    else if (job.conclusion === 'cancelled' || job.conclusion === 'action_required') {
      return { reasonCode: 'failed_job_not_retryable' };
    }
  }
  if (failedJobs.length === 0) return { reasonCode: 'run_not_failed' };
  const failedJobIds = failedJobs.map((job) => job.id).sort((left, right) => left - right);
  if (canonicalJson(failedJobIds) !== canonicalJson(target.failedJobIds)) {
    return { reasonCode: 'failed_job_identity_mismatch' };
  }
  return { snapshot, run, failedJobs };
}

async function readCurrentState(host, target, snapshot) {
  let state;
  try {
    state = await loadLoopState(host.repoRoot, host.taskId);
  } catch {
    return { reasonCode: 'loop_state_unavailable' };
  }
  if (state.taskId !== host.taskId || state.branch !== snapshot.headRef
      || state.baseSha.toLowerCase() !== target.baseSha || state.headSha.toLowerCase() !== target.headSha) {
    return { reasonCode: 'stale_loop_state' };
  }
  if (state.budgets.ciRunLimit === null || host.policy.stopConditions.ciRunLimit === null) {
    return { reasonCode: 'ci_run_limit_unconfigured' };
  }
  const attemptKey = actionAttemptDigest(host, target);
  if (state.ciRunAttempts.some((attempt) => attempt.actionAttemptKey === attemptKey)) {
    return { reasonCode: 'duplicate_rerun', actionAttemptKey: attemptKey };
  }
  let budget;
  try {
    budget = evaluateBudgets(state, host.policy);
  } catch {
    return { reasonCode: 'loop_policy_unavailable' };
  }
  if (budget.stop) return { reasonCode: budget.reason, actionAttemptKey: attemptKey };
  return { state, actionAttemptKey: attemptKey };
}

export function createGitHubActionsWriteHost(options) {
  const allowedKeys = [
    'repository', 'repositoryId', 'repoRoot', 'taskId', 'policy', 'prClient', 'approvalProvider',
    'workflowAllowlist', 'verifyWorkflowSourceAttestation', 'fetchImpl',
  ];
  assertExactKeys(options, allowedKeys, [
    'repository', 'repositoryId', 'repoRoot', 'taskId', 'policy', 'prClient', 'approvalProvider', 'workflowAllowlist',
  ]);
  const repository = parseRepository(options.repository);
  if (!isPositiveInteger(options.repositoryId) || typeof options.repoRoot !== 'string' || options.repoRoot.length === 0
      || typeof options.taskId !== 'string' || !TASK_ID_PATTERN.test(options.taskId)
      || !isRecord(options.policy) || !isRecord(options.policy.stopConditions)
      || !isRecord(options.prClient) || typeof options.prClient.getPullRequest !== 'function'
      || typeof options.prClient.getPullRequestFiles !== 'function' || typeof options.prClient.getWorkflowRuns !== 'function'
      || typeof options.prClient.getWorkflowRunJobs !== 'function'
      || !isRecord(options.approvalProvider) || typeof options.approvalProvider.consumeApproval !== 'function'
      || typeof options.approvalProvider.getInstallationToken !== 'function'
      || (options.verifyWorkflowSourceAttestation !== undefined
        && typeof options.verifyWorkflowSourceAttestation !== 'function')
      || (options.fetchImpl !== undefined && typeof options.fetchImpl !== 'function')) failConfiguration();

  const policy = deepFreeze(structuredClone(options.policy));
  const prClient = Object.freeze(Object.fromEntries([
    'getPullRequest', 'getPullRequestFiles', 'getWorkflowRuns', 'getWorkflowRunJobs',
  ].map((key) => [key, options.prClient[key].bind(options.prClient)])));
  const approvalProvider = Object.freeze({
    consumeApproval: options.approvalProvider.consumeApproval.bind(options.approvalProvider),
    getInstallationToken: options.approvalProvider.getInstallationToken.bind(options.approvalProvider),
  });
  const host = Object.freeze({
    repository,
    repositoryId: options.repositoryId,
    repoRoot: options.repoRoot,
    taskId: options.taskId,
    policy,
    prClient,
    approvalProvider,
    workflowAllowlist: normalizeAllowlist(options.workflowAllowlist, options.repositoryId),
    verifyWorkflowSourceAttestation: options.verifyWorkflowSourceAttestation ?? null,
    fetchImpl: options.fetchImpl ?? globalThis.fetch,
  });
  const context = Object.freeze(Object.create(null));
  hostContexts.set(context, host);
  return context;
}

export async function rerunFailedJobs(input) {
  if (!isRecord(input) || Object.keys(input).some((key) => !['host', 'decision', 'target', 'approval'].includes(key))
      || !Object.hasOwn(input, 'host') || !Object.hasOwn(input, 'decision') || !Object.hasOwn(input, 'target')) {
    return refused('invalid_request');
  }
  const host = input.host && typeof input.host === 'object' ? hostContexts.get(input.host) : undefined;
  if (!host) return refused('invalid_host_context');
  if (!isRecord(input.decision) || input.decision.action !== 'retry-check') return refused('retry_decision_required');

  let target;
  try {
    target = normalizeTarget(input.target, host);
  } catch (error) {
    return refused(error instanceof GitHubActionsWriteError ? error.code : 'invalid_target');
  }
  if (target.testedSha !== target.headSha && target.testedSha !== target.mergeSha) return refused('tested_sha_mismatch');
  const actionAttemptKey = actionAttemptDigest(host, target);

  let evidence = await collectTargetEvidence(host, target);
  if (evidence.reasonCode) return refused(evidence.reasonCode, 'refused', actionAttemptKey);
  let stateResult = await readCurrentState(host, target, evidence.snapshot);
  if (stateResult.reasonCode) return refused(stateResult.reasonCode, 'refused', actionAttemptKey);

  try {
    await host.approvalProvider.consumeApproval(input.approval, {
      repositoryId: target.repositoryId,
      prNumber: target.prNumber,
      baseSha: target.baseSha,
      headSha: target.headSha,
      mergeSha: target.mergeSha,
      capability: 'actions:rerun',
      paths: [target.entry.path],
      testedSha: target.testedSha,
      actionTarget: {
        workflowId: target.workflowId,
        runId: target.runId,
        runAttempt: target.runAttempt,
        failedJobIds: target.failedJobIds,
        requiredIdentity: target.requiredIdentity,
      },
    });
  } catch {
    return refused('approval_rejected', 'refused', actionAttemptKey);
  }

  evidence = await collectTargetEvidence(host, target);
  if (evidence.reasonCode) return refused(evidence.reasonCode, 'refused', actionAttemptKey);
  stateResult = await readCurrentState(host, target, evidence.snapshot);
  if (stateResult.reasonCode) return refused(stateResult.reasonCode, 'refused', actionAttemptKey);

  let token;
  try {
    token = await host.approvalProvider.getInstallationToken('actions:rerun');
  } catch {
    return refused('write_token_unavailable', 'refused', actionAttemptKey);
  }
  if (typeof token !== 'string' || token.length === 0 || token.length > 8192 || /[\x00-\x20\x7f]/.test(token)) {
    return refused('write_token_unavailable', 'refused', actionAttemptKey);
  }

  evidence = await collectTargetEvidence(host, target);
  if (evidence.reasonCode) return refused(evidence.reasonCode, 'refused', actionAttemptKey);
  stateResult = await readCurrentState(host, target, evidence.snapshot);
  if (stateResult.reasonCode) return refused(stateResult.reasonCode, 'refused', actionAttemptKey);

  let reservation;
  try {
    reservation = await reserveCIRunAttemptInRepository(host.repoRoot, host.taskId, actionAttemptKey, host.policy, {
      branch: evidence.snapshot.headRef,
      baseSha: target.baseSha,
      headSha: target.headSha,
    });
  } catch {
    return refused('state_reservation_failed', 'refused', actionAttemptKey);
  }
  if (reservation.status !== 'reserved') {
    return refused(reservation.reason ?? 'state_reservation_failed', 'refused', actionAttemptKey);
  }

  evidence = await collectTargetEvidence(host, target);
  if (evidence.reasonCode) {
    try {
      await finishCIRunAttemptInRepository(host.repoRoot, host.taskId, actionAttemptKey, 'rejected');
    } catch {
      return refused('attempt_finish_persist_failed', 'escalate', actionAttemptKey);
    }
    return refused(evidence.reasonCode, 'escalate', actionAttemptKey);
  }

  const url = API_ORIGIN + '/repos/' + encodeURIComponent(host.repository.owner) + '/'
    + encodeURIComponent(host.repository.name) + '/actions/runs/' + target.runId + '/rerun-failed-jobs';
  let response;
  try {
    response = await host.fetchImpl(url, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: 'Bearer ' + token,
        'X-GitHub-Api-Version': API_VERSION,
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    await finishCIRunAttemptInRepository(host.repoRoot, host.taskId, actionAttemptKey, 'uncertain').catch(() => {});
    return refused('network_uncertain', 'escalate', actionAttemptKey);
  }

  if (!response || !Number.isSafeInteger(response.status) || typeof response.headers?.get !== 'function') {
    await finishCIRunAttemptInRepository(host.repoRoot, host.taskId, actionAttemptKey, 'uncertain').catch(() => {});
    return refused('network_uncertain', 'escalate', actionAttemptKey);
  }

  if (response.status >= 300 && response.status < 400) {
    await finishCIRunAttemptInRepository(host.repoRoot, host.taskId, actionAttemptKey, 'rejected').catch(() => {});
    return refused('github_redirect_rejected', 'escalate', actionAttemptKey);
  }
  if (!response.ok) {
    await finishCIRunAttemptInRepository(host.repoRoot, host.taskId, actionAttemptKey, 'rejected').catch(() => {});
    if (response.status === 409) return refused('github_conflict', 'escalate', actionAttemptKey);
    if (response.status === 422) return refused('github_request_rejected', 'escalate', actionAttemptKey);
    if (response.status === 429 || (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0')) {
      return refused('github_rate_limited', 'escalate', actionAttemptKey);
    }
    if (response.status === 401) return refused('github_unauthorized', 'escalate', actionAttemptKey);
    if (response.status === 403) return refused('github_forbidden', 'escalate', actionAttemptKey);
    if (response.status === 404) return refused('github_not_found', 'escalate', actionAttemptKey);
    return refused('github_write_failed', 'escalate', actionAttemptKey);
  }

  try {
    await finishCIRunAttemptInRepository(host.repoRoot, host.taskId, actionAttemptKey, 'submitted');
  } catch {
    return refused('attempt_finish_persist_failed', 'escalate', actionAttemptKey);
  }
  return refused(null, 'submitted', actionAttemptKey);
}
