import assert from 'node:assert/strict';
import { it } from 'node:test';

import { observeStage1Retry } from '../stage1-retry-observer.mjs';

const target = { repository: 'memories-quy-2002/digital-e-shop', repositoryId: 743050379, prNumber: 7,
  baseSha: 'a'.repeat(40), headSha: 'b'.repeat(40), mergeSha: 'c'.repeat(40), testedSha: 'c'.repeat(40),
  context: 'client', appId: 15368, checkRunId: 1234, policyFingerprint: 'd'.repeat(64), workflowId: 77,
  workflowPath: '.github/workflows/stage1-trusted-retry.yml', workflowRef: 'main', workflowSourceSha: 'a'.repeat(40),
  actorId: 9988, actorLogin: 'digital-e-loop-runner[bot]', requestId: '1'.repeat(32) };

function run(overrides = {}) {
  return { status: 'current', run: { id: 8001, repositoryId: target.repositoryId, workflowId: target.workflowId,
    path: target.workflowPath, ref: 'refs/heads/main', event: 'workflow_dispatch', sourceSha: target.workflowSourceSha,
    actorId: target.actorId, actorLogin: target.actorLogin, status: 'completed', conclusion: 'success' },
    jobs: { collectionStatus: 'complete', jobs: [
      { name: 'verify', status: 'completed', conclusion: 'success' }, { name: 'publish', status: 'completed', conclusion: 'success' },
    ] }, ...overrides };
}

function evidence(overrides = {}) {
  return { prSnapshot: { repository: target.repository, number: 7, state: 'open', baseRef: 'main', baseSha: target.baseSha,
    headSha: target.headSha, mergeSha: target.mergeSha }, requiredCheckSnapshot: { collectionStatus: 'complete',
    policyFingerprint: target.policyFingerprint, requiredChecks: [{ context: 'client', appId: 15368 }, { context: 'server', appId: 15368 }], requiredWorkflows: [] },
    checkCollectionComplete: true, checkObservations: [
      { checkId: 'check:1234', requiredCheckKey: 'client|app:15368', testedSha: target.testedSha, status: 'completed', conclusion: 'success' },
      { checkId: 'check:1235', requiredCheckKey: 'server|app:15368', testedSha: target.testedSha, status: 'completed', conclusion: 'success' },
    ], ...overrides };
}

function args(overrides = {}) {
  return { target, workflowRunId: 8001, getRun: async (runId) => { assert.equal(runId, 8001); return run(); },
    readCurrent: async () => evidence(), timeoutMs: 5000, maxWallClockSeconds: 10, pollIntervalMs: 1, ...overrides };
}

it('returns ready only after the returned run, both trusted jobs, exact original check, and all required checks are green', async () => {
  const result = await observeStage1Retry(args());
  assert.equal(result.action, 'ready-for-human');
  assert.equal(result.workflowRunId, 8001);
  assert.equal(result.checkRunId, target.checkRunId);
});

it('polls only the returned run ID until completion and enforces a finite budget timeout', async () => {
  let now = 0;
  const calls = [];
  const pending = run({ run: { ...run().run, status: 'in_progress', conclusion: null } });
  const result = await observeStage1Retry(args({ now: () => now, sleep: async (delay) => { now += delay; },
    timeoutMs: 5, pollIntervalMs: 2, getRun: async (runId) => { calls.push(runId); return calls.length < 3 ? pending : run(); } }));
  assert.equal(result.action, 'ready-for-human');
  assert.deepEqual(calls, [8001, 8001, 8001]);
  now = 0;
  const timeout = await observeStage1Retry(args({ now: () => now, sleep: async (delay) => { now += delay; }, timeoutMs: 3, pollIntervalMs: 2,
    getRun: async () => pending }));
  assert.equal(timeout.reasonCode, 'retry_run_timeout');
});

it('escalates source, actor, job, tuple, policy, and required-check mismatches', async () => {
  for (const observation of [
    run({ run: { ...run().run, sourceSha: 'f'.repeat(40) } }),
    run({ run: { ...run().run, actorId: 9999 } }),
    run({ jobs: { collectionStatus: 'complete', jobs: [{ name: 'verify', status: 'completed', conclusion: 'success' },
      { name: 'publish', status: 'completed', conclusion: 'failure' }] } }),
  ]) {
    const result = await observeStage1Retry(args({ getRun: async () => observation }));
    assert.equal(result.action, 'escalate');
  }
  assert.equal((await observeStage1Retry(args({ readCurrent: async () => evidence({ prSnapshot: { ...evidence().prSnapshot, headSha: 'f'.repeat(40) } }) }))).reasonCode,
    'completion_evidence_stale_or_incomplete');
  assert.equal((await observeStage1Retry(args({ readCurrent: async () => evidence({ requiredCheckSnapshot: { ...evidence().requiredCheckSnapshot, policyFingerprint: 'f'.repeat(64) } }) }))).reasonCode,
    'completion_evidence_stale_or_incomplete');
  assert.equal((await observeStage1Retry(args({ readCurrent: async () => evidence({ checkObservations: evidence().checkObservations.slice(0, 1) }) }))).reasonCode,
    'completion_evidence_stale_or_incomplete');
});
it('requires the exact original Check Run to become successful', async () => {
  const result = await observeStage1Retry(args({ readCurrent: async () => evidence({ checkObservations: [
    { ...evidence().checkObservations[0], conclusion: 'failure' }, evidence().checkObservations[1],
  ] }) }));
  assert.equal(result.reasonCode, 'original_check_not_green');
});

it('rejects conflicting green and failed observations for one required identity and SHA', async () => {
  const observations = evidence().checkObservations;
  const result = await observeStage1Retry(args({ readCurrent: async () => evidence({ checkObservations: [
    ...observations,
    { checkId: 'check:1299', requiredCheckKey: 'server|app:15368', testedSha: target.testedSha,
      status: 'completed', conclusion: 'failure' },
  ] }) }));
  assert.equal(result.action, 'escalate');
  assert.equal(result.reasonCode, 'completion_evidence_stale_or_incomplete');
});
