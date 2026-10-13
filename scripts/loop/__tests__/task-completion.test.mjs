import assert from 'node:assert/strict';
import { it } from 'node:test';
import { buildTaskCompletionReport, classifyTaskRecovery, createTaskCompletionGate } from '../tasks/completion.mjs';
import { advanceTask } from '../tasks/lifecycle.mjs';
import { createLoopState } from '../state.mjs';

const sha = 'a'.repeat(40);
const mergeSha = 'b'.repeat(40);
const task = { schemaVersion: 2, taskId: 'repo-1234-issue-42-g1', key: { repositoryId: 1234, issueNumber: 42, generation: 1 },
  requestDigest: 'c'.repeat(64), sourceRevision: sha, policyRevision: sha, acceptanceIds: ['tests'],
  state: 'reporting', version: 5, attempt: 1, epoch: 1, deadline: '2026-10-14T00:00:00.000Z',
  budgets: { modelCalls: 2, repairs: 1, deliveries: 1, lastModelTokenUsed: null },
  links: { loopStateTaskId: 'repo-1234-issue-42-g1', pr: { repositoryId: 1234, number: 7, baseSha: sha, headSha: sha, mergeSha } },
  confirmedMergeSha: mergeSha, outcomeReason: null };
const evidence = { repositoryId: 1234, prNumber: 7, baseRef: 'main', merged: true, headSha: sha, mergeSha,
  checkedAt: '2026-10-13T00:00:00.000Z', hostedCiComplete: true,
  requiredCheckPolicyComplete: true,
  requiredCheckSnapshot: { baseRef: 'main', policyFingerprint: 'c'.repeat(64), collectionStatus: 'complete', requiredChecks: [{ context: 'client', appId: 15368 }], requiredWorkflows: [] },
  checkObservations: [{ checkId: 'check-1', requiredCheckKey: 'client|app:15368', requiredWorkflowKey: null,
    provider: 'github-check', headSha: sha, baseSha: sha, mergeSha: null, testedSha: sha,
    attemptKey: 'run-1', status: 'completed', conclusion: 'success', runnerOutcome: null,
    coversRelevantScope: true, protectedPathTouched: false, failureFingerprint: null }],
  verification: { mode: 'full', passed: true, verifiedRevision: sha, currentRevision: sha,
    revisionStable: true, workspaceStable: true, verifiedWorkspaceFingerprint: 'd'.repeat(64), currentWorkspaceFingerprint: 'd'.repeat(64) } };
const now = Date.parse(evidence.checkedAt);
it('reports completion only for the observed merge and current full verification without raw task text', () => {
  const report = buildTaskCompletionReport(task, evidence, now);
  assert.equal(report.mergeSha, mergeSha);
  assert.equal(report.repairs, 1);
  assert.equal(Object.hasOwn(report, 'issueBody'), false);
  assert.match(report.reportDigest, /^[a-f0-9]{64}$/);
});
it('issues a one-use reducer proof only after fresh checks, merge, and lease observation', async () => {
  const loopPolicy = Object.freeze({ schemaVersion: 1, stopConditions: Object.freeze({ maxIterations: 5,
    maxSameFailure: 2, maxFlakyRetries: 2, maxChangedFiles: 20, maxChangedLines: 500, maxWallClockSeconds: 1800,
    tokenLimit: 1000, ciRunLimit: 2 }) });
  const frozenPolicy = Object.freeze({ schemaVersion: 1, enabled: false, autoMergeEnabled: false,
    ownerActorIds: Object.freeze([93824124]), eligibleActors: Object.freeze([93824124]), optInLabel: 'autonomous:run',
    eligibleCategories: Object.freeze(['documentation']), eligiblePaths: Object.freeze(['docs/API.md']),
    eligibleRisks: Object.freeze(['low']), runner: Object.freeze({ provider: 'openai', model: 'GPT-6-Luna' }),
    capabilities: Object.freeze(['observe']), budgets: Object.freeze({ maxModelCalls: 8, maxDeliveryGenerations: 2,
      taskConcurrency: 1, maxHostedWorkflowRuns: 3 }), trustedRevision: sha });
  const loopState = createLoopState({ taskId: task.taskId, branch: 'codex/issue-42-g1', baseSha: sha, headSha: sha,
    risk: 'low', acceptanceCriteria: ['tests'], policy: loopPolicy, now: '2026-10-13T00:00:00.000Z' });
  const completionContext = { policy: frozenPolicy, loopPolicy, loopState };
  const gate = createTaskCompletionGate({ taskId: task.taskId, leaseOwner: 'host-runner-1',
    store: { loadTaskRecord: async () => structuredClone(task), assertTaskLease: async () => true },
    observeCompletion: async () => evidence, now: () => now });
  const { report, proof } = await gate.authorize(task.version);
  assert.match(report.reportDigest, /^[a-f0-9]{64}$/);
  const completed = advanceTask(task, { type: 'complete', taskId: task.taskId, attempt: task.attempt,
    epoch: task.epoch, expectedVersion: task.version, completionProof: proof }, completionContext);
  assert.equal(completed.record.state, 'completed');
  assert.equal(advanceTask(task, { type: 'complete', taskId: task.taskId, attempt: task.attempt,
    epoch: task.epoch, expectedVersion: task.version, completionProof: proof }, completionContext).record.state, 'escalated');
});
it('rejects unmerged, stale, foreign and incomplete completion evidence', () => {
  for (const bad of [{ ...evidence, merged: false }, { ...evidence, headSha: 'e'.repeat(40) },
    { ...evidence, hostedCiComplete: false }, { ...evidence, repositoryId: 999 },
    { ...evidence, checkObservations: [] },
    { ...evidence, checkObservations: [{ ...evidence.checkObservations[0], requiredCheckKey: 'client|app:1' }] },
    { ...evidence, checkObservations: [{ ...evidence.checkObservations[0], conclusion: 'failure', failureFingerprint: 'f'.repeat(64) }] }]) {
    assert.throws(() => buildTaskCompletionReport(task, bad, now));
  }
  assert.throws(() => buildTaskCompletionReport(task, evidence, now + 301_000));
});
it('does not reclaim execution with uncertain process termination or a live lease', () => {
  const running = { ...task, state: 'executing', confirmedMergeSha: null, links: { ...task.links, pr: null } };
  assert.equal(classifyTaskRecovery(running, { leaseUntil: now + 1000, runnerStopped: false }, now).action, 'wait');
  assert.equal(classifyTaskRecovery(running, { leaseUntil: now - 1, runnerStopped: false }, now).action, 'escalate');
  assert.equal(classifyTaskRecovery(running, { leaseUntil: now - 1, runnerStopped: true }, now).action, 'resume');
  assert.equal(running.budgets.repairs, 1);
});
