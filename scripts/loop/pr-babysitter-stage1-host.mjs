import path from 'node:path';
import { realpath } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline/promises';

import { parsePrBabysitterArguments, runPrBabysitterCli, PR_BABYSITTER_EXIT_CODES } from './pr-babysitter-cli.mjs';
import { createPrBabysitterStage0Host, STAGE0_REPOSITORY } from './pr-babysitter-host.mjs';
import { createGitHubWorkflowSourceAttestationProvider } from './github-workflow-source-attestation.mjs';
import { createWorkflowSourceVerifier } from './workflow-source-attestation.mjs';
import { selectUniqueStage1CheckTarget } from './stage1-check-target.mjs';
import { createStage1Prompt } from './stage1-prompt.mjs';
import { createStage1DispatchHost, dispatchStage1Retry } from './stage1-dispatch-write.mjs';
import { observeStage1Retry } from './stage1-retry-observer.mjs';
import { decidePrAction } from './pr-babysitter.mjs';
import { recordFlakyRetry } from './pr-state.mjs';
import { classifyRisk } from './classify-risk.mjs';
import { loadStage1TrustConfig, stage1OperatingSystemHomeDirectory } from './stage1-trust-config.mjs';
import {
  createLoopState, createLoopStateInRepository, finishCIRunAttemptInRepository, loadLoopState,
  LoopStateAlreadyExistsError, LoopStateNotFoundError, reserveCIRunAttemptInRepository,
} from './state.mjs';

export const STAGE1_TRUST_STATUS = Object.freeze({
  sourceAttestationProvider: 'configured',
  workflowAllowlistEntries: 1,
  trustedApproverIds: 'user-local-config',
  ciRunBudgetSession: 'explicit-per-pr',
});

export function assertStage1Command(args, isTTY) {
  if (!args || !['inspect', 'rerun-flaky', 'initialize-budget'].includes(args.command)) {
    throw Object.assign(new Error('stage1_command_refused'), { code: 'stage1_command_refused' });
  }
  if (args.repository !== STAGE0_REPOSITORY) {
    throw Object.assign(new Error('repository_not_allowlisted'), { code: 'repository_not_allowlisted' });
  }
  if (args.command !== 'inspect' && isTTY !== true && args.dryRun !== true) {
    throw Object.assign(new Error('interactive_tty_required'), { code: 'interactive_tty_required' });
  }
  return true;
}

function stage1TaskId(prNumber, snapshot) {
  return `stage1-pr-${prNumber}-${snapshot.baseSha.slice(0, 12)}-${snapshot.headSha.slice(0, 12)}`;
}

function stage1Error(reasonCode) {
  return Object.assign(new Error(reasonCode), { reasonCode });
}

async function canonicalizePossiblyMissingPath(candidate) {
  let current = path.resolve(candidate);
  const unresolved = [];
  while (true) {
    try {
      return path.resolve(await realpath(current), ...unresolved);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      const parent = path.dirname(current);
      if (parent === current) throw error;
      unresolved.unshift(path.basename(current));
      current = parent;
    }
  }
}

