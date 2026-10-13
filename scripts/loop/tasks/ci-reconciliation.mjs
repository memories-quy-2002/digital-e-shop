import { validateTaskRecord } from './contracts.mjs';
import { advanceTask, reserveTaskBudget } from './lifecycle.mjs';
import { decidePrAction } from '../pr-babysitter.mjs';
import { normalizePrSnapshot } from '../pr-evidence.mjs';

const SHA = /^[a-f0-9]{40,64}$/i;
const DIGEST = /^[a-f0-9]{64}$/i;
const CI_RESERVATIONS = new WeakMap();
const CI_RESERVATION_GATES = new WeakSet();

function result(status, reasonCode, extra = {}) {
  return Object.freeze({ status, reasonCode, ...extra });
}

function taskPrSnapshot(snapshot) {
  return {
    repositoryId: snapshot.repositoryId,
    number: snapshot.prSnapshot.number,
    baseSha: snapshot.prSnapshot.baseSha,
    headSha: snapshot.prSnapshot.headSha,
    mergeSha: snapshot.prSnapshot.mergeSha,
  };
}

function tupleMatches(record, snapshot) {
  const linked = record.links.pr;
  const current = snapshot.prSnapshot;
  return linked !== null
    && linked.repositoryId === snapshot.repositoryId
    && linked.number === current.number
    && linked.baseSha.toLowerCase() === current.baseSha.toLowerCase()
    && linked.headSha.toLowerCase() === current.headSha.toLowerCase()
    && (linked.mergeSha?.toLowerCase() ?? null) === (current.mergeSha?.toLowerCase() ?? null);
}

function stopReason(record, snapshot, context, now) {
  const { policy, loopPolicy, loopState } = context ?? {};
  const conditions = loopPolicy?.stopConditions;
  if (!policy || !conditions || !loopState) return 'trusted_budget_context_missing';
  if (!Object.isFrozen(policy) || !Object.isFrozen(loopPolicy)) return 'trusted_budget_context_invalid';
  if (record.policyRevision !== policy.trustedRevision) return 'policy_revision_mismatch';
  if (Date.parse(record.deadline) <= now) return 'task_deadline_exceeded';
  if (!Number.isSafeInteger(loopState.budgets?.ciRuns)
    || !Number.isSafeInteger(loopState.budgets?.ciRunLimit)
    || loopState.budgets.ciRunLimit !== conditions.ciRunLimit) return 'ci_budget_unknown';
  if (!Number.isSafeInteger(policy.budgets?.maxHostedWorkflowRuns) || policy.budgets.maxHostedWorkflowRuns < 1) return 'ci_budget_unknown';
  if (loopState.budgets.ciRuns >= policy.budgets.maxHostedWorkflowRuns
    || (conditions.ciRunLimit !== null && loopState.budgets.ciRuns >= conditions.ciRunLimit)) return 'ci_budget_exhausted';
  const startedAt = Date.parse(loopState.startedAt);
  if (!Number.isFinite(startedAt) || !Number.isSafeInteger(conditions.maxWallClockSeconds)) return 'wall_clock_budget_unknown';
  if (now - startedAt >= conditions.maxWallClockSeconds * 1000) return 'wall_clock_budget_exhausted';
  if (conditions.tokenLimit !== null
    && (!Number.isSafeInteger(loopState.budgets?.tokenUsed)
      || loopState.budgets.tokenUsed >= conditions.tokenLimit)) return 'token_budget_exhausted_or_unknown';
  if (snapshot.decisionAction === 'request-repair') {
    if (!Number.isSafeInteger(policy.budgets?.maxModelCalls)
      || record.budgets.modelCalls >= policy.budgets.maxModelCalls) return 'model_budget_exhausted_or_unknown';
    if (!Number.isSafeInteger(conditions.maxIterations)
      || record.budgets.repairs >= conditions.maxIterations) return 'repair_budget_exhausted_or_unknown';
  }
  return null;
}

function elapsedStopReason(record, context, now) {
  const { policy, loopPolicy, loopState } = context ?? {};
  const maxSeconds = loopPolicy?.stopConditions?.maxWallClockSeconds;
  if (!policy || !loopPolicy || !loopState || !Object.isFrozen(policy) || !Object.isFrozen(loopPolicy)) {
    return 'trusted_budget_context_missing';
  }
  if (record.policyRevision !== policy.trustedRevision) return 'policy_revision_mismatch';
  if (Date.parse(record.deadline) <= now) return 'task_deadline_exceeded';
  const startedAt = Date.parse(loopState.startedAt);
  if (!Number.isFinite(startedAt) || !Number.isSafeInteger(maxSeconds) || maxSeconds < 1) return 'wall_clock_budget_unknown';
  if (now - startedAt >= maxSeconds * 1000) return 'wall_clock_budget_exhausted';
  return null;
}

