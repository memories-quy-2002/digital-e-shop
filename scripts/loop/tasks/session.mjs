import { validateTaskRecord } from './contracts.mjs';
import { advanceTask, reserveTaskBudget } from './lifecycle.mjs';
import { realpath } from 'node:fs/promises';
import path from 'node:path';
import { loadLoopState } from '../state.mjs';
import { readGitHeadRevision } from '../verify.mjs';

export class TaskSessionError extends Error {
  constructor(code) { super(code); this.name = new.target.name; this.code = code; }
}
function fail(code) { throw new TaskSessionError(code); }

/** Host-owned policy/LoopState readers and a lease-bound durable store are mandatory. */
export function createTaskSession(options) {
  if (!options || typeof options.taskId !== 'string' || typeof options.leaseOwner !== 'string'
      || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(options.leaseOwner)
      || typeof options.store?.loadTaskRecord !== 'function'
      || typeof options.store?.compareAndSaveTaskRecordUnderLease !== 'function'
      || typeof options.loadContext !== 'function') fail('task_session_configuration_invalid');
  const now = options.now ?? Date.now;
  let workspaceRoot;
  async function load() {
    const record = validateTaskRecord(await options.store.loadTaskRecord(options.taskId));
    if (record.taskId !== options.taskId) fail('task_session_identity_mismatch');
    const timestamp = now();
    if (!Number.isSafeInteger(timestamp) || timestamp < 1) fail('task_session_clock_invalid');
    if (Date.parse(record.deadline) <= timestamp) fail('task_deadline_exhausted');
    const context = await options.loadContext(record, { workspaceRoot });
    if (context?.policy?.enabled !== true) fail('task_policy_disabled');
    return { record, context, timestamp };
  }
  async function persist(next, prior) {
    const timestamp = now();
    if (!Number.isSafeInteger(timestamp) || timestamp < 1 || Date.parse(prior.deadline) <= timestamp) fail('task_deadline_exhausted');
    const outcome = await options.store.compareAndSaveTaskRecordUnderLease(next, prior.version, options.leaseOwner, timestamp);
    if (outcome !== 'saved') fail('task_session_stale');
    return validateTaskRecord(next);
  }
  async function advance(type, fields = {}) {
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)
        || Object.keys(fields).some((key) => !['reason', 'pr', 'mergeSha', 'completionProof'].includes(key))) fail('task_session_event_invalid');
    const { record, context } = await load();
    const result = advanceTask(record, { type, taskId: record.taskId, expectedVersion: record.version,
      attempt: record.attempt, epoch: record.epoch, ...fields }, context);
    return persist(result.record, record);
  }
  async function reserve(kind) {
    const { record, context } = await load();
    const next = reserveTaskBudget(record, { kind, expectedVersion: record.version }, context);
    return persist(next, record);
  }
  async function renew(leaseMs = 15 * 60 * 1000) {
    const { record, timestamp } = await load();
    if (typeof options.store.claimTaskLease !== 'function'
        || !Number.isSafeInteger(leaseMs) || leaseMs < 1 || leaseMs > 15 * 60 * 1000) fail('task_session_configuration_invalid');
    if (await options.store.claimTaskLease(record.taskId, options.leaseOwner, timestamp, leaseMs, record.version) !== true) fail('task_session_stale');
    return record;
  }
  async function assertLease() {
    const { record } = await load();
    if (typeof options.store.assertTaskLease !== 'function'
        || await options.store.assertTaskLease(record.taskId, options.leaseOwner, now(), record.version) !== true) fail('task_session_stale');
    return record;
  }
  async function bindWorkspace(inputPath) {
    const record = await assertLease();
    if (typeof inputPath !== 'string' || !path.isAbsolute(inputPath)) fail('task_workspace_invalid');
    const resolved = await realpath(inputPath);
    if (path.resolve(resolved).toLowerCase() !== path.resolve(inputPath).toLowerCase()) fail('task_workspace_invalid');
    const state = await loadLoopState(resolved, record.taskId);
    if (state.taskId !== record.taskId || state.baseSha !== record.sourceRevision
        || state.headSha !== await readGitHeadRevision(resolved)
        || state.branch !== `codex/issue-${record.key.issueNumber}-g${record.key.generation}`) fail('task_workspace_identity_mismatch');
    await assertLease();
    workspaceRoot = resolved;
    return record;
  }
  return Object.freeze({ advance, reserve, renew, assertLease, bindWorkspace,
    current: async () => (await load()).record, context: async () => { const loaded = await load(); return { record: loaded.record, context: loaded.context }; } });
}
