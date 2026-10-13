import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

import { loadAutonomyPolicy, loadLoopPolicy } from '../policy.mjs';
import { classifyRisk } from '../classify-risk.mjs';
import { createLoopStateInRepository, validateLoopState } from '../state.mjs';
import { buildVerificationPlan, readGitHeadRevision, readGitWorkspaceFingerprint, runVerificationPlan } from '../verify.mjs';
import { createRunnerHost } from './host.mjs';
import { createDockerRunnerAdapter, createPolicyPatchAuthorizer } from './docker-adapter.mjs';
import { applyAuthorizedRunnerPatch } from './apply-patch.mjs';
import { createTaskWorktree } from './worktree.mjs';

const OPTION_KEYS = [
  'session', 'repoRoot', 'runnerRoot', 'issueContext', 'allowedPaths', 'docker', 'invokeModelCall',
  'leaseMs', 'leaseRenewIntervalMs', 'maxOutputBytes', 'maxPatchBytes',
];
const ISSUE_KEYS = ['repositoryId', 'issueNumber', 'issueTitle', 'issueBody'];
const DOCKER_KEYS = [
  'dockerPath', 'imageDigest', 'maxContainerMemoryBytes', 'maxContainerCpuCount', 'maxContainerPids',
];
const REVISION = /^[a-f0-9]{40,64}$/i;
const DIGEST = /^[a-f0-9]{64}$/i;
const TASK_ID = /^repo-[1-9][0-9]*-issue-[1-9][0-9]*-g[1-9][0-9]*$/;
const MAX_ISSUE_BODY_BYTES = 64 * 1024;

export class TaskImplementationPipelineError extends Error {
  constructor(code, options = {}) {
    super(code, options);
    this.name = new.target.name;
    this.code = code;
  }
}

function fail(code, cause) { throw new TaskImplementationPipelineError(code, cause ? { cause } : undefined); }
function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}
function exactKeys(value, keys, code) {
  if (!plainObject(value) || Object.keys(value).sort().join('|') !== [...keys].sort().join('|')) fail(code);
}
function boundedInteger(value, min, max) { return Number.isSafeInteger(value) && value >= min && value <= max; }

function validateOptions(input) {
  if (!plainObject(input) || Object.keys(input).some((key) => !OPTION_KEYS.includes(key))
      || ['session', 'repoRoot', 'runnerRoot', 'issueContext', 'allowedPaths', 'docker', 'invokeModelCall']
        .some((key) => !Object.hasOwn(input, key))) fail('pipeline_configuration_invalid');
  if (typeof input.session?.current !== 'function' || typeof input.session?.assertLease !== 'function'
      || typeof input.session?.advance !== 'function' || typeof input.session?.reserve !== 'function'
      || typeof input.session?.renew !== 'function' || typeof input.session?.context !== 'function'
      || typeof input.session?.bindWorkspace !== 'function'
      || typeof input.repoRoot !== 'string' || input.repoRoot.length === 0
      || typeof input.runnerRoot !== 'string' || input.runnerRoot.length === 0
      || typeof input.invokeModelCall !== 'function') fail('pipeline_configuration_invalid');
  exactKeys(input.issueContext, ISSUE_KEYS, 'pipeline_issue_invalid');
  if (!boundedInteger(input.issueContext.repositoryId, 1, Number.MAX_SAFE_INTEGER)
      || !boundedInteger(input.issueContext.issueNumber, 1, Number.MAX_SAFE_INTEGER)
      || typeof input.issueContext.issueTitle !== 'string'
      || Buffer.byteLength(input.issueContext.issueTitle, 'utf8') > 512
      || typeof input.issueContext.issueBody !== 'string'
      || Buffer.byteLength(input.issueContext.issueBody, 'utf8') > MAX_ISSUE_BODY_BYTES
      || input.issueContext.issueBody.trim().length === 0) fail('pipeline_issue_invalid');
  if (!Array.isArray(input.allowedPaths) || input.allowedPaths.length < 1 || input.allowedPaths.length > 200
      || input.allowedPaths.some((candidate) => typeof candidate !== 'string')) fail('pipeline_paths_invalid');
  exactKeys(input.docker, DOCKER_KEYS, 'pipeline_docker_invalid');
  if (typeof input.docker.dockerPath !== 'string' || input.docker.dockerPath.length < 1
      || typeof input.docker.imageDigest !== 'string'
      || !/^[a-z0-9./_-]+@sha256:[a-f0-9]{64}$/i.test(input.docker.imageDigest)
      || !boundedInteger(input.docker.maxContainerMemoryBytes, 128 * 1024 * 1024, 8 * 1024 * 1024 * 1024)
      || !Number.isFinite(input.docker.maxContainerCpuCount) || input.docker.maxContainerCpuCount < 0.25 || input.docker.maxContainerCpuCount > 8
      || !boundedInteger(input.docker.maxContainerPids, 16, 1024)) fail('pipeline_docker_invalid');
  const leaseMs = input.leaseMs ?? 15 * 60 * 1000;
  const leaseRenewIntervalMs = input.leaseRenewIntervalMs ?? 60 * 1000;
  const maxOutputBytes = input.maxOutputBytes ?? 64 * 1024;
  const maxPatchBytes = input.maxPatchBytes ?? 256 * 1024;
  if (!boundedInteger(leaseMs, 1, 15 * 60 * 1000)
      || !boundedInteger(leaseRenewIntervalMs, 1, Math.floor(leaseMs / 2))
      || !boundedInteger(maxOutputBytes, 1024, 1024 * 1024)
      || !boundedInteger(maxPatchBytes, 1, 1024 * 1024)) fail('pipeline_limits_invalid');
  return Object.freeze({ ...input, leaseMs, leaseRenewIntervalMs, maxOutputBytes, maxPatchBytes });
}