function verifierMatches(evidence, headSha) {
  return Boolean(evidence && evidence.complete === true
    && evidence.passed === true && evidence.revisionStable === true && evidence.workspaceStable === true
    && typeof evidence.verifiedRevision === 'string' && SHA.test(evidence.verifiedRevision)
    && evidence.verifiedRevision.toLowerCase() === headSha.toLowerCase()
    && typeof evidence.currentRevision === 'string' && SHA.test(evidence.currentRevision)
    && evidence.currentRevision.toLowerCase() === headSha.toLowerCase()
    && typeof evidence.verifiedWorkspaceFingerprint === 'string' && DIGEST.test(evidence.verifiedWorkspaceFingerprint)
    && typeof evidence.currentWorkspaceFingerprint === 'string' && DIGEST.test(evidence.currentWorkspaceFingerprint)
    && evidence.verifiedWorkspaceFingerprint.toLowerCase() === evidence.currentWorkspaceFingerprint.toLowerCase());
}

function reservationTupleMatches(left, right) {
  return left && right && left.repositoryId === right.repositoryId && left.number === right.number
    && left.baseSha?.toLowerCase() === right.baseSha?.toLowerCase()
    && left.headSha?.toLowerCase() === right.headSha?.toLowerCase()
    && (left.mergeSha?.toLowerCase() ?? null) === (right.mergeSha?.toLowerCase() ?? null);
}

function reservationRequest(record, evaluation) {
  return Object.freeze({ taskId: record.taskId, expectedVersion: record.version,
    action: evaluation.decision.action, tuple: Object.freeze({ ...evaluation.tuple }) });
}

/** Wrap the trusted host's atomic budget reservation callback in an opaque, identity-bound handle. */
export function createTaskCiReservationGate({ reserveAndPersist } = {}) {
  if (typeof reserveAndPersist !== 'function') throw new TypeError('ci_reservation_gate_configuration_invalid');
  const gate = async (input) => {
    const expected = input?.reservationRequest;
    if (!expected || typeof expected.taskId !== 'string' || !Number.isSafeInteger(expected.expectedVersion)
        || !['request-repair', 'retry-check'].includes(expected.action) || !expected.tuple) {
      throw new TypeError('ci_reservation_request_invalid');
    }
    const receipt = await reserveAndPersist(expected);
    const keys = ['action', 'expectedVersion', 'handle', 'reservedVersion', 'taskId', 'tuple'];
    if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)
        || Object.keys(receipt).sort().join('|') !== keys.join('|')
        || receipt.taskId !== expected.taskId || receipt.expectedVersion !== expected.expectedVersion
        || receipt.action !== expected.action || !reservationTupleMatches(receipt.tuple, expected.tuple)
        || !Number.isSafeInteger(receipt.reservedVersion)
        || receipt.reservedVersion < expected.expectedVersion || receipt.reservedVersion > expected.expectedVersion + 1
        || (receipt.handle === null || (typeof receipt.handle !== 'object' && typeof receipt.handle !== 'function'))) {
      throw new TypeError('ci_reservation_receipt_invalid');
    }
    const handle = Object.freeze({});
    CI_RESERVATIONS.set(handle, Object.freeze({ ...expected, reservedVersion: receipt.reservedVersion,
      tuple: Object.freeze({ ...expected.tuple }), hostHandle: receipt.handle }));
    return handle;
  };
  CI_RESERVATION_GATES.add(gate);
  return gate;
}

async function assertLease(store, taskId, owner, version, now) {
  if (await store.assertTaskLease(taskId, owner, now, version) !== true) return false;
  return true;
}

async function loadFreshRecord(store, taskId) {
  return validateTaskRecord(await store.loadTaskRecord(taskId));
}

function sameTaskAndTuple(original, current) {
  return current.taskId === original.taskId && current.key.repositoryId === original.key.repositoryId
    && current.key.issueNumber === original.key.issueNumber && current.key.generation === original.key.generation
    && current.requestDigest === original.requestDigest && current.policyRevision === original.policyRevision
    && current.sourceRevision === original.sourceRevision && current.state === original.state
    && current.links.pr?.repositoryId === original.links.pr?.repositoryId
    && current.links.pr?.number === original.links.pr?.number
    && current.links.pr?.baseSha === original.links.pr?.baseSha
    && current.links.pr?.headSha === original.links.pr?.headSha
    && current.links.pr?.mergeSha === original.links.pr?.mergeSha;
}

