import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createLoopState } from '../state.mjs';
import { createPrBabysitterState, recordActionableFailure, recordCheckObservation } from '../pr-state.mjs';
import { createTaskCiReservationGate, evaluateTaskCi, reconcileTaskCi } from '../tasks/ci-reconciliation.mjs';

const head = 'a'.repeat(40); const base = 'b'.repeat(40); const merge = 'c'.repeat(40);
const fingerprint = 'd'.repeat(64); const taskId = 'repo-1234-issue-42-g1';
const currentPr = { repository: 'owner/repo', number: 7, state: 'open', draft: false, baseRef: 'main', baseSha: base,
  headRef: 'feature/task', headSha: head, mergeSha: merge, headRepository: 'owner/repo', updatedAt: '2026-10-13T00:00:00.000Z' };
const stopConditions = { maxIterations: 3, maxSameFailure: 2, maxFlakyRetries: 2, maxChangedFiles: 20,
  maxChangedLines: 1000, maxWallClockSeconds: 1800, tokenLimit: 1000, ciRunLimit: 2 };
const policy = Object.freeze({ schemaVersion: 1, enabled: false, autoMergeEnabled: false, ownerActorIds: Object.freeze([99]),
  eligibleActors: Object.freeze([99]), optInLabel: 'autonomous:run', eligibleCategories: Object.freeze(['frontend']),
  eligiblePaths: Object.freeze(['client/a.ts']), eligibleRisks: Object.freeze(['low']),
  runner: Object.freeze({ provider: 'openai', model: 'GPT-6-Luna' }), capabilities: Object.freeze(['observe']),
  budgets: Object.freeze({ maxModelCalls: 5, maxDeliveryGenerations: 2, taskConcurrency: 1, maxHostedWorkflowRuns: 3 }),
  trustedRevision: 'e'.repeat(40) });
const babysitterPolicy = { schemaVersion: 1, protectedPaths: { high: [], critical: [] }, riskRules: {
  low: [], medium: [], high: [], highRiskActions: ['stage1_required_check_recovery'],
  criticalActions: ['production_secret_access', 'production_db_mutation', 'branch_protection_bypass', 'direct_push_main', 'disable_security_checks', 'production_deployment_promotion'],
}, stopConditions };

function makeRecord(overrides = {}) {
  return { schemaVersion: 2, key: { repositoryId: 1234, issueNumber: 42, generation: 1 }, taskId,
    requestDigest: fingerprint, acceptanceIds: ['checks'], sourceRevision: 'f'.repeat(40), policyRevision: policy.trustedRevision,
    state: 'monitoring', version: 5, attempt: 1, epoch: 1, deadline: '2026-10-14T00:00:00.000Z',
    budgets: { modelCalls: 1, repairs: 0, deliveries: 1, lastModelTokenUsed: null },
    links: { loopStateTaskId: taskId, pr: { repositoryId: 1234, number: 7, baseSha: base, headSha: head, mergeSha: merge } },
    outcomeReason: null, confirmedMergeSha: null, ...overrides };
}

function check(conclusion = 'success') {
  return { checkId: 'ci-unit', requiredCheckKey: 'unit|app:10', requiredWorkflowKey: null, provider: 'github-check',
    headSha: head, baseSha: base, mergeSha: merge, testedSha: merge, attemptKey: 'run-1-attempt-1', status: 'completed',
    conclusion, runnerOutcome: null, coversRelevantScope: true, protectedPathTouched: false,
    failureFingerprint: conclusion === 'failure' ? fingerprint : null };
}

function makeBabysitterInput({ status = 'complete', conclusion = 'success', pr = currentPr } = {}) {
  let prState = createPrBabysitterState(pr);
  const observation = check(conclusion);
  prState = recordCheckObservation(prState, observation);
  if (conclusion === 'failure') {
    prState = recordActionableFailure(prState, { headSha: observation.headSha, baseSha: observation.baseSha,
      mergeSha: observation.mergeSha, attemptKey: observation.attemptKey, failureFingerprint: observation.failureFingerprint });
  }
  return { prSnapshot: pr, requiredCheckSnapshot: { baseRef: 'main', policyFingerprint: fingerprint,
    requiredCheckKeys: ['unit|app:10'], requiredWorkflowKeys: [], requiredWorkflows: [], collectionStatus: status },
    checkObservations: [observation], checkCollectionComplete: true, prState, policy: babysitterPolicy };
}

function makeSnapshot(options = {}) {
  const pr = options.prSnapshot ?? currentPr;
  return { repositoryId: 1234, prSnapshot: pr, babysitterInput: makeBabysitterInput({ ...options, pr }) };
}

const loopPolicy = Object.freeze({ schemaVersion: 1, stopConditions: Object.freeze(stopConditions) });
const loopState = createLoopState({ taskId, branch: 'feature/task', baseSha: base, headSha: head, risk: 'low',
  acceptanceCriteria: ['checks'], policy: loopPolicy, now: '2026-10-13T00:00:00.000Z' });