function compareRecord(record, input) {
  if (!record || !TASK_ID.test(record.taskId)
      || record.key.repositoryId !== input.issueContext.repositoryId
      || record.key.issueNumber !== input.issueContext.issueNumber
      || record.taskId !== `repo-${record.key.repositoryId}-issue-${record.key.issueNumber}-g${record.key.generation}`
      || !DIGEST.test(record.requestDigest) || !REVISION.test(record.sourceRevision)
      || !REVISION.test(record.policyRevision)) fail('pipeline_task_record_invalid');
  const digest = createHash('sha256').update(input.issueContext.issueBody, 'utf8').digest('hex');
  if (digest !== record.requestDigest.toLowerCase()) fail('pipeline_issue_digest_mismatch');
  if (record.state !== 'queued') fail('pipeline_task_not_queued');
}

function normalizePaths(paths, policy) {
  const eligible = new Set(policy.eligiblePaths.map((candidate) => candidate.toLowerCase()));
  const normalized = paths.map((candidate) => {
    if (candidate.startsWith('/') || candidate.includes('\\') || candidate.split('/').some((part) => part === '' || part === '.' || part === '..')) {
      fail('pipeline_paths_invalid');
    }
    return candidate;
  });
  if (new Set(normalized.map((candidate) => candidate.toLowerCase())).size !== normalized.length
      || normalized.some((candidate) => !eligible.has(candidate.toLowerCase()))) fail('pipeline_paths_not_eligible');
  return Object.freeze([...normalized]);
}

function boundedVerifierEvidence(result, expectedPlan, expectedRevision, expectedFingerprint) {
  if (!result || result.mode !== 'full' || result.passed !== true
      || result.revisionStable !== true || result.workspaceStable !== true
      || result.verifiedRevision !== expectedRevision || result.currentRevision !== expectedRevision
      || result.verifiedWorkspaceFingerprint !== expectedFingerprint
      || result.currentWorkspaceFingerprint !== expectedFingerprint
      || !Array.isArray(result.requiredExternalChecks) || result.requiredExternalChecks.length > 32
      || result.requiredExternalChecks.some((id) => typeof id !== 'string' || !/^[a-z][a-z0-9_-]{0,63}$/.test(id))
      || result.requiredExternalChecks.join('|') !== expectedPlan.requiredExternalChecks.join('|')
      || !Array.isArray(result.commands) || result.commands.length !== expectedPlan.commands.length
      || result.commands.some((command, index) => !command || command.id !== expectedPlan.commands[index].id
        || !Number.isSafeInteger(command.exitCode) || !Number.isSafeInteger(command.durationMs)
        || command.durationMs < 0 || command.signal !== null || command.spawnErrorCode !== null)) {
    fail('pipeline_local_verification_failed');
  }
  return Object.freeze({
    mode: 'full', passed: true, complete: result.complete === true,
    verifiedRevision: result.verifiedRevision,
    verifiedWorkspaceFingerprint: result.verifiedWorkspaceFingerprint,
    requiredExternalChecks: Object.freeze([...result.requiredExternalChecks]),
    commands: Object.freeze(result.commands.map((command) => Object.freeze({
      id: command.id, exitCode: command.exitCode, durationMs: command.durationMs,
      passed: command.exitCode === 0 && command.signal === null && command.spawnErrorCode === null,
    }))),
  });
}