/** Reconcile one authenticated PR/check snapshot with the existing TaskRecord and PR Babysitter state.
 * This function is read-only; callers reserve repair/rerun budgets before starting external work.
 */
export function evaluateTaskCi({ record: inputRecord, snapshot, context, verifierEvidence, now = Date.now() }) {
  let record;
  try { record = validateTaskRecord(inputRecord); }
  catch { return result('refused', 'task_record_invalid'); }
  if (!snapshot || typeof snapshot !== 'object' || !snapshot.prSnapshot || !snapshot.babysitterInput) {
    return result('wait', 'authenticated_pr_snapshot_required');
  }
  try {
    const current = normalizePrSnapshot(snapshot.prSnapshot);
    const checksPr = normalizePrSnapshot(snapshot.babysitterInput.prSnapshot);
    if (JSON.stringify(current) !== JSON.stringify(checksPr)) return result('wait', 'pr_snapshot_sources_disagree');
    snapshot = { ...snapshot, prSnapshot: current };
  } catch {
    return result('wait', 'authenticated_pr_snapshot_invalid');
  }
  if (!Number.isSafeInteger(snapshot.repositoryId) || snapshot.repositoryId < 1
    || record.links.pr?.repositoryId !== snapshot.repositoryId
    || record.links.pr?.number !== snapshot.prSnapshot.number) return result('escalate', 'pr_identity_mismatch');
  if (!tupleMatches(record, snapshot)) return result('escalate', 'pr_tuple_changed', { currentTuple: taskPrSnapshot(snapshot) });
  if (record.state !== 'monitoring') return result('wait', 'task_not_monitoring');
  const elapsedReason = elapsedStopReason(record, context, now);
  if (elapsedReason) return result('escalate', elapsedReason);

  let decision;
  try {
    decision = decidePrAction(snapshot.babysitterInput);
  } catch {
    return result('wait', 'pr_evidence_invalid_or_incomplete');
  }
  const decisionAction = decision.action;
  if (['request-repair', 'retry-check'].includes(decisionAction)) {
    const reasonCode = stopReason(record, { ...snapshot, decisionAction }, context, now);
    if (reasonCode) return result('escalate', reasonCode, { decision });
  }
  if (decisionAction === 'escalate') return result('escalate', decision.reasonCode, { decision });
  if (decisionAction === 'ready-for-human') {
    if (!verifierMatches(verifierEvidence, snapshot.prSnapshot.headSha)) {
      return result('wait', 'current_workspace_verifier_evidence_required', { decision });
    }
    return result('ready-for-merge-eligibility', 'checks_and_verifier_current', {
      decision,
      taskId: record.taskId,
      expectedVersion: record.version,
      tuple: taskPrSnapshot(snapshot),
    });
  }
  if (decisionAction === 'request-repair' || decisionAction === 'retry-check') {
    return result('action-required', decision.reasonCode, {
      decision,
      taskId: record.taskId,
      expectedVersion: record.version,
      tuple: taskPrSnapshot(snapshot),
      reservationRequired: decisionAction === 'request-repair' ? 'repair-and-ci' : 'ci',
    });
  }
  return result('wait', decision.reasonCode, { decision });
}

/** Host-facing bounded coordinator. `observe` must independently fetch current GitHub evidence;
 * `reserveAction` must atomically reserve TaskRecord/LoopState budgets before returning a lease.
 */
