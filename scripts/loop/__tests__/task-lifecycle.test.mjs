import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { advanceTask, reserveTaskBudget, TaskTransitionError } from '../tasks/lifecycle.mjs';
import { createLoopState } from '../state.mjs';

function record(overrides = {}) {
  return {
    schemaVersion: 2,
    key: { repositoryId: 1234, issueNumber: 42, generation: 1 },
    taskId: 'repo-1234-issue-42-g1', requestDigest: 'a'.repeat(64), acceptanceIds: ['tests'],
    sourceRevision: 'b'.repeat(40), policyRevision: 'c'.repeat(40), state: 'queued', version: 1,
    attempt: 0, epoch: 0, deadline: '2026-10-14T00:00:00.000Z',
    budgets: { modelCalls: 0, repairs: 0, deliveries: 0, lastModelTokenUsed: null },
    links: { loopStateTaskId: 'repo-1234-issue-42-g1', pr: null }, outcomeReason: null, confirmedMergeSha: null,
    ...overrides,
  };
}

const stopConditions = { maxIterations: 5, maxSameFailure: 2, maxFlakyRetries: 3, maxChangedFiles: 25, maxChangedLines: 1000, maxWallClockSeconds: 1800, tokenLimit: 1000, ciRunLimit: 2 };
const policy = Object.freeze({ schemaVersion: 1, enabled: false, autoMergeEnabled: false, ownerActorIds: Object.freeze([93824124]), eligibleActors: Object.freeze([93824124]), optInLabel: 'autonomous:run', eligibleCategories: Object.freeze(['documentation', 'frontend']), eligiblePaths: Object.freeze(['docs/API.md']), eligibleRisks: Object.freeze(['low', 'medium']), runner: Object.freeze({ provider: 'openai', model: 'GPT-6-Luna' }), capabilities: Object.freeze(['observe', 'propose_patch', 'run_fixed_verifier']), budgets: Object.freeze({ maxModelCalls: 8, maxDeliveryGenerations: 2, taskConcurrency: 1, maxHostedWorkflowRuns: 3 }), trustedRevision: 'c'.repeat(40) });
const loopPolicy = Object.freeze({ schemaVersion: 1, stopConditions: Object.freeze(stopConditions) });
const loopState = createLoopState({ taskId: 'repo-1234-issue-42-g1', branch: 'feature/task-contract', baseSha: 'd'.repeat(40), headSha: 'e'.repeat(40), risk: 'low', acceptanceCriteria: ['tests'], policy: loopPolicy, now: '2026-10-13T00:00:00.000Z' });
const context = { policy, loopPolicy, loopState };

function event(task, type, fields = {}) {
  return { type, taskId: task.taskId, attempt: task.attempt, epoch: task.epoch, expectedVersion: task.version, ...fields };
}