function reasonOf(error) {
  const value = error?.code;
  return typeof value === 'string' && /^[a-z][a-z0-9_-]{0,63}$/.test(value) ? value : 'task_implementation_failed';
}

/**
 * Bind a transient, re-fetched Issue to a fresh TaskRecord and run the complete
 * isolated implementation, host patch gate, and fixed full local verification flow.
 * Model credentials remain in the injected trusted-host broker callback.
 */
function createTaskImplementationPipelineImpl(rawOptions, verifier) {
  if (typeof verifier !== 'function') fail('pipeline_configuration_invalid');
  const options = validateOptions(rawOptions);
  let running = false;

  async function run(runOptions = {}) {
    if (!plainObject(runOptions) || Object.keys(runOptions).some((key) => key !== 'signal')
        || (runOptions.signal !== undefined && typeof runOptions.signal?.addEventListener !== 'function')) fail('pipeline_run_options_invalid');
    if (running) fail('pipeline_already_running');
    if (runOptions.signal?.aborted) return Object.freeze({ status: 'interrupted', reason: 'runner_interrupted' });
    running = true;
    const abortController = new AbortController();
    let leaseLost = false;
    let retainLease = false;
    let escalationPersisted = false;
    let currentTaskId = null;
    let heartbeat;
    const externalSignal = runOptions.signal;
    const onExternalAbort = () => abortController.abort();
    externalSignal?.addEventListener('abort', onExternalAbort, { once: true });
    heartbeat = setInterval(() => {
      void options.session.renew(options.leaseMs).catch(() => {
        void options.session.assertLease().catch(() => {
          leaseLost = true;
          abortController.abort();
        });
      });
    }, options.leaseRenewIntervalMs);
    heartbeat.unref?.();

    let phaseStarted = false;
    let request;
    let taskWorktree;
    try {
      let record = await options.session.assertLease();
      currentTaskId = record.taskId;
      compareRecord(record, options);
      const task = Object.freeze({ ...record });
      const loopCtx = await options.session.current();
      if (loopCtx.taskId !== task.taskId || loopCtx.requestDigest !== task.requestDigest
          || loopCtx.sourceRevision !== task.sourceRevision || loopCtx.policyRevision !== task.policyRevision) fail('pipeline_task_record_stale');

      record = await options.session.advance('start');
      phaseStarted = true;
      taskWorktree = await createTaskWorktree({
        repositoryRoot: options.repoRoot, runnerRoot: options.runnerRoot,
        sourceRevision: record.sourceRevision, taskId: record.taskId,
      });
      if (taskWorktree.baseRevision !== record.sourceRevision.toLowerCase()) fail('pipeline_worktree_revision_mismatch');

      const [policy, loopPolicy] = await Promise.all([
        loadAutonomyPolicy(taskWorktree.path, record.policyRevision.toLowerCase()),
        loadLoopPolicy(taskWorktree.path),
      ]);
      if (policy.enabled !== true || policy.autoMergeEnabled !== false
          || policy.trustedRevision.toLowerCase() !== record.policyRevision.toLowerCase()
          || policy.runner.provider !== 'openai' || policy.runner.model !== 'GPT-6-Luna'
          || policy.eligibleRisks.some((risk) => !['low', 'medium'].includes(risk))
          || !policy.capabilities.includes('propose_patch') || !policy.capabilities.includes('run_fixed_verifier')) {
        fail('pipeline_policy_not_eligible');
      }
      const allowedPaths = normalizePaths(options.allowedPaths, policy);
      const authorizePatch = createPolicyPatchAuthorizer(loopPolicy, policy);
      if (!authorizePatch({ paths: allowedPaths })) fail('pipeline_scope_risk_not_eligible');

      // Seed only a brand-new task worktree from host-validated state. The task
      // session then reloads state from this worktree for every CAS/reducer step.
      // Existing worktrees are refused by createTaskWorktree until recovery can
      // prove their identity and safely reconcile their state.
      const loaded = await options.session.context();
      const sourceRecord = loaded?.record;
      const sourceState = loaded?.context?.loopState;
      if (!sourceRecord || sourceRecord.taskId !== record.taskId || sourceRecord.state !== 'planning'
          || sourceRecord.requestDigest !== record.requestDigest || sourceRecord.sourceRevision !== record.sourceRevision
          || sourceRecord.policyRevision !== record.policyRevision || !sourceState) fail('pipeline_task_context_invalid');
      const expectedSessionLoopPolicy = Object.freeze({ schemaVersion: 1, stopConditions: loopPolicy.stopConditions });
      if (!isDeepStrictEqual(loaded.context.policy, policy)
          || !isDeepStrictEqual(loaded.context.loopPolicy, expectedSessionLoopPolicy)) fail('pipeline_task_context_invalid');
      validateLoopState(sourceState);
      const expectedBranch = `codex/issue-${record.key.issueNumber}-g${record.key.generation}`;
      if (sourceState.taskId !== record.links.loopStateTaskId
          || sourceState.baseSha.toLowerCase() !== record.sourceRevision.toLowerCase()
          || sourceState.headSha.toLowerCase() !== record.sourceRevision.toLowerCase()) fail('pipeline_loop_state_stale');
      if (sourceState.acceptanceCriteria.map(({ id }) => id).join('|') !== record.acceptanceIds.join('|')
          || sourceState.maxIterations !== loopPolicy.stopConditions.maxIterations
          || sourceState.budgets.tokenLimit !== loopPolicy.stopConditions.tokenLimit
          || sourceState.budgets.wallClockLimitSeconds !== loopPolicy.stopConditions.maxWallClockSeconds
          || sourceState.budgets.ciRunLimit !== loopPolicy.stopConditions.ciRunLimit
          || sourceState.iteration > record.budgets.repairs
          || (record.budgets.lastModelTokenUsed !== null
            && (sourceState.budgets.tokenUsed === null || sourceState.budgets.tokenUsed < record.budgets.lastModelTokenUsed))) {
        fail('pipeline_loop_state_budget_mismatch');
      }
      const scopeRisk = classifyRisk({ paths: allowedPaths }, loopPolicy).level;
      const riskRank = { low: 0, medium: 1, high: 2, critical: 3 };
      if (!Object.hasOwn(riskRank, sourceState.risk) || !Object.hasOwn(riskRank, scopeRisk)) {
        fail('pipeline_loop_state_risk_invalid');
      }
      const effectiveRisk = riskRank[sourceState.risk] >= riskRank[scopeRisk] ? sourceState.risk : scopeRisk;
      if (!policy.eligibleRisks.includes(effectiveRisk)) fail('pipeline_loop_state_risk_invalid');
      const taskLoopState = Object.freeze({ ...sourceState, branch: expectedBranch,
        risk: effectiveRisk });
      validateLoopState(taskLoopState);
      await createLoopStateInRepository(taskWorktree.path, taskLoopState);
      const boundRecord = await options.session.bindWorkspace(taskWorktree.path);
      if (boundRecord.taskId !== record.taskId || boundRecord.state !== 'planning'
          || boundRecord.requestDigest !== record.requestDigest || boundRecord.sourceRevision !== record.sourceRevision
          || boundRecord.policyRevision !== record.policyRevision) fail('pipeline_task_record_stale');

      const baseRevision = await readGitHeadRevision(taskWorktree.path);
      const expectedWorkspaceFingerprint = await readGitWorkspaceFingerprint(taskWorktree.path);
      if (baseRevision !== record.sourceRevision.toLowerCase()) fail('pipeline_worktree_revision_mismatch');
      request = Object.freeze({
        schemaVersion: 1,
        task: Object.freeze({
          taskId: record.taskId, repositoryId: record.key.repositoryId,
          issueNumber: record.key.issueNumber, generation: record.key.generation,
          requestDigest: record.requestDigest, sourceRevision: record.sourceRevision.toLowerCase(),
          policyRevision: record.policyRevision.toLowerCase(),
        }),
        untrustedContext: Object.freeze({ issueTitle: options.issueContext.issueTitle, issueBody: options.issueContext.issueBody }),
        workspace: Object.freeze({ path: taskWorktree.path, baseRevision, allowedPaths }),
        limits: Object.freeze({
          wallClockSeconds: Math.max(1, Math.min(loopPolicy.stopConditions.maxWallClockSeconds,
            Math.floor((Date.parse(record.deadline) - Date.now()) / 1000))),
          maxOutputBytes: options.maxOutputBytes, maxPatchBytes: options.maxPatchBytes,
        }),
        capabilities: Object.freeze(['read_checkout', 'write_worktree', 'run_fixed_verifier']),
      });

      record = await options.session.advance('execute');
      const executionLease = await options.session.assertLease();
      if (executionLease.taskId !== record.taskId || executionLease.state !== 'executing'
          || executionLease.requestDigest !== record.requestDigest
          || executionLease.sourceRevision !== record.sourceRevision || executionLease.policyRevision !== record.policyRevision) {
        fail('pipeline_task_record_stale');
      }
      const adapter = createDockerRunnerAdapter({
        ...options.docker,
        modelName: policy.runner.model,
        maxModelCalls: policy.budgets.maxModelCalls,
        reserveModelCall: async () => options.session.reserve('model'),
        invokeModelCall: options.invokeModelCall,
        authorizePatch,
        spawnImpl: undefined,
      });
      const runner = createRunnerHost({
        maxConcurrentTasks: policy.budgets.taskConcurrency,
        maxWallClockSeconds: Math.min(loopPolicy.stopConditions.maxWallClockSeconds,
          Math.max(1, Math.floor((Date.parse(record.deadline) - Date.now()) / 1000))),
        cancellationGraceMs: 10_000,
        reserveModelCall: async () => options.session.reserve('model'),
        startIsolatedExecution: (validated, context) => adapter.startIsolatedExecution(validated, context),
      });
      const execution = await runner.run(request, { signal: abortController.signal });
      if (execution.status !== 'completed') {
        retainLease = execution.reason === 'runner_cancellation_unconfirmed';
        fail(execution.reason ?? 'runner_process_failed');
      }

      const preApplyLease = await options.session.assertLease();
      if (preApplyLease.taskId !== record.taskId || preApplyLease.state !== 'executing'
          || preApplyLease.requestDigest !== record.requestDigest
          || preApplyLease.sourceRevision !== record.sourceRevision || preApplyLease.policyRevision !== record.policyRevision) {
        fail('pipeline_task_record_stale');
      }
      const applied = await applyAuthorizedRunnerPatch({
        repoRoot: taskWorktree.path, request, result: execution.result,
        policy, loopPolicy, expectedWorkspaceFingerprint,
        assertLease: async () => {
          const fresh = await options.session.assertLease();
          if (fresh.taskId !== record.taskId || fresh.state !== 'executing'
              || fresh.requestDigest !== record.requestDigest || fresh.sourceRevision !== record.sourceRevision
              || fresh.policyRevision !== record.policyRevision) fail('pipeline_task_record_stale');
        },
      });
      record = await options.session.advance('verify');

      const plan = buildVerificationPlan({ changedPaths: applied.changedPaths, mode: 'full', policy: loopPolicy });
      const verification = await verifier(plan, { repoRoot: taskWorktree.path });
      const verifierEvidence = boundedVerifierEvidence(verification, plan, applied.baseRevision, applied.workspaceFingerprint);
      await options.session.assertLease();
      record = await options.session.advance('deliver');
      return Object.freeze({
        status: 'ready_for_delivery', taskId: record.taskId, state: record.state,
        sourceRevision: applied.baseRevision, workspaceFingerprint: verifierEvidence.verifiedWorkspaceFingerprint,
        changedPaths: applied.changedPaths, verification: verifierEvidence,
        pendingExternalChecks: verifierEvidence.requiredExternalChecks,
        worktreePath: taskWorktree.path,
      });
    } catch (error) {
      const reason = leaseLost ? 'task_lease_lost' : reasonOf(error);
      if (leaseLost) retainLease = true;
      if (phaseStarted && !leaseLost) {
        try {
          const fresh = await options.session.assertLease();
          if (['planning', 'executing', 'verifying', 'delivering'].includes(fresh.state)) {
            await options.session.advance('escalate', { reason });
            escalationPersisted = true;
          }
        } catch { retainLease = true; leaseLost = true; }
      }
      return Object.freeze({
        status: leaseLost ? 'stale' : escalationPersisted ? 'escalated' : 'failed', taskId: currentTaskId,
        reason, retainLease, ...(taskWorktree ? { worktreePath: taskWorktree.path } : {}),
      });
    } finally {
      clearInterval(heartbeat);
      externalSignal?.removeEventListener('abort', onExternalAbort);
      running = false;
    }
  }

  return Object.freeze({ run, get isRunning() { return running; } });
}

/** Production entry point always runs the fixed local verifier. */
export function createTaskImplementationPipeline(rawOptions) {
  return createTaskImplementationPipelineImpl(rawOptions, runVerificationPlan);
}

/** Explicit test seam; tests must label injected verifier evidence as simulated. */
export function createTaskImplementationPipelineForTests(rawOptions, verifier) {
  return createTaskImplementationPipelineImpl(rawOptions, verifier);
}
