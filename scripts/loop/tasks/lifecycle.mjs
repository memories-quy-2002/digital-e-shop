import { validateTaskRecord } from './contracts.mjs';

export class TaskTransitionError extends Error {
  constructor(message, options = {}) { super(message, options); this.name = new.target.name; }
}

const TERMINAL = new Set(['merged', 'completed', 'cancelled', 'escalated', 'failed']);
const EDGES = Object.freeze({
  queued: { start: 'planning', 'wait-approval': 'waiting-approval', cancel: 'cancelling' },
  planning: { execute: 'executing', 'wait-approval': 'waiting-approval', fail: 'failed', escalate: 'escalated', cancel: 'cancelling' },
  executing: { verify: 'verifying', 'wait-approval': 'waiting-approval', fail: 'failed', escalate: 'escalated', cancel: 'cancelling' },
  verifying: { deliver: 'delivering', retry: 'retry-wait', fail: 'failed', escalate: 'escalated' },
  delivering: { monitor: 'monitoring', fail: 'failed', escalate: 'escalated' },
  monitoring: { merge: 'merging', report: 'reporting', retry: 'retry-wait', escalate: 'escalated' },
  merging: { 'merge-confirmed': 'merged', report: 'reporting', escalate: 'escalated' },
  merged: { report: 'reporting' },
  reporting: { complete: 'completed', fail: 'failed' },
  'waiting-approval': { approve: 'planning', reject: 'cancelled', escalate: 'escalated' },
  'retry-wait': { retry: 'planning', escalate: 'escalated', cancel: 'cancelling' },
  cancelling: { cancel: 'cancelled', escalate: 'escalated' },
});

function fail(message) { throw new TaskTransitionError(message); }
function validateEvent(record, event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) fail('event is invalid');
  const allowed = ['type', 'taskId', 'attempt', 'epoch', 'reason', 'pr', 'mergeSha'];
  if (Object.keys(event).some((key) => !allowed.includes(key))) fail('event has unsupported fields');
  if (event.taskId !== record.taskId || event.attempt !== record.attempt || event.epoch !== record.epoch) fail('event identity, attempt, or epoch does not match');
  if (typeof event.type !== 'string') fail('event type is required');
}

function contextValues(context) {
  if (!context || typeof context !== 'object' || !context.policy || !context.loopState) fail('validated policy and LoopState are required');
  const conditions = context.policy.stopConditions;
  const loop = context.loopState;
  if (context.policy.schemaVersion !== 1 || !conditions || loop.schemaVersion !== 2 || !loop.budgets) fail('validated policy and LoopState are required');
  if (loop.taskId !== context.taskId && context.taskId !== undefined) fail('LoopState task identity does not match');
  for (const key of ['maxIterations', 'tokenLimit', 'ciRunLimit']) {
    const value = conditions[key];
    if (value !== null && (!Number.isSafeInteger(value) || value < 1)) fail(`policy budget ${key} is unknown`);
  }
  return { conditions, loop };
}

function reconcile(record, context, event) {
  const { conditions, loop } = contextValues(context);
  const policyRevision = context.policy.trustedRevision ?? context.canonicalPolicyRevision;
  if (policyRevision !== record.policyRevision) fail('canonical policy revision does not match task');
  if (loop.budgets.tokenLimit !== conditions.tokenLimit || loop.budgets.ciRunLimit !== conditions.ciRunLimit) fail('policy and LoopState budget limits diverge');
  if (loop.taskId !== record.links.loopStateTaskId) fail('LoopState link does not match task');
  if (loop.iteration > record.budgets.repairs || loop.budgets.ciRuns > record.budgets.deliveries) fail('linked budget counters diverge');
  if (record.budgets.repairs > conditions.maxIterations) fail('repair counter exceeds canonical policy');
  if (record.links.pr && context.prSnapshot) {
    const prior = record.links.pr;
    const next = context.prSnapshot;
    if (next.repositoryId !== prior.repositoryId || next.number !== prior.number) fail('PR identity changed');
    const confirmedMerge = event.type === 'merge-confirmed'
      && prior.mergeSha === null && typeof next.mergeSha === 'string';
    if (next.baseSha !== prior.baseSha || next.headSha !== prior.headSha
      || (next.mergeSha !== prior.mergeSha && !confirmedMerge)) fail('PR tuple changed; task requires escalation');
  }
  return { conditions, loop };
}