function pathContains(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

async function stage1BudgetStoreRoot(repoRoot = process.cwd()) {
  let homeDirectory;
  let canonicalRepoRoot;
  let canonicalBudgetStateDirectory;
  try {
    homeDirectory = await realpath(stage1OperatingSystemHomeDirectory());
    canonicalRepoRoot = await realpath(repoRoot);
    canonicalBudgetStateDirectory = await canonicalizePossiblyMissingPath(path.join(homeDirectory, '.loop', 'state'));
  } catch { throw stage1Error('ci_run_budget_session_unavailable'); }
  const requestedBudgetStateDirectory = path.resolve(homeDirectory, '.loop', 'state');
  if (pathContains(canonicalRepoRoot, requestedBudgetStateDirectory)
      || pathContains(canonicalRepoRoot, canonicalBudgetStateDirectory)) {
    throw stage1Error('ci_run_budget_session_unavailable');
  }
  return homeDirectory;
}

function stage1ApprovalTarget(target) {
  return Object.freeze({
    repositoryId: target.repositoryId,
    prNumber: target.prNumber,
    baseSha: target.baseSha,
    headSha: target.headSha,
    mergeSha: target.mergeSha,
    testedSha: target.testedSha,
    context: target.context,
    appId: target.appId,
    checkRunId: target.checkRunId,
    policyFingerprint: target.policyFingerprint,
    workflowId: target.workflowId,
    workflowPath: target.workflowPath,
    workflowRef: target.workflowRef,
    workflowSourceSha: target.workflowSourceSha,
    requestId: target.requestId,
    actorId: target.actorId,
    actorLogin: target.actorLogin,
  });
}

function sameTargetIgnoringRequest(left, right) {
  if (!left || !right) return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length
    && keys.every((key) => key === 'requestId' || left[key] === right[key]);
}

async function readBudgetSessionAtRoot(budgetRoot, prNumber, snapshot, policy) {
  const taskId = stage1TaskId(prNumber, snapshot);
  let state;
  try { state = await loadLoopState(budgetRoot, taskId); }
  catch (error) {
    if (error instanceof LoopStateNotFoundError) throw stage1Error('ci_run_budget_session_unavailable');
    throw stage1Error('ci_run_budget_session_invalid');
  }
  if (state.branch !== snapshot.headRef || state.baseSha !== snapshot.baseSha || state.headSha !== snapshot.headSha
      || state.budgets.ciRunLimit !== policy.stopConditions.ciRunLimit
      || state.budgets.wallClockLimitSeconds !== policy.stopConditions.maxWallClockSeconds
      || state.budgets.tokenLimit !== policy.stopConditions.tokenLimit) throw stage1Error('ci_run_budget_session_stale');
  return state;
}

export async function readStage1BudgetSession(prNumber, snapshot, policy, { repoRoot = process.cwd() } = {}) {
  return readBudgetSessionAtRoot(await stage1BudgetStoreRoot(repoRoot), prNumber, snapshot, policy);
}

// Inspection stays read-only; dispatch adapters are attached only after the local trust file is loaded.
export async function createPrBabysitterStage1Host({ prNumber, repoRoot = process.cwd(), env = process.env,
  io = {}, enableDispatch = false } = {}) {
  const trust = enableDispatch ? await loadStage1TrustConfig() : null;
  let approvalReview = null;
  const input = io.input ?? process.stdin;
  const output = io.output ?? process.stdout;
  const stage1Prompt = createStage1Prompt({ input, output, getReviewContext: async () => approvalReview });
  stage1Prompt.isTTY = io.isTTY ?? (input.isTTY === true && output.isTTY === true);
  const base = await createPrBabysitterStage0Host({
    prNumber,
    repoRoot,
    env,
    createWorkflowSourceVerifier: ({ getObserveToken }) => createStage1WorkflowSourceVerifier({ getObserveToken }),
    trustedApproverIds: trust?.trustedApproverIds ?? [],
    stage1Prompt,
    stage1Enabled: enableDispatch,
  });
  if (!enableDispatch) return base;

  const { pr, auth } = base.adapters;
  const sourceVerifier = createStage1WorkflowSourceVerifier({ getObserveToken: auth.getInstallationToken });
  const policy = base.config.policy;
  const stopConditions = policy.stopConditions;
  const actions = Object.freeze({
    stage1: true,
    async recover({ decision, observations, prSnapshot, collected, prState }) {
      const taskId = stage1TaskId(prNumber, prSnapshot);
      const budgetRoot = await stage1BudgetStoreRoot(repoRoot);
      const loopState = await readBudgetSessionAtRoot(budgetRoot, prNumber, prSnapshot, policy);
      const remainingCIRuns = Math.max(0, Math.min(
        stopConditions.ciRunLimit - loopState.budgets.ciRuns,
        loopState.budgets.ciRunLimit - loopState.budgets.ciRuns,
      ));
      if (remainingCIRuns < 1 || decision.retryBudgetRemaining < 1) return { status: 'refused', reasonCode: 'ci_budget_unavailable' };
      const workflow = await pr.getWorkflowByPath('.github/workflows/stage1-trusted-retry.yml');
      if (workflow?.status !== 'current' || workflow.path !== '.github/workflows/stage1-trusted-retry.yml') {
        return { status: 'refused', reasonCode: 'trusted_workflow_unavailable' };
      }
      const trustedWorkflow = {
        repositoryId: base.config.repositoryId,
        workflowId: workflow.workflowId,
        path: workflow.path,
        ref: 'main',
        sourceSha: prSnapshot.baseSha,
        actorId: trust.workflowActorId,
        actorLogin: trust.workflowActorLogin,
      };
      const target = selectUniqueStage1CheckTarget({ decision, prSnapshot,
        requiredCheckSnapshot: collected.requiredCheckSnapshot, checkObservations: observations,
        changedFiles: collected.changedFiles, workflowRuns: collected.workflowRuns, trustedWorkflow });
      const actionRisk = classifyRisk({ paths: [target.workflowPath], actions: ['stage1_required_check_recovery'] }, policy);
      if (actionRisk.level !== 'high' || !actionRisk.matchedRules.includes('highRiskAction:stage1_required_check_recovery')) {
        return { status: 'refused', reasonCode: 'stage1_action_policy_mismatch' };
      }
      const approvalTarget = stage1ApprovalTarget(target);
      await auth.authenticateApprover();
      const scope = { repositoryId: base.config.repositoryId, prNumber, baseSha: target.baseSha, headSha: target.headSha,
        mergeSha: target.mergeSha, capability: 'stage1:required-check-recovery',
        paths: [target.workflowPath], stage1Target: approvalTarget };
      approvalReview = {
        repositoryId: scope.repositoryId, prNumber: scope.prNumber,
        revision: { baseSha: scope.baseSha, headSha: scope.headSha, mergeSha: scope.mergeSha },
        capability: scope.capability, paths: scope.paths, stage1Target: scope.stage1Target,
        branch: prSnapshot.headRef, classification: 'flaky', remainingCIRuns,
        remainingFlakyRetries: decision.retryBudgetRemaining,
      };
      const approval = await auth.requestApproval(scope);
      const dispatchHost = createStage1DispatchHost({
        repository: base.config.repository,
        repositoryId: base.config.repositoryId,
        workflowId: target.workflowId,
        workflowPath: target.workflowPath,
        getReadToken: () => auth.getInstallationToken('observe'),
        getWriteToken: auth.getStage1WriteToken,
        revalidate: async (approved, _readToken) => {
          const fresh = await pr.collect(prNumber, { testedSha: approved.testedSha });
          const freshWorkflow = await pr.getWorkflowByPath(approved.workflowPath);
          if (freshWorkflow?.status !== 'current' || freshWorkflow.workflowId !== approved.workflowId) return null;
          const freshDecision = decidePrAction({ prSnapshot: fresh.prSnapshot,
            requiredCheckSnapshot: fresh.requiredCheckSnapshot, checkObservations: fresh.checkObservations,
            checkCollectionComplete: fresh.checkCollectionComplete, prState, policy });
          let refreshed;
          try {
            refreshed = selectUniqueStage1CheckTarget({ decision: freshDecision, prSnapshot: fresh.prSnapshot,
              requiredCheckSnapshot: fresh.requiredCheckSnapshot, checkObservations: fresh.checkObservations,
              changedFiles: fresh.changedFiles, workflowRuns: fresh.workflowRuns,
              trustedWorkflow: { ...trustedWorkflow, sourceSha: fresh.prSnapshot.baseSha } });
          } catch { return null; }
          return sameTargetIgnoringRequest(approved, refreshed) ? { ...refreshed, requestId: approved.requestId } : null;
        },
        consumeApproval: (_approval, candidate) => auth.consumeApproval(_approval, {
          ...scope, stage1Target: stage1ApprovalTarget(candidate),
        }),
        reserveBudget: async (attemptKey) => {
          const verifiedBudgetRoot = await stage1BudgetStoreRoot(repoRoot);
          if (verifiedBudgetRoot !== budgetRoot) throw stage1Error('ci_run_budget_session_unavailable');
          const reserved = await reserveCIRunAttemptInRepository(budgetRoot, taskId, attemptKey, policy.stopConditions, {
            branch: prSnapshot.headRef, baseSha: prSnapshot.baseSha, headSha: prSnapshot.headSha,
          });
          return reserved.status === 'reserved';
        },
        finishBudget: async (attemptKey, status) => {
          const verifiedBudgetRoot = await stage1BudgetStoreRoot(repoRoot);
          if (verifiedBudgetRoot !== budgetRoot) throw stage1Error('ci_run_budget_session_unavailable');
          return finishCIRunAttemptInRepository(budgetRoot, taskId, attemptKey, status);
        },
        fetchImpl: globalThis.fetch,
      });
      const dispatched = await dispatchStage1Retry({ host: dispatchHost, decision, target, approval });
      if (dispatched.status !== 'submitted') return dispatched;
      await base.adapters.state.save(STAGE0_REPOSITORY, prNumber,
        recordFlakyRetry(prState, `check:${target.checkRunId}`), decision);

      const elapsedMs = Date.now() - Date.parse(loopState.startedAt);
      const remainingWallClockMs = stopConditions.maxWallClockSeconds * 1000 - elapsedMs;
      if (!Number.isFinite(remainingWallClockMs) || remainingWallClockMs < 1) return { status: 'escalate', reasonCode: 'max_wall_clock' };
      const result = await observeStage1Retry({
        target,
        workflowRunId: dispatched.workflowRunId,
        timeoutMs: Math.floor(remainingWallClockMs),
        maxWallClockSeconds: stopConditions.maxWallClockSeconds,
        getRun: async (runId) => {
          const observed = await pr.getWorkflowRunById(runId);
          if (!observed?.run || !['current', 'incomplete'].includes(observed.status)) return observed;
          if (observed.run.status !== 'completed') return { ...observed, status: 'current' };
          const identity = { type: 'workflow', repositoryId: target.repositoryId,
            path: target.workflowPath, ref: 'refs/heads/main', sha: target.workflowSourceSha };
          const snapshot = { repositoryId: target.repositoryId, number: target.prNumber,
            baseSha: target.baseSha, headSha: target.headSha, mergeSha: target.mergeSha };
          const attested = await sourceVerifier({ identity, run: observed.run, snapshot, dispatchTarget: target });
          if (!attested || attested.sourceSha !== target.workflowSourceSha
            || attested.dispatchTarget?.requestId !== target.requestId) return { ...observed, status: 'incomplete' };
          return { ...observed, status: 'current', run: { ...observed.run, sourceSha: attested.sourceSha } };
        },
        readCurrent: async (approved) => {
          const current = await pr.collect(prNumber, { testedSha: approved.testedSha });
          return { prSnapshot: current.prSnapshot, requiredCheckSnapshot: current.requiredCheckSnapshot,
            checkCollectionComplete: current.checkCollectionComplete, checkObservations: current.checkObservations,
            workflowEvidence: current.stage0Summary?.workflowEvidence, testedSha: approved.testedSha };
        },
      });
      return result;
    },
  });
  const adapters = Object.freeze({ ...base.adapters, actions });
  return Object.freeze({ ...base, adapters });
}

export function createStage1WorkflowSourceVerifier({
  getObserveToken,
  providerFactory = createGitHubWorkflowSourceAttestationProvider,
} = {}) {
  if (typeof getObserveToken !== 'function' || typeof providerFactory !== 'function') {
    throw Object.assign(new Error('stage1_source_attestation_configuration_invalid'), {
      reasonCode: 'stage1_source_attestation_configuration_invalid',
    });
  }
  const provider = providerFactory({
    repository: STAGE0_REPOSITORY,
    getToken: async (capability) => {
      if (capability !== 'observe') {
        throw Object.assign(new Error('stage1_read_only'), { reasonCode: 'stage1_read_only' });
      }
      return getObserveToken('source-attestation:read');
    },
  });
  return createWorkflowSourceVerifier({
    repository: STAGE0_REPOSITORY,
    inspectAttestation: provider.inspectWorkflowSourceAttestation,
  });
}

function writeJson(stream, value) {
  stream.write(`${JSON.stringify(value)}\n`);
}

function reasonCodeFor(error, fallback) {
  return /^[a-z][a-z0-9_]{0,79}$/.test(error?.reasonCode ?? '')
    ? error.reasonCode
    : /^[a-z][a-z0-9_]{0,79}$/.test(error?.code ?? '') ? error.code : fallback;
}

export async function initializeStage1Budget({ host, prNumber, input, output }) {
  const snapshot = await host.adapters.pr.refresh(prNumber);
  const policy = host.config.policy;
  const budgetRoot = await stage1BudgetStoreRoot(host.config.repoRoot);
  const taskId = stage1TaskId(prNumber, snapshot);
  const state = createLoopState({
    taskId,
    branch: snapshot.headRef,
    baseSha: snapshot.baseSha,
    headSha: snapshot.headSha,
    risk: 'high',
    acceptanceCriteria: ['stage1-trusted-dispatch', 'stage1-required-check-green'],
    policy,
  });
  const terminal = createInterface({ input, output });
  try {
    output.write(JSON.stringify({ repository: snapshot.repository, prNumber, branch: snapshot.headRef,
      baseSha: snapshot.baseSha, headSha: snapshot.headSha, ciRunLimit: state.budgets.ciRunLimit,
      maxWallClockSeconds: state.budgets.wallClockLimitSeconds }) + '\n');
    if (await terminal.question(`Create this one-use-per-head local budget session? Type INITIALIZE ${prNumber}: `)
      !== `INITIALIZE ${prNumber}`) return { exitCode: PR_BABYSITTER_EXIT_CODES.refused, reasonCode: 'budget_initialization_cancelled' };
  } finally { terminal.close(); }
  try {
    const verifiedBudgetRoot = await stage1BudgetStoreRoot(host.config.repoRoot);
    if (verifiedBudgetRoot !== budgetRoot) throw stage1Error('ci_run_budget_session_unavailable');
    await createLoopStateInRepository(budgetRoot, state);
  } catch (error) {
    if (error instanceof LoopStateAlreadyExistsError) return { exitCode: PR_BABYSITTER_EXIT_CODES.refused, reasonCode: 'ci_run_budget_session_exists' };
    throw error;
  }
  output.write(`${JSON.stringify({ status: 'budget-session-initialized', taskId, ciRunLimit: state.budgets.ciRunLimit })}\n`);
  return { exitCode: PR_BABYSITTER_EXIT_CODES.ready, taskId };
}

export async function runPrBabysitterStage1({
  argv = process.argv.slice(2),
  repoRoot = process.cwd(),
  env = process.env,
  io = {},
} = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  let args;
  try {
    args = parsePrBabysitterArguments(argv);
    assertStage1Command(args, io.isTTY ?? process.stdin.isTTY === true);
  } catch (error) {
    const reasonCode = reasonCodeFor(error, 'invalid_arguments');
    writeJson(stderr, { status: 'refused', reasonCode });
    return { exitCode: PR_BABYSITTER_EXIT_CODES.refused, reasonCode };
  }

  if (args.dryRun) {
    return runPrBabysitterCli({ argv, trustedHost: null, io: { ...io, stdout, stderr } });
  }

  try {
    const enableDispatch = args.command === 'rerun-flaky';
    const trustedHost = await createPrBabysitterStage1Host({ prNumber: args.prNumber, repoRoot, env,
      io: { ...io, isTTY: io.isTTY ?? process.stdin.isTTY === true, input: io.input ?? process.stdin, output: io.output ?? process.stdout },
      enableDispatch });
    if (args.command === 'initialize-budget') {
      return await initializeStage1Budget({ host: trustedHost, prNumber: args.prNumber,
        input: io.input ?? process.stdin, output: stdout });
    }
    return await runPrBabysitterCli({ argv, trustedHost, io: { ...io, stdout, stderr } });
  } catch (error) {
    const reasonCode = reasonCodeFor(error, 'stage1_observation_failed');
    const localPrerequisite = reasonCode.startsWith('stage1_trust_') || reasonCode.startsWith('ci_run_budget_session_');
    const exitCode = Number.isInteger(error?.exitCode) ? error.exitCode
      : localPrerequisite ? PR_BABYSITTER_EXIT_CODES.refused : PR_BABYSITTER_EXIT_CODES.infrastructure;
    writeJson(stderr, { status: exitCode === PR_BABYSITTER_EXIT_CODES.infrastructure ? 'error' : 'refused', reasonCode });
    return { exitCode, reasonCode };
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  const result = await runPrBabysitterStage1({
    argv: process.argv.slice(2),
    repoRoot: process.cwd(),
    env: process.env,
    io: { stdout: process.stdout, stderr: process.stderr, isTTY: process.stdin.isTTY === true },
  });
  process.exitCode = result.exitCode;
}
