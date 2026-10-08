import assert from 'node:assert/strict';
import { afterEach, before, describe, it } from 'node:test';
import { mkdtemp, mkdir, realpath, rm, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createGitHubActionsWriteHost, rerunFailedJobs } from '../github-actions-write.mjs';
import { loadLoopPolicy } from '../policy.mjs';
import { createLoopState, loadLoopState, saveLoopState } from '../state.mjs';

const REPOSITORY = 'octo/shop';
const REPOSITORY_ID = 7654321;
const PR_NUMBER = 27;
const TASK_ID = 'phase2b-rerun-test';
const BASE_SHA = 'a'.repeat(40);
const HEAD_SHA = 'b'.repeat(40);
const MERGE_SHA = 'c'.repeat(40);
const WORKFLOW_SHA = 'd'.repeat(40);
const WORKFLOW_ID = 17;
const WORKFLOW_PATH = '.github/workflows/ci.yml';
const WORKFLOW_REF = 'refs/heads/main';
const RUN_ID = 23001;
const JOB_ID = 87001;
const INSTALLATION_TOKEN = 'ghs_test_actions_write_secret';
const REQUIRED_IDENTITY = Object.freeze({
  type: 'workflow',
  repositoryId: REPOSITORY_ID,
  path: WORKFLOW_PATH,
  ref: WORKFLOW_REF,
  sha: WORKFLOW_SHA,
});
const temporaryRoots = new Set();
let basePolicy;

before(async () => {
  basePolicy = await loadLoopPolicy();
});

function makePolicy(ciRunLimit = 2, maxFlakyRetries = 3) {
  return {
    ...basePolicy,
    stopConditions: { ...basePolicy.stopConditions, ciRunLimit, maxFlakyRetries },
  };
}

function snapshot(overrides = {}) {
  return {
    repository: REPOSITORY,
    repositoryId: REPOSITORY_ID,
    number: PR_NUMBER,
    state: 'open',
    draft: false,
    baseRef: 'main',
    baseSha: BASE_SHA,
    headRef: 'feature/phase-2b-rerun',
    headSha: HEAD_SHA,
    mergeSha: MERGE_SHA,
    headRepository: REPOSITORY,
    updatedAt: '2026-09-29T08:00:00.000Z',
    ...overrides,
  };
}

function workflowRun(overrides = {}) {
  return {
    id: RUN_ID,
    repositoryId: REPOSITORY_ID,
    workflowId: WORKFLOW_ID,
    path: WORKFLOW_PATH,
    ref: WORKFLOW_REF,
    headSha: HEAD_SHA,
    testedSha: HEAD_SHA,
    sourceSha: WORKFLOW_SHA,
    sourceShaAttested: true,
    runNumber: 41,
    runAttempt: 1,
    status: 'completed',
    conclusion: 'failure',
    ...overrides,
  };
}

function workflowJob(overrides = {}) {
  return {
    id: JOB_ID,
    runId: RUN_ID,
    runAttempt: 1,
    name: 'unit tests',
    status: 'completed',
    conclusion: 'failure',
    ...overrides,
  };
}