export async function reconcileTaskCi({ taskId, store, leaseOwner, observe, context, verifierEvidence,
  reserveAction, handoffAction, now = Date.now() }) {
  const clock = typeof now === 'function' ? now : () => now;
  if (!store || typeof store.loadTaskRecord !== 'function'
    || typeof store.assertTaskLease !== 'function'
    || typeof store.compareAndSaveTaskRecordUnderLease !== 'function'
    || typeof leaseOwner !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(leaseOwner)
    || typeof observe !== 'function') return result('refused', 'trusted_host_adapters_required');
  let record;
  try {
    record = validateTaskRecord(await store.loadTaskRecord(taskId));
  } catch {
    return result('refused', 'task_record_unavailable_or_corrupt');
  }
  if (record.taskId !== taskId) return result('refused', 'task_identity_mismatch');

  const timestamp = clock();
  if (!Number.isSafeInteger(timestamp) || timestamp < 1) return result('refused', 'task_clock_invalid');
  try {
    if (!await assertLease(store, taskId, leaseOwner, record.version, timestamp)) return result('stale', 'task_lease_lost');
  } catch { return result('stale', 'task_lease_lost'); }

  let snapshot;
  try {
    snapshot = await observe(Object.freeze({ taskId, expectedVersion: record.version, pr: record.links.pr }));
  } catch {
    return result('wait', 'trusted_pr_observation_unavailable');
  }
  const evaluation = evaluateTaskCi({ record, snapshot, context, verifierEvidence, now });

  if (evaluation.status === 'escalate') {
    let transition;
    try {
      const lifecycleSnapshot = taskPrSnapshot(snapshot);
      transition = advanceTask(record, {
        type: 'escalate', taskId: record.taskId, attempt: record.attempt,
        epoch: record.epoch, expectedVersion: record.version, reason: evaluation.reasonCode,
      }, { ...context, prSnapshot: lifecycleSnapshot });
    } catch {
      return result('refused', 'trusted_task_lifecycle_context_invalid');
    }
    if (transition.record?.state !== 'escalated') return result('refused', 'task_escalation_not_applied');
    let current;
    try {
      current = await loadFreshRecord(store, taskId);
      if (!sameTaskAndTuple(record, current) || current.version !== record.version
          || !await assertLease(store, taskId, leaseOwner, record.version, clock())) return result('stale', 'task_record_or_lease_changed');
    } catch { return result('stale', 'task_record_or_lease_changed'); }
    let saved;
    try { saved = await store.compareAndSaveTaskRecordUnderLease(transition.record, record.version, leaseOwner, clock()); }
    catch { return result('wait', 'task_record_persistence_unavailable'); }
    if (saved !== 'saved') return result('stale', 'task_record_revision_changed');
    return result('escalated', evaluation.reasonCode, { record: transition.record });
  }

  if (evaluation.status === 'action-required') {
    if (typeof reserveAction !== 'function' || !CI_RESERVATION_GATES.has(reserveAction)
        || typeof handoffAction !== 'function') return result('wait', 'action_budget_reservation_required', { evaluation });
    let reservation;
    const expectedReservation = reservationRequest(record, evaluation);
    try { reservation = await reserveAction({ reservationRequest: expectedReservation }); }
    catch { return result('wait', 'action_budget_reservation_unavailable', { evaluation }); }
    const trusted = reservation && typeof reservation === 'object' ? CI_RESERVATIONS.get(reservation) : null;
    if (!trusted || trusted.taskId !== record.taskId || trusted.expectedVersion !== record.version
        || trusted.action !== evaluation.decision.action || !reservationTupleMatches(trusted.tuple, evaluation.tuple)) {
      return result('wait', 'action_budget_reservation_unavailable', { evaluation });
    }
    let current;
    try {
      current = await loadFreshRecord(store, taskId);
      if (!sameTaskAndTuple(record, current) || current.version !== trusted.reservedVersion
          || !await assertLease(store, taskId, leaseOwner, current.version, clock())) {
        return result('stale', 'task_record_or_lease_changed');
      }
    } catch { return result('stale', 'task_record_or_lease_changed'); }
    let latestSnapshot;
    try {
      latestSnapshot = await observe(Object.freeze({ taskId, expectedVersion: current.version, pr: current.links.pr }));
    } catch { return result('wait', 'trusted_pr_observation_unavailable'); }
    const latestEvaluation = evaluateTaskCi({ record: current, snapshot: latestSnapshot, context, verifierEvidence, now: clock() });
    if (latestEvaluation.status !== 'action-required'
        || latestEvaluation.decision?.action !== trusted.action
        || !reservationTupleMatches(latestEvaluation.tuple, trusted.tuple)) {
      return result('stale', 'pr_tuple_or_action_changed');
    }
    try {
      if (!await assertLease(store, taskId, leaseOwner, current.version, clock())) return result('stale', 'task_lease_lost');
    } catch { return result('stale', 'task_lease_lost'); }
    try {
      await handoffAction(Object.freeze({ taskId, expectedVersion: current.version, action: trusted.action,
        tuple: trusted.tuple, reservationHandle: trusted.hostHandle }));
    } catch { return result('wait', 'action_handoff_unavailable', { evaluation }); }
    return result('action-handed-off', evaluation.reasonCode, { evaluation });
  }
  return evaluation;
}

// Explicit re-export keeps host adapters on the same reducer reservation contract.
export { reserveTaskBudget };
