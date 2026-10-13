import { validateTaskRecord } from './contracts.mjs';
import { validateLoopState } from '../state.mjs';

export class TaskTransitionError extends Error {
  constructor(message, options = {}) { super(message, options); this.name = new.target.name; }
}

const TERMINAL = new Set(['completed', 'cancelled', 'escalated', 'failed']);
const RESERVATION_PHASES = Object.freeze({
  model: new Set(['planning', 'executing', 'verifying', 'reporting']),
  repair: new Set(['planning', 'executing']),
  delivery: new Set(['delivering']),
});
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
  const allowed = ['type', 'taskId', 'attempt', 'epoch', 'expectedVersion', 'reason', 'pr', 'mergeSha'];
  if (Object.keys(event).some((key) => !allowed.includes(key))) fail('event has unsupported fields');
  if (event.taskId !== record.taskId || event.attempt !== record.attempt || event.epoch !== record.epoch) fail('event identity, attempt, or epoch does not match');
  if (!Number.isSafeInteger(event.expectedVersion) || event.expectedVersion !== record.version) fail('event expectedVersion is stale or invalid');
  if (typeof event.type !== 'string') fail('event type is required');
}

function assertExactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} is invalid`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail(`${label} has missing or unsupported fields`);
}

function validatePolicy(policy, loopPolicy, record) {
  // The host must load these canonical objects; validate their shape here without I/O.
  const policyKeys = ['schemaVersion', 'enabled', 'autoMergeEnabled', 'ownerActorIds', 'eligibleActors', 'optInLabel', 'eligibleCategories', 'eligiblePaths', 'eligibleRisks', 'runner', 'capabilities', 'budgets', 'trustedRevision'];
  assertExactKeys(policy, policyKeys, 'loader-returned autonomy policy');
  if (!Object.isFrozen(policy) || policy.schemaVersion !== 1 || typeof policy.trustedRevision !== 'string'
    || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(policy.trustedRevision) || policy.trustedRevision !== record.policyRevision) {
    fail('trusted canonical autonomy policy is required');
  }
  if (typeof policy.enabled !== 'boolean' || typeof policy.autoMergeEnabled !== 'boolean'
    || !Array.isArray(policy.ownerActorIds) || !Array.isArray(policy.eligibleActors)
    || !Array.isArray(policy.eligibleCategories) || !Array.isArray(policy.eligiblePaths)
    || !Array.isArray(policy.eligibleRisks) || !Array.isArray(policy.capabilities)
    || typeof policy.optInLabel !== 'string') fail('loader-returned autonomy policy is invalid');
  for (const key of ['ownerActorIds', 'eligibleActors', 'eligibleCategories', 'eligiblePaths', 'eligibleRisks', 'capabilities']) {
    if (!Object.isFrozen(policy[key])) fail(`loader-returned autonomy policy ${key} is invalid`);
  }
  if (!Object.isFrozen(policy.runner) || !Object.isFrozen(policy.budgets)) fail('loader-returned autonomy policy is invalid');
  if (policy.ownerActorIds.length === 0 || policy.eligibleActors.length === 0
    || policy.ownerActorIds.some((id) => !Number.isSafeInteger(id) || id <= 0)
    || policy.eligibleActors.some((id) => !Number.isSafeInteger(id) || id <= 0)
    || !policy.ownerActorIds.every((id) => policy.eligibleActors.includes(id))) fail('loader-returned autonomy policy actors are invalid');
  for (const key of ['eligibleCategories', 'eligiblePaths', 'eligibleRisks', 'capabilities']) {
    if (policy[key].some((value) => typeof value !== 'string') || new Set(policy[key]).size !== policy[key].length) fail(`loader-returned autonomy policy ${key} is invalid`);
  }
  if (!/^[a-z0-9][a-z0-9:_-]{0,49}$/.test(policy.optInLabel)) fail('loader-returned autonomy policy optInLabel is invalid');
  assertExactKeys(policy.runner, ['provider', 'model'], 'policy runner');
  if (policy.runner.provider !== 'openai' || policy.runner.model !== 'GPT-6-Luna') fail('policy runner is unsupported');
  assertExactKeys(policy.budgets, ['maxModelCalls', 'maxDeliveryGenerations', 'taskConcurrency', 'maxHostedWorkflowRuns'], 'policy budgets');
  for (const key of ['maxModelCalls', 'maxDeliveryGenerations', 'taskConcurrency', 'maxHostedWorkflowRuns']) {
    if (!Number.isSafeInteger(policy.budgets[key]) || policy.budgets[key] < 1) fail(`policy budget ${key} is invalid`);
  }

  assertExactKeys(loopPolicy, ['schemaVersion', 'stopConditions'], 'loaded loop policy');
  if (!Object.isFrozen(loopPolicy) || loopPolicy.schemaVersion !== 1 || !Object.isFrozen(loopPolicy.stopConditions)) fail('loaded loop policy is invalid');
  const conditions = loopPolicy.stopConditions;
  const stopKeys = ['maxIterations', 'maxSameFailure', 'maxFlakyRetries', 'maxChangedFiles', 'maxChangedLines', 'maxWallClockSeconds', 'tokenLimit', 'ciRunLimit'];
  assertExactKeys(conditions, stopKeys, 'loop policy stopConditions');
  for (const key of stopKeys.slice(0, 6)) {
    if (!Number.isSafeInteger(conditions[key]) || conditions[key] < 1) fail(`policy budget ${key} is unknown`);
  }
  for (const key of ['tokenLimit', 'ciRunLimit']) {
    if (conditions[key] !== null && (!Number.isSafeInteger(conditions[key]) || conditions[key] < 1)) fail(`policy budget ${key} is unknown`);
  }
  return conditions;
}

function contextValues(context, record) {
  if (!context || typeof context !== 'object' || !context.policy || !context.loopPolicy || !context.loopState) fail('validated policy and LoopState are required');
  const conditions = validatePolicy(context.policy, context.loopPolicy, record);
  const loop = context.loopState;
  try { validateLoopState(loop); } catch (error) { throw new TaskTransitionError('validated LoopState is required', { cause: error }); }
  if (loop.taskId !== record.links.loopStateTaskId) fail('LoopState task identity does not match');
  return { conditions, loop };
}

function reconcile(record, context, event) {
  const { conditions, loop } = contextValues(context, record);
  if (loop.budgets.tokenLimit !== conditions.tokenLimit || loop.budgets.ciRunLimit !== conditions.ciRunLimit) fail('policy and LoopState budget limits diverge');
  if (loop.maxIterations !== conditions.maxIterations || loop.budgets.wallClockLimitSeconds !== conditions.maxWallClockSeconds) fail('policy and LoopState limits diverge');
  if (loop.iteration > record.budgets.repairs) fail('linked repair budget counters diverge');
  if (record.budgets.lastModelTokenUsed !== null
    && (loop.budgets.tokenUsed === null || loop.budgets.tokenUsed < record.budgets.lastModelTokenUsed)) fail('linked token usage diverged');
  if (conditions.tokenLimit === null && record.budgets.lastModelTokenUsed !== null) fail('disabled token budget conflicts with task counter');
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
  if (!reservation || typeof reservation !== 'object') fail('reservation is invalid');
  assertExactKeys(reservation, ['kind', 'expectedVersion'], 'reservation');
  if (!['model', 'repair', 'delivery'].includes(reservation.kind)) fail('reservation kind is invalid');
  if (!Number.isSafeInteger(reservation.expectedVersion) || reservation.expectedVersion !== record.version) fail('reservation expectedVersion is stale or invalid');
  if (TERMINAL.has(record.state) || !RESERVATION_PHASES[reservation.kind].has(record.state)) {
    fail(`reservation kind ${reservation.kind} is not allowed in task state ${record.state}`);
  }
  // The host must atomically compare-and-save this next version before starting the operation.
  // Token-cost estimates and durable reservation storage remain host responsibilities.
  let reconciled;
  try { reconciled = reconcile(record, trustedContext, { type: 'budget-reservation' }); } catch (error) { throw error instanceof TaskTransitionError ? error : new TaskTransitionError('budget context is invalid', { cause: error }); }
  const { conditions, loop } = reconciled;
  const next = structuredClone(record);
  if (reservation.kind === 'model') {
    if (!Number.isSafeInteger(trustedContext.policy.budgets.maxModelCalls)
      || next.budgets.modelCalls >= trustedContext.policy.budgets.maxModelCalls) fail('model budget is exhausted or unknown');
    if (conditions.tokenLimit !== null) {
      // This snapshot baseline is a coarse repeat gate; it does not reserve a per-call token estimate.
      if (!Number.isSafeInteger(loop.budgets.tokenLimit) || loop.budgets.tokenLimit !== conditions.tokenLimit
        || !Number.isSafeInteger(loop.budgets.tokenUsed) || loop.budgets.tokenUsed < 0
        || loop.budgets.tokenUsed >= conditions.tokenLimit
        || (next.budgets.lastModelTokenUsed !== null
          && loop.budgets.tokenUsed <= next.budgets.lastModelTokenUsed)) {
        fail('model token budget is exhausted, already reserved, or unknown');
      }
      next.budgets.lastModelTokenUsed = loop.budgets.tokenUsed;
    } else if (loop.budgets.tokenLimit !== null || loop.budgets.tokenUsed !== null) {
      fail('disabled token budget does not match LoopState');
    }
    next.budgets.modelCalls += 1;
  } else if (reservation.kind === 'repair') {
    if (!Number.isSafeInteger(conditions.maxIterations) || next.budgets.repairs >= conditions.maxIterations) fail('repair budget is exhausted or unknown');
    next.budgets.repairs += 1;
  } else {
    if (!Number.isSafeInteger(trustedContext.policy.budgets.maxDeliveryGenerations)
      || next.budgets.deliveries >= trustedContext.policy.budgets.maxDeliveryGenerations) fail('delivery budget is exhausted or unknown');
    next.budgets.deliveries += 1;
  }
  next.version += 1;
  try { return validateTaskRecord(next); } catch (error) { throw new TaskTransitionError('reservation produced an invalid TaskRecord', { cause: error }); }
}