async function createHarness(options = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'digital-e-actions-rerun-'));
  temporaryRoots.add(root);
  const configuredCiRunLimit = Object.hasOwn(options, 'ciRunLimit') ? options.ciRunLimit : 2;
  const taskPolicy = options.policy ?? makePolicy(configuredCiRunLimit, options.maxFlakyRetries ?? 3);
  const state = createLoopState({
    taskId: TASK_ID,
    branch: 'feature/phase-2b-rerun',
    baseSha: BASE_SHA,
    headSha: HEAD_SHA,
    risk: 'low',
    acceptanceCriteria: ['rerun'],
    policy: taskPolicy,
    now: new Date(options.stateStartedAt ?? Date.now()).toISOString(),
  });
  await saveLoopState(root, state);
  const statePath = path.join(root, '.loop', 'state', `${TASK_ID}.json`);
  if (options.stateCorrupt) await writeFile(statePath, '{ invalid state json', 'utf8');
  if (options.stateMissing) await unlink(statePath);

  let currentSnapshot = snapshot(options.snapshotOverrides);
  const events = [];
  const calls = [];
  const approvals = new WeakSet();
  const approval = Object.freeze({});
  approvals.add(approval);
  let workflowRunReadCount = 0;
  const target = {
    repositoryId: REPOSITORY_ID,
    prNumber: PR_NUMBER,
    baseSha: BASE_SHA,
    headSha: HEAD_SHA,
    mergeSha: MERGE_SHA,
    testedSha: HEAD_SHA,
    requiredIdentity: REQUIRED_IDENTITY,
    workflowId: WORKFLOW_ID,
    runId: RUN_ID,
    runAttempt: 1,
    failedJobIds: [JOB_ID],
    failureAttemptKey: 'phase2a-attempt-1',
    ...options.targetOverrides,
  };
  const readClient = {
    async getPullRequest(prNumber) {
      events.push('read-pr');
      assert.equal(prNumber, PR_NUMBER);
      return currentSnapshot;
    },
    async getPullRequestFiles(prNumber) {
      events.push('read-files');
      assert.equal(prNumber, PR_NUMBER);
      return {
        status: 'current',
        prNumber,
        snapshot: currentSnapshot,
        files: (options.files ?? [{ filename: 'src/app.mjs', status: 'modified' }])
          .map((file) => ({ previousFilename: null, ...file })),
        collectionStatus: options.fileCollectionStatus ?? 'complete',
      };
    },
    async getWorkflowRuns(testedSha) {
      events.push('read-runs');
      const runOverrides = options.runOverridesByRead?.[workflowRunReadCount] ?? options.runOverrides;
      workflowRunReadCount += 1;
      return {
        status: options.runStatus ?? 'current',
        snapshot: currentSnapshot,
        testedSha,
        runs: options.runs ?? [workflowRun(runOverrides)],
        collectionStatus: options.runCollectionStatus ?? 'complete',
      };
    },
    async getWorkflowRunJobs(runId, runAttempt) {
      events.push('read-jobs');
      assert.equal(runId, RUN_ID);
      assert.equal(runAttempt, target.runAttempt);
      return {
        runId,
        runAttempt: options.jobRunAttempt ?? target.runAttempt,
        snapshot: currentSnapshot,
        jobs: options.jobs ?? [workflowJob(options.jobOverrides)],
        collectionStatus: options.jobCollectionStatus ?? 'complete',
      };
    },
  };
  const approvalProvider = {
    consumeApproval(value, scope) {
      events.push('consume-approval');
      if (!approvals.has(value)) throw new Error('approval rejected');
      assert.deepEqual(scope, {
        repositoryId: REPOSITORY_ID,
        prNumber: PR_NUMBER,
        baseSha: BASE_SHA,
        headSha: HEAD_SHA,
        mergeSha: MERGE_SHA,
        capability: 'actions:rerun',
        paths: [WORKFLOW_PATH],
        testedSha: target.testedSha,
        actionTarget: {
          workflowId: target.workflowId,
          runId: target.runId,
          runAttempt: target.runAttempt,
          failedJobIds: target.failedJobIds,
          requiredIdentity: target.requiredIdentity,
        },
      });
      if (options.afterApproval) currentSnapshot = snapshot(options.afterApproval);
    },
    async getInstallationToken(capability) {
      events.push('get-token');
      assert.equal(capability, 'actions:rerun');
      if (options.afterToken) currentSnapshot = snapshot(options.afterToken);
      return INSTALLATION_TOKEN;
    },
  };
  const fetchImpl = async (url, init = {}) => {
    events.push('post');
    calls.push({ url: new URL(url), init });
    const persisted = await loadLoopState(root, TASK_ID);
    assert.equal(persisted.budgets.ciRuns, 1, 'CI attempt must be persisted before the GitHub POST');
    assert.equal(persisted.ciRunAttempts[0].status, 'reserved');
    if (options.networkError) throw new Error('network failure must not escape');
    return options.response ?? new Response(null, { status: 201 });
  };
  const workflowAllowlist = options.workflowAllowlist ?? [{
    repositoryId: REPOSITORY_ID,
    workflowId: WORKFLOW_ID,
    path: WORKFLOW_PATH,
    ref: WORKFLOW_REF,
    sourceSha: WORKFLOW_SHA,
    requiredIdentity: REQUIRED_IDENTITY,
    jobNames: ['unit tests'],
    safety: {
      noSecrets: true,
      noProtectedEnvironment: true,
      noWritePermissions: true,
    },
  }];
  const hostOptions = {
    repository: REPOSITORY,
    repositoryId: REPOSITORY_ID,
    repoRoot: root,
    taskId: TASK_ID,
    policy: taskPolicy,
    prClient: readClient,
    approvalProvider,
    workflowAllowlist,
    verifyWorkflowSourceAttestation: async ({ identity, run }) => options.verifySourceAttestation === false
      ? false
      : run.sourceShaAttested === true && run.sourceSha === identity.sha,
    fetchImpl,
  };
  if (options.omitOptionalHostCallbacks) {
    delete hostOptions.verifyWorkflowSourceAttestation;
    delete hostOptions.fetchImpl;
  }
  const host = createGitHubActionsWriteHost(hostOptions);
  return {
    root,
    state,
    policy: taskPolicy,
    target,
    approval,
    host,
    readClient,
    approvalProvider,
    events,
    calls,
    setSnapshot(value) { currentSnapshot = value; },
    forgeApproval() { return Object.freeze({}); },
  };
}