describe('deterministic task lifecycle', () => {
  it('advances only declared state edges and rejects wrong identity, attempt, and epoch', () => {
    const queued = record();
    const started = advanceTask(queued, event(queued, 'start'), context);
    assert.equal(started.record.state, 'planning');
    assert.equal(started.record.version, 2);
    assert.equal(queued.state, 'queued');
    assert.equal(Object.hasOwn(started, 'authorization'), false);
    assert.equal(Object.hasOwn(started, 'capability'), false);
    assert.throws(() => advanceTask(queued, event(queued, 'start', { taskId: 'other' }), context), TaskTransitionError);
    assert.throws(() => advanceTask(queued, event(queued, 'start', { attempt: 1 }), context), TaskTransitionError);
    assert.throws(() => advanceTask(queued, event(queued, 'start', { epoch: 1 }), context), TaskTransitionError);
    assert.throws(() => advanceTask(queued, event(queued, 'start', { prompt: 'body' }), context), TaskTransitionError);
    assert.throws(() => advanceTask(queued, event(queued, 'start', { expectedVersion: 0 }), context), TaskTransitionError);
    assert.throws(() => advanceTask(record({ state: 'completed' }), event(queued, 'start'), context), TaskTransitionError);
  });

  it('keeps terminal states terminal and requires confirmed merge evidence', () => {
    const terminal = record({ state: 'completed' });
    assert.throws(() => advanceTask(terminal, event(terminal, 'report'), context), TaskTransitionError);
    const merging = record({ state: 'merging' });
    const denied = advanceTask(merging, event(merging, 'merge-confirmed'), context);
    assert.equal(denied.status, 'escalated');
    assert.equal(denied.record.state, 'escalated');

    const mergeSha = 'f'.repeat(40);
    const linked = record({ state: 'merging', links: { loopStateTaskId: 'repo-1234-issue-42-g1', pr: { repositoryId: 1234, number: 7, baseSha: 'd'.repeat(40), headSha: 'e'.repeat(40), mergeSha: null } } });
    const merged = advanceTask(linked, event(linked, 'merge-confirmed', { mergeSha }), {
      ...context,
      prSnapshot: { repositoryId: 1234, number: 7, baseSha: 'd'.repeat(40), headSha: 'e'.repeat(40), mergeSha },
    });
    assert.equal(merged.record.state, 'merged');
    assert.equal(merged.record.confirmedMergeSha, mergeSha);
    const reporting = advanceTask(merged.record, event(merged.record, 'report'), context);
    assert.equal(reporting.record.state, 'reporting');
    assert.equal(advanceTask(reporting.record, event(reporting.record, 'complete'), context).record.state, 'completed');
  });

  it('does not let PR tuple changes or restarts reset task or LoopState counters', () => {
    const current = record({ budgets: { modelCalls: 2, repairs: 1, deliveries: 1, lastModelTokenUsed: null }, links: { loopStateTaskId: 'repo-1234-issue-42-g1', pr: { repositoryId: 1234, number: 7, baseSha: 'd'.repeat(40), headSha: 'e'.repeat(40), mergeSha: null } } });
    const changedPr = { repositoryId: 1234, number: 7, baseSha: 'f'.repeat(40), headSha: '1'.repeat(40), mergeSha: null };
    const result = advanceTask(current, event(current, 'pr-updated', { pr: changedPr }), context);
    assert.equal(result.record.budgets.modelCalls, 2);
    assert.equal(result.record.budgets.repairs, 1);
    assert.equal(result.record.budgets.deliveries, 1);
    assert.equal(result.status, 'escalated');
  });

  it('refuses model or write reservations when required limits are exhausted or unknown', () => {
    const current = record({ state: 'planning' });
    const deliveryTask = record({ state: 'delivering' });
    assert.throws(() => reserveTaskBudget(current, { kind: 'model', expectedVersion: current.version }, { ...context, loopPolicy: { ...loopPolicy, stopConditions: { ...stopConditions, maxIterations: null } } }), TaskTransitionError);
    assert.throws(() => reserveTaskBudget(current, { kind: 'model', expectedVersion: current.version }, { ...context, loopState: { ...loopState, budgets: { ...loopState.budgets, tokenUsed: null } } }), TaskTransitionError);
    const reserved = reserveTaskBudget(current, { kind: 'model', expectedVersion: current.version }, context);
    assert.equal(reserved.budgets.modelCalls, 1);
    assert.equal(reserved.budgets.lastModelTokenUsed, 0);
    assert.equal(current.budgets.modelCalls, 0);
    assert.throws(() => reserveTaskBudget(reserved, { kind: 'model', expectedVersion: reserved.version }, context), TaskTransitionError);
    assert.throws(() => reserveTaskBudget(current, { kind: 'model', expectedVersion: current.version - 1 }, context), TaskTransitionError);
    const recordedUsage = { ...loopState, budgets: { ...loopState.budgets, tokenUsed: 10 } };
    const nextModel = reserveTaskBudget(reserved, { kind: 'model', expectedVersion: reserved.version }, { ...context, loopState: recordedUsage });
    assert.equal(nextModel.budgets.modelCalls, 2);
    assert.equal(nextModel.budgets.lastModelTokenUsed, 10);
    const delivery = reserveTaskBudget(deliveryTask, { kind: 'delivery', expectedVersion: deliveryTask.version }, context);
    const nextDelivery = reserveTaskBudget(delivery, { kind: 'delivery', expectedVersion: delivery.version }, context);
    assert.equal(nextDelivery.budgets.deliveries, 2);
    assert.throws(() => reserveTaskBudget(nextDelivery, { kind: 'delivery', expectedVersion: nextDelivery.version }, context), TaskTransitionError);
  });

  it('escalates ambiguous task and linked-state budget divergence', () => {
    const current = record({ budgets: { modelCalls: 2, repairs: 1, deliveries: 0, lastModelTokenUsed: null } });
    const result = advanceTask(current, event(current, 'start'), { ...context, loopState: { ...loopState, iteration: 2 } });
    assert.equal(result.status, 'escalated');
    assert.equal(result.record.state, 'escalated');
  });

  it('requires loader-returned policy evidence and validates LoopState before reducing', () => {
    const current = record();
    assert.throws(() => advanceTask(current, event(current, 'start'), { ...context, policy: { schemaVersion: 1, stopConditions }, canonicalPolicyRevision: current.policyRevision }), TaskTransitionError);
    const { trustedRevision, ...untrustedPolicy } = policy;
    assert.equal(trustedRevision, current.policyRevision);
    assert.throws(() => advanceTask(current, event(current, 'start'), { ...context, policy: untrustedPolicy, canonicalPolicyRevision: current.policyRevision }), TaskTransitionError);
    assert.throws(() => advanceTask(current, event(current, 'start'), { ...context, loopState: { ...loopState, unexpected: true } }), TaskTransitionError);
  });

  it('allows model reservations when the canonical token budget is explicitly disabled', () => {
    const unlimitedLoopPolicy = Object.freeze({ schemaVersion: 1, stopConditions: Object.freeze({ ...stopConditions, tokenLimit: null }) });
    const unlimitedLoopState = createLoopState({ taskId: record().taskId, branch: 'feature/task-contract', baseSha: 'd'.repeat(40), headSha: 'e'.repeat(40), risk: 'low', acceptanceCriteria: ['tests'], policy: unlimitedLoopPolicy, now: '2026-10-13T00:00:00.000Z' });
    const task = record({ state: 'planning' });
    const reserved = reserveTaskBudget(task, { kind: 'model', expectedVersion: 1 }, { policy, loopPolicy: unlimitedLoopPolicy, loopState: unlimitedLoopState });
    assert.equal(reserved.budgets.modelCalls, 1);
    assert.equal(reserved.budgets.lastModelTokenUsed, null);
  });

  it('rejects reservations for terminal, approval-waiting, cancelling, and incompatible phases', () => {
    const reservations = [
      { kind: 'model', allowed: ['planning', 'executing', 'verifying', 'reporting'] },
      { kind: 'repair', allowed: ['planning', 'executing'] },
      { kind: 'delivery', allowed: ['delivering'] },
    ];
    const forbiddenStates = ['completed', 'cancelled', 'escalated', 'failed', 'waiting-approval', 'cancelling'];
    for (const state of forbiddenStates) {
      for (const { kind } of reservations) {
        const task = record({ state });
        assert.throws(() => reserveTaskBudget(task, { kind, expectedVersion: task.version }, context), TaskTransitionError, `${kind} should be refused in ${state}`);
      }
    }
    for (const { kind, allowed } of reservations) {
      for (const state of ['queued', 'planning', 'executing', 'verifying', 'delivering', 'monitoring', 'merging', 'merged', 'reporting']) {
        if (allowed.includes(state)) continue;
        const task = record({ state, ...(state === 'merged' ? { confirmedMergeSha: 'f'.repeat(40), links: { ...record().links, pr: { repositoryId: 1234, number: 7, baseSha: 'd'.repeat(40), headSha: 'e'.repeat(40), mergeSha: 'f'.repeat(40) } } } : {}) });
        assert.throws(() => reserveTaskBudget(task, { kind, expectedVersion: task.version }, context), TaskTransitionError, `${kind} should be refused in ${state}`);
      }
    }
  });
});