function escalate(record, reason) {
  const next = validateTaskRecord({ ...record, state: 'escalated', version: record.version + 1, outcomeReason: reason });
  return { status: 'escalated', reason, record: next };
}

export function advanceTask(input, event, trustedContext) {
  let record;
  try { record = validateTaskRecord(input); } catch (error) { throw new TaskTransitionError('TaskRecord is missing or corrupt', { cause: error }); }
  validateEvent(record, event);
  if (TERMINAL.has(record.state)) fail('terminal task states cannot transition');
  try { reconcile(record, trustedContext, event); } catch (error) {
    if (error instanceof TaskTransitionError && /diverge|tuple changed|PR identity|budget exceeds/.test(error.message)) return escalate(record, 'linked_state_divergence');
    throw error;
  }
  if (event.type === 'pr-updated') return escalate(record, 'pr_tuple_changed');
  const target = EDGES[record.state]?.[event.type];
  if (!target) fail('transition is not allowed');
  if (event.type === 'merge-confirmed') {
    if (typeof event.mergeSha !== 'string' || !/^[a-f0-9]{40,64}$/i.test(event.mergeSha)
      || !record.links.pr || trustedContext?.prSnapshot?.mergeSha?.toLowerCase() !== event.mergeSha.toLowerCase()) {
      return escalate(record, 'merge_evidence_missing');
    }
  }
  const next = { ...record, state: target, version: record.version + 1 };
  if (event.type === 'merge-confirmed') {
    next.confirmedMergeSha = event.mergeSha.toLowerCase();
    next.links.pr = { ...next.links.pr, mergeSha: event.mergeSha.toLowerCase() };
  }
  if (event.reason !== undefined) next.outcomeReason = event.reason;
  if (target === 'retry-wait') { next.attempt += 1; next.epoch += 1; }
  try { return { status: 'transitioned', reason: 'transition_applied', record: validateTaskRecord(next) }; }
  catch (error) { throw new TaskTransitionError('transition produced an invalid TaskRecord', { cause: error }); }
}

export function reserveTaskBudget(input, reservation, trustedContext) {
  let record;
  try { record = validateTaskRecord(input); } catch (error) { throw new TaskTransitionError('TaskRecord is missing or corrupt', { cause: error }); }
  if (!reservation || typeof reservation !== 'object' || Object.keys(reservation).some((key) => key !== 'kind') || !['model', 'repair', 'delivery'].includes(reservation.kind)) fail('reservation kind is invalid');
  let reconciled;
  try { reconciled = reconcile(record, trustedContext, { type: 'budget-reservation' }); } catch (error) { throw error instanceof TaskTransitionError ? error : new TaskTransitionError('budget context is invalid', { cause: error }); }
  const { conditions, loop } = reconciled;
  const next = structuredClone(record);
  if (reservation.kind === 'model') {
    if (!Number.isSafeInteger(loop.budgets.tokenLimit) || loop.budgets.tokenLimit < 1
      || !Number.isSafeInteger(loop.budgets.tokenUsed) || loop.budgets.tokenUsed < 0
      || !Number.isSafeInteger(conditions.maxIterations) || loop.iteration >= conditions.maxIterations
      || (conditions.tokenLimit !== null && loop.budgets.tokenUsed >= conditions.tokenLimit)) fail('model budget is exhausted or unknown');
    next.budgets.modelCalls += 1;
  } else if (reservation.kind === 'repair') {
    if (!Number.isSafeInteger(conditions.maxIterations) || next.budgets.repairs >= conditions.maxIterations) fail('repair budget is exhausted or unknown');
    next.budgets.repairs += 1;
  } else {
    if (!Number.isSafeInteger(conditions.ciRunLimit) || !Number.isSafeInteger(loop.budgets.ciRuns) || loop.budgets.ciRuns >= conditions.ciRunLimit) fail('delivery budget is exhausted or unknown');
    next.budgets.deliveries += 1;
  }
  next.version += 1;
  try { return validateTaskRecord(next); } catch (error) { throw new TaskTransitionError('reservation produced an invalid TaskRecord', { cause: error }); }
}