const context = { policy, loopPolicy, loopState };
const verifierEvidence = { complete: true, verifiedRevision: head, currentRevision: head,
  verifiedWorkspaceFingerprint: fingerprint, currentWorkspaceFingerprint: fingerprint };
const now = Date.parse('2026-10-13T00:10:00.000Z');

describe('Task CI reconciliation', () => {
  it('waits on an incomplete required check policy', () => {
    const result = evaluateTaskCi({ record: makeRecord(), snapshot: makeSnapshot({ status: 'incomplete' }), context, verifierEvidence, now });
    assert.equal(result.status, 'wait');
    assert.equal(result.reasonCode, 'required_check_policy_incomplete');
  });

  it('waits when a required check observation is missing', () => {
    const snapshot = makeSnapshot({ conclusion: 'failure' });
    snapshot.babysitterInput = { ...snapshot.babysitterInput, checkObservations: [], checkCollectionComplete: true };
    const result = evaluateTaskCi({ record: makeRecord(), snapshot, context, verifierEvidence, now });
    assert.equal(result.status, 'wait');
    assert.equal(result.reasonCode, 'required_check_evidence_missing');
  });

  it('escalates a stale PR tuple without reverting TaskRecord counters', () => {
    const record = makeRecord({ budgets: { modelCalls: 3, repairs: 2, deliveries: 1, lastModelTokenUsed: 50 } });
    const changedPr = { ...currentPr, headSha: '9'.repeat(40) };
    const changedBabysitterInput = { ...makeBabysitterInput({ status: 'incomplete' }), prSnapshot: changedPr,
      prState: createPrBabysitterState(changedPr), checkObservations: [] };
    const snapshot = { ...makeSnapshot(), prSnapshot: changedPr, babysitterInput: changedBabysitterInput };
    const result = evaluateTaskCi({ record, snapshot, context, verifierEvidence, now });
    assert.equal(result.status, 'escalate');
    assert.equal(result.reasonCode, 'pr_tuple_changed');
    assert.equal(record.budgets.repairs, 2);
    assert.equal(record.version, 5);
  });

  it('requires verifier evidence bound to the current head and workspace snapshot', () => {
    const result = evaluateTaskCi({ record: makeRecord(), snapshot: makeSnapshot(), context,
      verifierEvidence: { ...verifierEvidence, currentWorkspaceFingerprint: '9'.repeat(64) }, now });
    assert.equal(result.status, 'wait');
    assert.equal(result.reasonCode, 'current_workspace_verifier_evidence_required');
  });

  it('requires a passing, revision-stable and workspace-stable verifier result', () => {
    for (const patch of [{ passed: false }, { revisionStable: false }, { workspaceStable: false }]) {
      const result = evaluateTaskCi({ record: makeRecord(), snapshot: makeSnapshot(), context,
        verifierEvidence: { ...verifierEvidence, ...patch }, now });
      assert.equal(result.status, 'wait');
      assert.equal(result.reasonCode, 'current_workspace_verifier_evidence_required');
    }
  });

  it('stops at the finite CI budget before recommending a repair or rerun', () => {
    const exhausted = createLoopState({ taskId, branch: 'feature/task', baseSha: base, headSha: head, risk: 'low',
      acceptanceCriteria: ['checks'], policy: loopPolicy, now: '2026-10-13T00:00:00.000Z' });
    exhausted.budgets.ciRuns = 2;
    const result = evaluateTaskCi({ record: makeRecord(), snapshot: makeSnapshot({ conclusion: 'failure' }),
      context: { ...context, loopState: exhausted }, verifierEvidence, now });
    assert.equal(result.status, 'escalate');
    assert.equal(result.reasonCode, 'ci_budget_exhausted');
  });

  it('escalates a repeated deterministic failure using the persisted PR Babysitter counter', () => {
    const snapshot = makeSnapshot({ conclusion: 'failure' });
    const priorFailure = { ...check('failure'), attemptKey: 'run-0-attempt-1' };
    let state = createPrBabysitterState(currentPr);
    for (const failure of [priorFailure, check('failure')]) {
      state = recordCheckObservation(state, failure);
      state = recordActionableFailure(state, { headSha: failure.headSha, baseSha: failure.baseSha,
        mergeSha: failure.mergeSha, attemptKey: failure.attemptKey, failureFingerprint: failure.failureFingerprint });
    }
    snapshot.babysitterInput = { ...snapshot.babysitterInput, prState: state };
    const result = evaluateTaskCi({ record: makeRecord(), snapshot, context, verifierEvidence, now });
    assert.equal(result.status, 'escalate', JSON.stringify(result));
    assert.equal(result.reasonCode, 'max_same_failure', JSON.stringify(result));
  });

  it('persists an escalation only through TaskRecord compare-and-save', async () => {
    const record = makeRecord();
    const snapshot = makeSnapshot({ conclusion: 'failure' });
    const exhausted = createLoopState({ taskId, branch: 'feature/task', baseSha: base, headSha: head, risk: 'low',
      acceptanceCriteria: ['checks'], policy: loopPolicy, now: '2026-10-13T00:00:00.000Z' });
    exhausted.budgets.ciRuns = 2;
    let savedRecord = null;
    const store = {
      async loadTaskRecord(id) { assert.equal(id, taskId); return record; },
      async assertTaskLease(id, owner, timestamp, expectedVersion) {
        assert.equal(id, taskId); assert.equal(owner, 'host-worker-1'); assert.ok(timestamp > 0);
        assert.equal(expectedVersion, record.version); return true;
      },
      async compareAndSaveTaskRecordUnderLease(next, expectedVersion, owner) {
        assert.equal(expectedVersion, record.version);
        assert.equal(owner, 'host-worker-1');
        savedRecord = next;
        return 'saved';
      },
    };
    const result = await reconcileTaskCi({ taskId, store, observe: async () => snapshot,
      leaseOwner: 'host-worker-1', context: { ...context, loopState: exhausted }, verifierEvidence, now });
    assert.equal(result.status, 'escalated');
    assert.equal(savedRecord.state, 'escalated');
    assert.deepEqual(savedRecord.budgets, record.budgets);
  });

  it('refuses CI action reconciliation without a lease-bound host reservation gate', async () => {
    const snapshot = makeSnapshot({ conclusion: 'failure' });
    const result = await reconcileTaskCi({ taskId, leaseOwner: 'host-worker-1', store: {
      loadTaskRecord: async () => makeRecord(),
      compareAndSaveTaskRecord: async () => 'saved',
    }, observe: async () => snapshot, context, verifierEvidence, now,
    reserveAction: async () => ({ status: 'reserved' }), handoffAction: async () => {} });
    assert.equal(result.status, 'refused');
    assert.equal(result.reasonCode, 'trusted_host_adapters_required');
  });

  it('does not hand off an action after lease loss or a changed task/PR tuple', async () => {
    const snapshot = makeSnapshot({ conclusion: 'failure' });
    for (const stale of ['lease', 'tuple']) {
      const record = makeRecord();
      let loads = 0;
      let leaseChecks = 0;
      let handedOff = false;
      const store = {
        async loadTaskRecord() {
          loads += 1;
          if (stale === 'tuple' && loads > 1) return { ...record, links: { ...record.links, pr: { ...record.links.pr, headSha: '9'.repeat(40) } } };
          return record;
        },
        async assertTaskLease() { leaseChecks += 1; return stale !== 'lease' || leaseChecks === 1; },
        async compareAndSaveTaskRecordUnderLease() { return 'saved'; },
      };
      const reserveAction = createTaskCiReservationGate({ reserveAndPersist: async (request) => ({ ...request,
        reservedVersion: request.expectedVersion, handle: Object.freeze({ opaque: true }) }) });
      const result = await reconcileTaskCi({ taskId, store, leaseOwner: 'host-worker-1', observe: async () => snapshot,
        context, verifierEvidence, reserveAction, handoffAction: async () => { handedOff = true; }, now });
      assert.equal(handedOff, false, stale);
      assert.ok(['stale', 'wait'].includes(result.status), stale);
    }
  });

  it('accepts an action handoff only with a branded reservation bound to the exact task tuple', async () => {
    const snapshot = makeSnapshot({ conclusion: 'failure' });
    const record = makeRecord();
    let handedOff = null;
    const store = {
      async loadTaskRecord() { return record; },
      async assertTaskLease() { return true; },
      async compareAndSaveTaskRecordUnderLease() { return 'saved'; },
    };
    const reserveAction = createTaskCiReservationGate({ reserveAndPersist: async (request) => ({
      ...request, reservedVersion: request.expectedVersion, handle: Object.freeze({}) }) });
    const result = await reconcileTaskCi({ taskId, store, leaseOwner: 'host-worker-1', observe: async () => snapshot,
      context, verifierEvidence, reserveAction, handoffAction: async (action) => { handedOff = action; }, now });
    assert.equal(result.status, 'action-handed-off');
    assert.equal(handedOff.taskId, taskId);
    assert.equal(handedOff.expectedVersion, record.version);
    assert.equal(handedOff.action, 'request-repair');
    assert.deepEqual(handedOff.tuple, { repositoryId: 1234, number: 7, baseSha: base, headSha: head, mergeSha: merge });
  });

  it('rejects a host reservation receipt for a different PR head', async () => {
    const snapshot = makeSnapshot({ conclusion: 'failure' });
    const record = makeRecord();
    let handedOff = false;
    const store = { loadTaskRecord: async () => record, assertTaskLease: async () => true,
      compareAndSaveTaskRecordUnderLease: async () => 'saved' };
    const reserveAction = createTaskCiReservationGate({ reserveAndPersist: async (request) => ({
      ...request, tuple: { ...request.tuple, headSha: '9'.repeat(40) },
      reservedVersion: request.expectedVersion, handle: Object.freeze({}),
    }) });
    const result = await reconcileTaskCi({ taskId, store, leaseOwner: 'host-worker-1', observe: async () => snapshot,
      context, verifierEvidence, reserveAction, handoffAction: async () => { handedOff = true; }, now });
    assert.equal(result.status, 'wait');
    assert.equal(result.reasonCode, 'action_budget_reservation_unavailable');
    assert.equal(handedOff, false);
  });
});