async function rerun(harness, overrides = {}) {
  return rerunFailedJobs({
    host: harness.host,
    decision: { action: 'retry-check' },
    target: { ...harness.target, ...overrides },
    approval: harness.approval,
  });
}

afterEach(async () => {
  const roots = [...temporaryRoots];
  temporaryRoots.clear();
  const tempDirectory = await realpath(os.tmpdir());
  for (const root of roots) {
    const resolved = await realpath(root);
    assert.equal(path.dirname(resolved), tempDirectory);
    await rm(resolved, { recursive: true, force: true });
  }
});

describe('GitHub Actions rerun write adapter', () => {
  it('consumes exact approval and persists the attempt before posting only the approved job endpoint', async () => {
    const harness = await createHarness();
    const result = await rerun(harness);

    assert.equal(result.status, 'submitted', JSON.stringify(result));
    assert.match(result.actionAttemptKey, /^[a-f0-9]{64}$/);
    assert.equal(harness.calls.length, 1);
    assert.equal(harness.calls[0].url.href, `https://api.github.com/repos/${REPOSITORY}/actions/jobs/${JOB_ID}/rerun`);
    assert.equal(harness.calls[0].init.method, 'POST');
    assert.equal(harness.calls[0].init.body, undefined);
    assert.equal(harness.calls[0].init.headers.Authorization, `Bearer ${INSTALLATION_TOKEN}`);
    assert.ok(harness.events.indexOf('consume-approval') < harness.events.indexOf('get-token'));
    assert.ok(harness.events.indexOf('get-token') < harness.events.indexOf('post'));
    assert.equal(JSON.stringify(result).includes(INSTALLATION_TOKEN), false);
    const persisted = await loadLoopState(harness.root, TASK_ID);
    assert.equal(persisted.budgets.ciRuns, 1);
    assert.equal(persisted.ciRunAttempts[0].status, 'submitted');
  });

  it('refuses absent and forged approvals, non-retry decisions, and forged host contexts', async () => {
    const missing = await createHarness();
    const absent = await rerunFailedJobs({ host: missing.host, decision: { action: 'retry-check' }, target: missing.target });
    assert.deepEqual({ status: absent.status, reasonCode: absent.reasonCode }, { status: 'refused', reasonCode: 'approval_rejected' });
    assert.equal(missing.calls.length, 0);

    const forged = await createHarness();
    const forgedResult = await rerunFailedJobs({
      host: forged.host,
      decision: { action: 'retry-check', actionsWriteApproved: true },
      target: forged.target,
      approval: forged.forgeApproval(),
    });
    assert.equal(forgedResult.status, 'refused');
    assert.equal(forged.calls.length, 0);

    const invalidDecision = await createHarness();
    const refused = await rerunFailedJobs({
      host: invalidDecision.host,
      decision: { action: 'request-repair' },
      target: invalidDecision.target,
      approval: invalidDecision.approval,
    });
    assert.equal(refused.reasonCode, 'retry_decision_required');
    assert.equal(invalidDecision.events.includes('consume-approval'), false);

    const clonedHost = await createHarness();
    const cloned = await rerunFailedJobs({
      host: { ...clonedHost.host },
      decision: { action: 'retry-check' },
      target: clonedHost.target,
      approval: clonedHost.approval,
    });
    assert.equal(cloned.reasonCode, 'invalid_host_context');

    const unsupported = await createHarness();
    const arbitraryWrite = await rerunFailedJobs({
      host: unsupported.host,
      decision: { action: 'retry-check' },
      target: unsupported.target,
      approval: unsupported.approval,
      endpoint: 'dispatch',
    });
    assert.equal(arbitraryWrite.reasonCode, 'invalid_request');
    assert.equal(unsupported.calls.length, 0);
  });

  it('rejects stale PR tuples and tested SHAs outside the current head/merge pair before approval', async () => {
    const stale = await createHarness({ snapshotOverrides: { baseSha: '9'.repeat(40) } });
    const staleResult = await rerun(stale);
    assert.equal(staleResult.reasonCode, 'stale_pr_tuple');
    assert.equal(stale.events.includes('consume-approval'), false);

    const wrongTestedSha = await createHarness({ targetOverrides: { testedSha: '9'.repeat(40) } });
    const wrongTestResult = await rerun(wrongTestedSha);
    assert.equal(wrongTestResult.reasonCode, 'tested_sha_mismatch');
    assert.equal(wrongTestedSha.calls.length, 0);
  });

  it('accepts a current merge-SHA attempt and binds approval to that tested revision', async () => {
    const harness = await createHarness({
      targetOverrides: { testedSha: MERGE_SHA },
      runOverrides: { headSha: MERGE_SHA, testedSha: MERGE_SHA },
    });
    const result = await rerun(harness);
    assert.equal(result.status, 'submitted');
    assert.equal(harness.events.includes('get-token'), true);
  });

  it('refreshes the full PR tuple after approval and aborts before token creation or POST on drift', async () => {
    const harness = await createHarness({ afterApproval: { mergeSha: '9'.repeat(40) } });
    const result = await rerun(harness);
    assert.equal(result.reasonCode, 'stale_pr_tuple');
    assert.equal(harness.events.includes('get-token'), false);
    assert.equal(harness.calls.length, 0);
    const persisted = await loadLoopState(harness.root, TASK_ID);
    assert.equal(persisted.budgets.ciRuns, 0);
  });

  it('refreshes the PR tuple after token mint and aborts before reservation or POST on drift', async () => {
    const harness = await createHarness({ afterToken: { headSha: '9'.repeat(40) } });
    const result = await rerun(harness);
    assert.equal(result.reasonCode, 'stale_pr_tuple');
    assert.ok(harness.events.includes('get-token'));
    assert.equal(harness.calls.length, 0);
    const persisted = await loadLoopState(harness.root, TASK_ID);
    assert.equal(persisted.budgets.ciRuns, 0);
    assert.deepEqual(persisted.ciRunAttempts, []);
  });

  it('rechecks the selected workflow attempt after budget reservation before POST', async () => {
    const harness = await createHarness({
      runOverridesByRead: [undefined, undefined, undefined, { runAttempt: 2 }],
    });
    const result = await rerun(harness);

    assert.equal(result.status, 'escalate');
    assert.equal(result.reasonCode, 'run_attempt_mismatch');
    assert.equal(harness.events.filter((event) => event === 'read-runs').length, 4);
    assert.equal(harness.calls.length, 0);
    const state = await loadLoopState(harness.root, TASK_ID);
    assert.equal(state.ciRunAttempts[0].status, 'rejected');
  });

  it('refuses incomplete PR file evidence and PR-modified workflow or local-action definitions', async () => {
    const incomplete = await createHarness({ fileCollectionStatus: 'incomplete' });
    const incompleteResult = await rerun(incomplete);
    assert.equal(incompleteResult.reasonCode, 'workflow_file_evidence_unavailable');
    assert.equal(incomplete.events.includes('consume-approval'), false);

    for (const filename of ['.github/workflows/ci.yml', '.github/actions/build/action.yml', '.GITHUB/WORKFLOWS/CI.YML']) {
      const changed = await createHarness({ files: [{ filename, status: 'modified' }] });
      const changedResult = await rerun(changed);
      assert.equal(changedResult.reasonCode, 'pr_modified_workflow');
      assert.equal(changed.events.includes('consume-approval'), false);
      assert.equal(changed.calls.length, 0);
    }
  });

  it('requires an exact trusted workflow and attested source SHA before approval', async () => {
    const unattested = await createHarness({ runOverrides: { sourceSha: null, sourceShaAttested: false } });
    const unattestedResult = await rerun(unattested);
    assert.equal(unattestedResult.reasonCode, 'workflow_source_sha_unattested');
    assert.equal(unattested.events.includes('consume-approval'), false);

    const deniedAttestation = await createHarness({ verifySourceAttestation: false });
    const deniedResult = await rerun(deniedAttestation);
    assert.equal(deniedResult.reasonCode, 'workflow_source_sha_unattested');
    assert.equal(deniedAttestation.calls.length, 0);

    const wrongIdentity = await createHarness({ targetOverrides: { requiredIdentity: { ...REQUIRED_IDENTITY, sha: 'e'.repeat(40) } } });
    const identityResult = await rerun(wrongIdentity);
    assert.equal(identityResult.reasonCode, 'workflow_not_allowlisted');
  });

  it('supports an attested required workflow sourced from a separately allowlisted repository', async () => {
    const requiredIdentity = { ...REQUIRED_IDENTITY, repositoryId: REPOSITORY_ID + 1 };
    const harness = await createHarness({
      targetOverrides: { requiredIdentity },
      workflowAllowlist: [{
        repositoryId: REPOSITORY_ID,
        workflowId: WORKFLOW_ID,
        path: WORKFLOW_PATH,
        ref: WORKFLOW_REF,
        sourceSha: WORKFLOW_SHA,
        requiredIdentity,
        jobNames: ['unit tests'],
        safety: { noSecrets: true, noProtectedEnvironment: true, noWritePermissions: true },
      }],
    });

    const result = await rerun(harness);
    assert.equal(result.status, 'submitted');
    assert.equal(harness.calls.length, 1);
  });

  it('allows optional host callbacks to be omitted while keeping writes fail-closed', async () => {
    const harness = await createHarness({ omitOptionalHostCallbacks: true });
    const result = await rerun(harness);
    assert.equal(result.reasonCode, 'workflow_source_sha_unattested');
    assert.equal(harness.events.includes('consume-approval'), false);
    assert.equal(harness.calls.length, 0);
  });

  it('refuses unknown privileges, non-allowlisted jobs, incomplete jobs, and non-failed conclusions', async () => {
    assert.throws(() => createGitHubActionsWriteHost({
      repository: REPOSITORY,
      repositoryId: REPOSITORY_ID,
      repoRoot: 'unused',
      taskId: TASK_ID,
      policy: makePolicy(),
      prClient: {},
      approvalProvider: {},
      workflowAllowlist: [{ ...workflowRun(), requiredIdentity: REQUIRED_IDENTITY, jobNames: ['unit tests'] }],
    }));

    const unsafe = await createHarness({
      workflowAllowlist: [{
        repositoryId: REPOSITORY_ID,
        workflowId: WORKFLOW_ID,
        path: WORKFLOW_PATH,
        ref: WORKFLOW_REF,
        sourceSha: WORKFLOW_SHA,
        requiredIdentity: REQUIRED_IDENTITY,
        jobNames: ['unit tests'],
        safety: { noSecrets: false, noProtectedEnvironment: true, noWritePermissions: true },
      }],
    }).catch((error) => error);
    assert.ok(unsafe instanceof Error);

    const unlisted = await createHarness({ jobs: [workflowJob({ name: 'unapproved deploy' })] });
    assert.equal((await rerun(unlisted)).reasonCode, 'job_not_allowlisted');
    assert.equal(unlisted.events.includes('consume-approval'), false);

    const incomplete = await createHarness({ jobCollectionStatus: 'incomplete' });
    assert.equal((await rerun(incomplete)).reasonCode, 'job_evidence_unavailable');

    const cancelled = await createHarness({ jobs: [workflowJob({ conclusion: 'cancelled' })] });
    assert.equal((await rerun(cancelled)).reasonCode, 'failed_job_not_retryable');
  });

  it('refuses multiple approved root IDs before approval, token minting, budget reservation, or POST', async () => {
    const harness = await createHarness({ targetOverrides: { failedJobIds: [JOB_ID, JOB_ID + 1] } });
    const result = await rerun(harness);

    assert.equal(result.reasonCode, 'invalid_target');
    assert.equal(harness.events.includes('consume-approval'), false);
    assert.equal(harness.events.includes('get-token'), false);
    assert.equal(harness.calls.length, 0);
    const state = await loadLoopState(harness.root, TASK_ID);
    assert.equal(state.budgets.ciRuns, 0);
    assert.deepEqual(state.ciRunAttempts, []);
  });

  it('refuses an attempt with multiple failed roots even when the target names only one', async () => {
    const harness = await createHarness({
      jobs: [workflowJob(), workflowJob({ id: JOB_ID + 1, name: 'lint' })],
      workflowAllowlist: [{
        repositoryId: REPOSITORY_ID,
        workflowId: WORKFLOW_ID,
        path: WORKFLOW_PATH,
        ref: WORKFLOW_REF,
        sourceSha: WORKFLOW_SHA,
        requiredIdentity: REQUIRED_IDENTITY,
        jobNames: ['unit tests', 'lint'],
        safety: { noSecrets: true, noProtectedEnvironment: true, noWritePermissions: true },
      }],
    });
    const result = await rerun(harness);

    assert.equal(result.reasonCode, 'failed_job_identity_mismatch');
    assert.equal(harness.events.includes('consume-approval'), false);
    assert.equal(harness.events.includes('get-token'), false);
    assert.equal(harness.calls.length, 0);
    const state = await loadLoopState(harness.root, TASK_ID);
    assert.equal(state.budgets.ciRuns, 0);
    assert.deepEqual(state.ciRunAttempts, []);
  });

  it('refuses substituted run, attempt, and failed-job identities', async () => {
    const absentRun = await createHarness({ runs: [workflowRun({ id: RUN_ID + 1 })] });
    assert.equal((await rerun(absentRun)).reasonCode, 'run_not_observed');

    const wrongAttempt = await createHarness({ runOverrides: { runAttempt: 2 } });
    assert.equal((await rerun(wrongAttempt)).reasonCode, 'run_attempt_mismatch');

    const wrongJob = await createHarness({ targetOverrides: { failedJobIds: [JOB_ID + 1] } });
    assert.equal((await rerun(wrongJob)).reasonCode, 'failed_job_identity_mismatch');

    const duplicateJob = await createHarness({ jobs: [
      workflowJob(), workflowJob({ name: 'unit tests duplicate' }),
    ] });
    assert.equal((await rerun(duplicateJob)).reasonCode, 'job_evidence_unavailable');
    assert.equal(duplicateJob.calls.length, 0);

    const wrongJobAttempt = await createHarness({ jobRunAttempt: 2 });
    assert.equal((await rerun(wrongJobAttempt)).reasonCode, 'run_attempt_mismatch');

    const wrongJobResultAttempt = await createHarness({ jobs: [workflowJob({ runAttempt: 2 })] });
    assert.equal((await rerun(wrongJobResultAttempt)).reasonCode, 'run_attempt_mismatch');
  });

  it('keeps an uncertain POST consumed and blocks a repeated invocation with the same stable key', async () => {
    const harness = await createHarness({ networkError: true });
    const first = await rerun(harness);
    assert.equal(first.reasonCode, 'network_uncertain');
    assert.equal(first.status, 'escalate');
    assert.equal(harness.calls.length, 1);
    const afterFirst = await loadLoopState(harness.root, TASK_ID);
    assert.equal(afterFirst.ciRunAttempts[0].status, 'uncertain');

    const secondApproval = Object.freeze({});
    const second = await rerunFailedJobs({
      host: harness.host,
      decision: { action: 'retry-check' },
      target: harness.target,
      approval: secondApproval,
    });
    assert.equal(second.reasonCode, 'duplicate_rerun');
    assert.equal(harness.events.filter((event) => event === 'consume-approval').length, 1);
    assert.equal(harness.calls.length, 1);
  });

  it('serializes concurrent attempts with the same action key into one GitHub POST', async () => {
    const harness = await createHarness();
    const results = await Promise.all([rerun(harness), rerun(harness)]);
    assert.equal(results.filter((result) => result.status === 'submitted').length, 1);
    assert.equal(results.filter((result) => result.status === 'refused'
      && ['duplicate_rerun', 'duplicate_action_attempt'].includes(result.reasonCode)).length, 1);
    assert.equal(harness.calls.length, 1);
    const persisted = await loadLoopState(harness.root, TASK_ID);
    assert.equal(persisted.budgets.ciRuns, 1);
    assert.equal(persisted.ciRunAttempts.length, 1);
  });

  it('maps GitHub conflict, invalid-request, and rate-limit responses to stable escalation reasons', async () => {
    const cases = [
      [409, {}, 'github_conflict'],
      [422, {}, 'github_request_rejected'],
      [403, { 'x-ratelimit-remaining': '0' }, 'github_rate_limited'],
      [429, {}, 'github_rate_limited'],
    ];
    for (const [status, headers, reasonCode] of cases) {
      const harness = await createHarness({ response: new Response(null, { status, headers }) });
      const result = await rerun(harness);
      assert.equal(result.status, 'escalate');
      assert.equal(result.reasonCode, reasonCode);
      const persisted = await loadLoopState(harness.root, TASK_ID);
      assert.equal(persisted.budgets.ciRuns, 1);
      assert.equal(persisted.ciRunAttempts[0].status, 'rejected');
    }
  });

  it('stays observe-only without a finite CI-run budget and admits the configured final attempt once', async () => {
    const unbounded = await createHarness({ ciRunLimit: null });
    const unboundedResult = await rerun(unbounded);
    assert.equal(unboundedResult.reasonCode, 'ci_run_limit_unconfigured');
    assert.equal(unbounded.events.includes('consume-approval'), false);

    const finite = await createHarness({ ciRunLimit: 1 });
    assert.equal((await rerun(finite)).status, 'submitted');
    const nextTarget = { ...finite.target, failureAttemptKey: 'phase2a-attempt-2' };
    const next = await rerunFailedJobs({
      host: finite.host,
      decision: { action: 'retry-check' },
      target: nextTarget,
      approval: finite.approval,
    });
    assert.equal(next.reasonCode, 'ci_run_limit');
    assert.equal(finite.calls.length, 1);
  });

  it('refuses missing or corrupt local run state and an exceeded wall-clock budget before approval or POST', async () => {
    for (const stateOptions of [{ stateMissing: true }, { stateCorrupt: true }]) {
      const harness = await createHarness(stateOptions);
      const result = await rerun(harness);
      assert.equal(result.reasonCode, 'loop_state_unavailable');
      assert.equal(harness.events.includes('consume-approval'), false);
      assert.equal(harness.events.includes('get-token'), false);
      assert.equal(harness.calls.length, 0);
    }

    const expired = await createHarness({ stateStartedAt: Date.now() - 3_600_000 });
    const result = await rerun(expired);
    assert.equal(result.reasonCode, 'max_wall_clock');
    assert.equal(expired.events.includes('consume-approval'), false);
    assert.equal(expired.events.includes('get-token'), false);
    assert.equal(expired.calls.length, 0);
  });
});
