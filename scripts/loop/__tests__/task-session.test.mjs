import assert from 'node:assert/strict';
import { it } from 'node:test';
import { createLoopState } from '../state.mjs';
import { createTaskSession } from '../tasks/session.mjs';

function fixture() {
  const taskId = 'repo-1234-issue-42-g1';
  let record = { schemaVersion: 2, taskId, key: { repositoryId: 1234, issueNumber: 42, generation: 1 },
    requestDigest: 'a'.repeat(64), sourceRevision: 'b'.repeat(40), policyRevision: 'b'.repeat(40),
    acceptanceIds: [], state: 'queued', version: 1, attempt: 0, epoch: 0, deadline: '2026-10-14T00:00:00.000Z',
    budgets: { modelCalls: 0, repairs: 0, deliveries: 0, lastModelTokenUsed: null },
    links: { loopStateTaskId: taskId, pr: null }, confirmedMergeSha: null, outcomeReason: null };
  const freeze = (value) => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
  const policy = freeze({ ...JSON.parse(JSON.stringify({ schemaVersion: 1, enabled: true, autoMergeEnabled: false,
    ownerActorIds: [93824124], eligibleActors: [93824124], optInLabel: 'autonomous:run', eligibleCategories: ['documentation'],
    eligiblePaths: ['docs/API.md'], eligibleRisks: ['low'], runner: { provider: 'openai', model: 'GPT-6-Luna' },
    capabilities: ['observe', 'propose_patch', 'run_fixed_verifier'],
    budgets: { maxModelCalls: 8, maxDeliveryGenerations: 2, taskConcurrency: 1, maxHostedWorkflowRuns: 3 },
    trustedRevision: record.policyRevision })) });
  const loopPolicy = freeze({ schemaVersion: 1, stopConditions: { maxIterations: 5, maxSameFailure: 2, maxFlakyRetries: 2,
    maxChangedFiles: 25, maxChangedLines: 1000, maxWallClockSeconds: 1800, tokenLimit: null, ciRunLimit: 2 } });
  const loopState = createLoopState({ taskId, branch: 'codex/issue-42-g1', baseSha: record.sourceRevision,
    headSha: record.sourceRevision, risk: 'low', acceptanceCriteria: [], policy: loopPolicy, now: '2026-10-13T00:00:00.000Z' });
  let liveLease = true;
  const store = {
    loadTaskRecord: async () => structuredClone(record),
    compareAndSaveTaskRecordUnderLease: async (next, expected, owner) => {
      if (!liveLease || owner !== 'runner-a' || record.version !== expected) return 'stale';
      record = structuredClone(next); return 'saved';
    },
    claimTaskLease: async () => liveLease,
    releaseTaskLease: async () => { liveLease = false; return true; },
  };
  const options = { taskId, leaseOwner: 'runner-a', store, loadContext: async () => ({ policy, loopPolicy, loopState }),
    now: () => Date.parse('2026-10-13T00:01:00.000Z') };
  return { options, get: () => record, expire: () => { liveLease = false; } };
}
it('persists state and model reservations through the existing reducer and lease-bound version CAS', async () => {
  const f = fixture();
  const session = createTaskSession(f.options);
  await session.advance('start');
  await session.reserve('model');
  assert.equal(f.get().state, 'planning');
  assert.equal(f.get().budgets.modelCalls, 1);
  assert.equal(f.get().version, 3);
});
it('refuses progress after lease loss without resetting the durable task or budgets', async () => {
  const f = fixture();
  const session = createTaskSession(f.options);
  await session.advance('start');
  f.expire();
  await assert.rejects(session.reserve('model'), { code: 'task_session_stale' });
  assert.equal(f.get().state, 'planning');
  assert.equal(f.get().budgets.modelCalls, 0);
});
it('does not use a disabled canonical policy to start a task', async () => {
  const f = fixture();
  const context = await f.options.loadContext();
  const session = createTaskSession({ ...f.options, loadContext: async () => ({ ...context, policy: Object.freeze({ ...context.policy, enabled: false }) }) });
  await assert.rejects(session.advance('start'), { code: 'task_policy_disabled' });
  assert.equal(f.get().state, 'queued');
});
