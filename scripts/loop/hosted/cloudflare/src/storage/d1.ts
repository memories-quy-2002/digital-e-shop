import { validatePrBabysitterState } from '../../../../pr-state-contract.mjs';
import { validateTaskRecord } from '../../../../tasks/contracts.mjs';

const REVISION_PATTERN = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i;
const DELIVERY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const STABLE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/;
const MAX_PR_STATE_BYTES = 256 * 1024;
const MAX_TASK_RECORD_BYTES = 32 * 1024;
const TASK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;

export interface D1DeliveryInput {
  deliveryId: string;
  repositoryId: number;
  prNumber: number;
  event: string;
  action: string | null;
  receivedAt: string;
  expiresAt: number;
}

export interface ReconciliationCursor {
  page: number;
  sweepId: string | null;
  lastCompletedAt: string | null;
}

export interface CheckRunMapping {
  repositoryId: number;
  prNumber: number;
  headSha: string;
  checkRunId: number;
  updatedAt: string;
}

export type TaskRecord = ReturnType<typeof validateTaskRecord>;

type DeliveryStatus = 'received' | 'processed' | 'retry';

export class D1Stage0StorageError extends Error {
  readonly code:
    | 'configuration_invalid'
    | 'delivery_id_conflict'
    | 'delivery_not_found'
    | 'pr_state_invalid'
    | 'pr_state_corrupt'
    | 'pr_state_too_large'
    | 'check_run_mapping_invalid'
    | 'reconciliation_cursor_invalid'
    | 'task_record_invalid'
    | 'task_record_corrupt'
    | 'task_not_found'
    | 'task_conflict'
    | 'task_lease_invalid'
    | 'database_error';

  constructor(code: D1Stage0StorageError['code']) {
    super(code);
    this.name = 'D1Stage0StorageError';
    this.code = code;
  }
}

function positiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function timestamp(value: unknown): value is string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return false;
  return new Date(value).toISOString() === value;
}

function assertKey(repositoryId: number, prNumber: number, allowScheduler = false): void {
  if (!positiveInteger(repositoryId) || !Number.isSafeInteger(prNumber)
      || (allowScheduler ? prNumber < 0 : prNumber < 1)) {
    throw new D1Stage0StorageError('configuration_invalid');
  }
}

function assertDelivery(input: D1DeliveryInput): void {
  if (!input || !DELIVERY_ID_PATTERN.test(input.deliveryId)
      || !positiveInteger(input.repositoryId) || !positiveInteger(input.prNumber)
      || typeof input.event !== 'string' || input.event.length < 1 || input.event.length > 50
      || (input.action !== null && (typeof input.action !== 'string' || input.action.length < 1 || input.action.length > 50))
      || !timestamp(input.receivedAt) || !Number.isSafeInteger(input.expiresAt) || input.expiresAt < 1) {
    throw new D1Stage0StorageError('configuration_invalid');
  }
}

function stateTuple(state: Record<string, unknown>): { baseSha: string; headSha: string; mergeSha: string | null } {
  if (typeof state.baseSha !== 'string' || !REVISION_PATTERN.test(state.baseSha)
      || typeof state.headSha !== 'string' || !REVISION_PATTERN.test(state.headSha)
      || (state.mergeSha !== null && (typeof state.mergeSha !== 'string' || !REVISION_PATTERN.test(state.mergeSha)))) {
    throw new D1Stage0StorageError('pr_state_invalid');
  }
  return {
    baseSha: state.baseSha.toLowerCase(),
    headSha: state.headSha.toLowerCase(),
    mergeSha: state.mergeSha === null ? null : (state.mergeSha as string).toLowerCase(),
  };
}

function validateCursor(cursor: ReconciliationCursor): ReconciliationCursor {
  if (!cursor || !Number.isSafeInteger(cursor.page) || cursor.page < 1 || cursor.page > 1_000_000
      || (cursor.sweepId !== null && !STABLE_ID_PATTERN.test(cursor.sweepId))
      || (cursor.lastCompletedAt !== null && !timestamp(cursor.lastCompletedAt))) {
    throw new D1Stage0StorageError('reconciliation_cursor_invalid');
  }
  return cursor;
}

function validateMapping(mapping: CheckRunMapping): CheckRunMapping {
  if (!mapping || !positiveInteger(mapping.repositoryId) || !positiveInteger(mapping.prNumber)
      || typeof mapping.headSha !== 'string' || !REVISION_PATTERN.test(mapping.headSha)
      || !positiveInteger(mapping.checkRunId) || !timestamp(mapping.updatedAt)) {
    throw new D1Stage0StorageError('check_run_mapping_invalid');
  }
  return { ...mapping, headSha: mapping.headSha.toLowerCase() };
}

export function createD1Stage0Storage(db: D1Database) {
  if (!db || typeof db.prepare !== 'function' || typeof db.batch !== 'function') {
    throw new D1Stage0StorageError('configuration_invalid');
  }

  async function registerDelivery(input: D1DeliveryInput): Promise<'new' | 'duplicate'> {
    assertDelivery(input);
    try {
      const result = await db.prepare(
        "INSERT INTO delivery_records (delivery_id, repository_id, pr_number, event, action, received_at, expires_at, status, reason_code, updated_at) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, 'received', NULL, ?) ON CONFLICT(delivery_id) DO NOTHING",
      ).bind(
        input.deliveryId,
        input.repositoryId,
        input.prNumber,
        input.event,
        input.action,
        input.receivedAt,
        input.expiresAt,
        new Date().toISOString(),
      ).run();
      if ((result.meta?.changes ?? 0) > 0) return 'new';
      const existing = await db.prepare(
        'SELECT repository_id, pr_number, event, action FROM delivery_records WHERE delivery_id = ?',
      ).bind(input.deliveryId).first<{
        repository_id: number;
        pr_number: number;
        event: string;
        action: string | null;
      }>();
      if (!existing || existing.repository_id !== input.repositoryId || existing.pr_number !== input.prNumber
          || existing.event !== input.event || existing.action !== input.action) {
        throw new D1Stage0StorageError('delivery_id_conflict');
      }
      return 'duplicate';
    } catch (error) {
      if (error instanceof D1Stage0StorageError) throw error;
      throw new D1Stage0StorageError('database_error');
    }
  }

  function validateAndSerializeTask(recordInput: unknown): { record: TaskRecord; json: string } {
    let record: TaskRecord;
    try {
      record = validateTaskRecord(recordInput) as TaskRecord;
    } catch {
      throw new D1Stage0StorageError('task_record_invalid');
    }
    const json = JSON.stringify(record);
    if (new TextEncoder().encode(json).byteLength > MAX_TASK_RECORD_BYTES) {
      throw new D1Stage0StorageError('task_record_invalid');
    }
    return { record, json };
  }

  async function createTaskRecord(recordInput: unknown): Promise<'created'> {
    const { record, json } = validateAndSerializeTask(recordInput);
    try {
      await db.prepare(
        'INSERT INTO task_records (task_id, repository_id, issue_number, generation, version, state, record_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ).bind(
        record.taskId,
        record.key.repositoryId,
        record.key.issueNumber,
        record.key.generation,
        record.version,
        record.state,
        json,
        new Date().toISOString(),
      ).run();
      return 'created';
    } catch (error) {
      if (error instanceof D1Stage0StorageError) throw error;
      const code = String((error as { cause?: { message?: unknown } })?.cause?.message ?? error).toLowerCase();
      if (code.includes('unique') || code.includes('primary key')) throw new D1Stage0StorageError('task_conflict');
      throw new D1Stage0StorageError('database_error');
    }
  }

  async function createTaskRecordIfAbsent(recordInput: unknown): Promise<'created' | 'duplicate'> {
    const { record, json } = validateAndSerializeTask(recordInput);
    try {
      const inserted = await db.prepare(
        'INSERT INTO task_records (task_id, repository_id, issue_number, generation, version, state, record_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING',
      ).bind(
        record.taskId,
        record.key.repositoryId,
        record.key.issueNumber,
        record.key.generation,
        record.version,
        record.state,
        json,
        new Date().toISOString(),
      ).run();
      if ((inserted.meta?.changes ?? 0) === 1) return 'created';
      const existing = await loadTaskRecord(record.taskId);
      if (existing.key.repositoryId !== record.key.repositoryId
          || existing.key.issueNumber !== record.key.issueNumber
          || existing.key.generation !== record.key.generation
          || existing.requestDigest !== record.requestDigest
          || existing.sourceRevision !== record.sourceRevision
          || existing.policyRevision !== record.policyRevision) {
        throw new D1Stage0StorageError('task_conflict');
      }
      return 'duplicate';
    } catch (error) {
      if (error instanceof D1Stage0StorageError) throw error;
      throw new D1Stage0StorageError('database_error');
    }
  }

  async function loadTaskRecord(taskId: string): Promise<TaskRecord> {
    if (typeof taskId !== 'string' || !TASK_ID_PATTERN.test(taskId)) {
      throw new D1Stage0StorageError('task_record_invalid');
    }
    try {
      const row = await db.prepare('SELECT record_json FROM task_records WHERE task_id = ?')
        .bind(taskId).first<{ record_json: string }>();
      if (!row) throw new D1Stage0StorageError('task_not_found');
      if (new TextEncoder().encode(row.record_json).byteLength > MAX_TASK_RECORD_BYTES) {
        throw new D1Stage0StorageError('task_record_corrupt');
      }
      let parsed: unknown;
      try { parsed = JSON.parse(row.record_json); }
      catch { throw new D1Stage0StorageError('task_record_corrupt'); }
      try {
        const record = validateTaskRecord(parsed) as TaskRecord;
        if (record.taskId !== taskId) throw new D1Stage0StorageError('task_record_corrupt');
        return record;
      } catch (error) {
        if (error instanceof D1Stage0StorageError) throw error;
        throw new D1Stage0StorageError('task_record_corrupt');
      }
    } catch (error) {
      if (error instanceof D1Stage0StorageError) throw error;
      throw new D1Stage0StorageError('database_error');
    }
  }

  async function saveTaskRecord(recordInput: unknown, expectedVersion: number, lease?: { owner: string; now: number }): Promise<'saved' | 'stale'> {
    const { record, json } = validateAndSerializeTask(recordInput);
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1 || record.version !== expectedVersion + 1) {
      throw new D1Stage0StorageError('task_record_invalid');
    }
    const current = await loadTaskRecord(record.taskId);
    if (current.key.repositoryId !== record.key.repositoryId
        || current.key.issueNumber !== record.key.issueNumber
        || current.key.generation !== record.key.generation
        || current.requestDigest !== record.requestDigest
        || current.sourceRevision !== record.sourceRevision
        || current.policyRevision !== record.policyRevision
        || current.deadline !== record.deadline
        || JSON.stringify(current.acceptanceIds) !== JSON.stringify(record.acceptanceIds)) {
      throw new D1Stage0StorageError('task_record_invalid');
    }
    try {
      if (lease) {
        const result = await db.batch([
          db.prepare('UPDATE task_records SET version = ?, state = ?, record_json = ?, updated_at = ? WHERE task_id = ? AND version = ? ' +
            'AND EXISTS (SELECT 1 FROM task_execution_leases WHERE task_id = ? AND lease_owner = ? AND task_version = ? AND lease_until > ?)')
            .bind(record.version, record.state, json, new Date().toISOString(), record.taskId, expectedVersion,
              record.taskId, lease.owner, expectedVersion, lease.now),
          db.prepare('UPDATE task_execution_leases SET task_version = ? WHERE task_id = ? AND lease_owner = ? AND task_version = ? AND lease_until > ? ' +
            'AND EXISTS (SELECT 1 FROM task_records WHERE task_id = ? AND version = ?)')
            .bind(record.version, record.taskId, lease.owner, expectedVersion, lease.now, record.taskId, record.version),
        ]);
        return result[0].meta?.changes === 1 && result[1].meta?.changes === 1 ? 'saved' : 'stale';
      }
      const result = await db.prepare(
        'UPDATE task_records SET version = ?, state = ?, record_json = ?, updated_at = ? WHERE task_id = ? AND version = ?',
      ).bind(record.version, record.state, json, new Date().toISOString(), record.taskId, expectedVersion).run();
      return (result.meta?.changes ?? 0) === 1 ? 'saved' : 'stale';
    } catch {
      throw new D1Stage0StorageError('database_error');
    }
  }

  async function compareAndSaveTaskRecord(recordInput: unknown, expectedVersion: number): Promise<'saved' | 'stale'> {
    return saveTaskRecord(recordInput, expectedVersion);
  }

  async function compareAndSaveTaskRecordUnderLease(recordInput: unknown, expectedVersion: number, owner: string, now: number): Promise<'saved' | 'stale'> {
    if (!STABLE_ID_PATTERN.test(owner) || !Number.isSafeInteger(now) || now < 1) throw new D1Stage0StorageError('task_lease_invalid');
    return saveTaskRecord(recordInput, expectedVersion, { owner, now });
  }

  async function claimTaskLease(
    taskId: string,
    owner: string,
    nowMs: number,
    leaseMs: number,
    expectedVersion: number,
  ): Promise<boolean> {
    if (typeof taskId !== 'string' || !TASK_ID_PATTERN.test(taskId)
        || !STABLE_ID_PATTERN.test(owner) || !Number.isSafeInteger(nowMs) || nowMs < 1
        || !Number.isSafeInteger(leaseMs) || leaseMs < 1 || leaseMs > 15 * 60 * 1000
        || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
      throw new D1Stage0StorageError('task_lease_invalid');
    }
    try {
      const result = await db.prepare(
        "INSERT INTO task_execution_leases (task_id, lease_owner, task_version, lease_until) " +
        "SELECT task_id, ?, version, ? FROM task_records WHERE task_id = ? AND version = ? " +
        "AND state NOT IN ('completed', 'cancelled', 'escalated', 'failed') " +
        "AND NOT EXISTS (SELECT 1 FROM task_execution_leases other JOIN task_records active ON active.task_id = other.task_id " +
        'WHERE active.repository_id = task_records.repository_id AND other.task_id <> task_records.task_id) ' +
        'ON CONFLICT(task_id) DO UPDATE SET lease_owner = excluded.lease_owner, task_version = excluded.task_version, lease_until = excluded.lease_until ' +
        'WHERE task_execution_leases.lease_until <= ? OR task_execution_leases.lease_owner = ?',
      ).bind(owner, nowMs + leaseMs, taskId, expectedVersion, nowMs, owner).run();
      return (result.meta?.changes ?? 0) === 1;
    } catch {
      throw new D1Stage0StorageError('database_error');
    }
  }

  async function releaseTaskLease(taskId: string, owner: string): Promise<boolean> {
    if (typeof taskId !== 'string' || !TASK_ID_PATTERN.test(taskId) || !STABLE_ID_PATTERN.test(owner)) {
      throw new D1Stage0StorageError('task_lease_invalid');
    }
    try {
      const result = await db.prepare(
        'DELETE FROM task_execution_leases WHERE task_id = ? AND lease_owner = ?',
      ).bind(taskId, owner).run();
      return (result.meta?.changes ?? 0) === 1;
    } catch {
      throw new D1Stage0StorageError('database_error');
    }
  }

  async function loadTaskLease(taskId: string): Promise<{ owner: string; taskVersion: number; leaseUntil: number } | null> {
    if (!TASK_ID_PATTERN.test(taskId)) throw new D1Stage0StorageError('task_lease_invalid');
    try {
      const row = await db.prepare('SELECT lease_owner, task_version, lease_until FROM task_execution_leases WHERE task_id = ?')
        .bind(taskId).first<{ lease_owner: string; task_version: number; lease_until: number }>();
      if (!row) return null;
      if (!STABLE_ID_PATTERN.test(row.lease_owner) || !Number.isSafeInteger(row.task_version) || row.task_version < 1
          || !Number.isSafeInteger(row.lease_until) || row.lease_until < 1) throw new D1Stage0StorageError('task_lease_invalid');
      return { owner: row.lease_owner, taskVersion: row.task_version, leaseUntil: row.lease_until };
    } catch (error) {
      if (error instanceof D1Stage0StorageError) throw error;
      throw new D1Stage0StorageError('database_error');
    }
  }

  async function listTaskRecordsForReconciliation(repositoryId: number, now: number, limit: number): Promise<TaskRecord[]> {
    if (!Number.isSafeInteger(repositoryId) || repositoryId < 1 || !Number.isSafeInteger(now) || now < 1
        || !Number.isSafeInteger(limit) || limit < 1 || limit > 20) throw new D1Stage0StorageError('configuration_invalid');
    try {
      const rows = await db.prepare('SELECT t.record_json FROM task_records t LEFT JOIN task_execution_leases l ON l.task_id = t.task_id ' +
        "WHERE t.repository_id = ? AND t.state NOT IN ('completed','failed','escalated','cancelled','waiting-approval') " +
        'AND (l.task_id IS NULL OR l.lease_until <= ?) ORDER BY t.updated_at ASC, t.task_id ASC LIMIT ?')
        .bind(repositoryId, now, limit).all<{ record_json: string }>();
      return rows.results.map((row) => {
        const record = validateTaskRecord(JSON.parse(row.record_json)) as TaskRecord;
        if (record.key.repositoryId !== repositoryId) throw new D1Stage0StorageError('task_record_corrupt');
        return record;
      });
    } catch (error) {
      if (error instanceof D1Stage0StorageError) throw error;
      throw new D1Stage0StorageError('task_record_corrupt');
    }
  }

  async function assertTaskLease(taskId: string, owner: string, now: number, expectedVersion: number): Promise<boolean> {
    if (!STABLE_ID_PATTERN.test(owner) || !Number.isSafeInteger(now) || now < 1
        || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1) throw new D1Stage0StorageError('task_lease_invalid');
    const lease = await loadTaskLease(taskId);
    return lease !== null && lease.owner === owner && lease.taskVersion === expectedVersion && lease.leaseUntil > now;
  }

  async function getDeliveryStatus(deliveryId: string): Promise<DeliveryStatus | null> {
    if (!DELIVERY_ID_PATTERN.test(deliveryId)) throw new D1Stage0StorageError('configuration_invalid');
    try {
      const result = await db.prepare('SELECT status FROM delivery_records WHERE delivery_id = ?')
        .bind(deliveryId).first<{ status: DeliveryStatus }>();
      return result?.status ?? null;
    } catch {
      throw new D1Stage0StorageError('database_error');
    }
  }

  async function setDeliveryStatus(
    deliveryId: string,
    status: Exclude<DeliveryStatus, 'received'>,
    reasonCode: string | null = null,
  ): Promise<void> {
    if (!DELIVERY_ID_PATTERN.test(deliveryId) || (status !== 'processed' && status !== 'retry')
        || (reasonCode !== null && !STABLE_ID_PATTERN.test(reasonCode))) {
      throw new D1Stage0StorageError('configuration_invalid');
    }
    try {
      const result = await db.prepare(
        'UPDATE delivery_records SET status = ?, reason_code = ?, updated_at = ? WHERE delivery_id = ?',
      ).bind(status, reasonCode, new Date().toISOString(), deliveryId).run();
      if ((result.meta?.changes ?? 0) === 0) throw new D1Stage0StorageError('delivery_not_found');
    } catch (error) {
      if (error instanceof D1Stage0StorageError) throw error;
      throw new D1Stage0StorageError('database_error');
    }
  }

  async function claimLease(
    repositoryId: number,
    prNumber: number,
    owner: string,
    nowMs: number,
    leaseMs: number,
  ): Promise<boolean> {
    assertKey(repositoryId, prNumber, true);
    if (!STABLE_ID_PATTERN.test(owner) || !Number.isSafeInteger(nowMs) || !Number.isSafeInteger(leaseMs)
        || leaseMs < 1 || leaseMs > 15 * 60 * 1000) throw new D1Stage0StorageError('configuration_invalid');
    try {
      const result = await db.prepare(
        'INSERT INTO processing_leases (repository_id, pr_number, lease_owner, lease_until) VALUES (?, ?, ?, ?) ' +
        'ON CONFLICT(repository_id, pr_number) DO UPDATE SET lease_owner = excluded.lease_owner, lease_until = excluded.lease_until ' +
        'WHERE processing_leases.lease_until <= ? OR processing_leases.lease_owner = ?',
      ).bind(repositoryId, prNumber, owner, nowMs + leaseMs, nowMs, owner).run();
      return (result.meta?.changes ?? 0) > 0;
    } catch {
      throw new D1Stage0StorageError('database_error');
    }
  }

  async function releaseLease(repositoryId: number, prNumber: number, owner: string): Promise<boolean> {
    assertKey(repositoryId, prNumber, true);
    if (!STABLE_ID_PATTERN.test(owner)) throw new D1Stage0StorageError('configuration_invalid');
    try {
      const result = await db.prepare(
        'DELETE FROM processing_leases WHERE repository_id = ? AND pr_number = ? AND lease_owner = ?',
      ).bind(repositoryId, prNumber, owner).run();
      return (result.meta?.changes ?? 0) > 0;
    } catch {
      throw new D1Stage0StorageError('database_error');
    }
  }

  async function loadPrState(repositoryId: number, prNumber: number): Promise<Record<string, unknown> | null> {
    assertKey(repositoryId, prNumber);
    try {
      const row = await db.prepare(
        'SELECT base_sha, head_sha, merge_sha, state_json FROM pr_states WHERE repository_id = ? AND pr_number = ?',
      ).bind(repositoryId, prNumber).first<{
        base_sha: string;
        head_sha: string;
        merge_sha: string | null;
        state_json: string;
      }>();
      if (!row) return null;
      if (new TextEncoder().encode(row.state_json).byteLength > MAX_PR_STATE_BYTES) {
        throw new D1Stage0StorageError('pr_state_too_large');
      }
      let value: unknown;
      try {
        value = JSON.parse(row.state_json);
      } catch {
        throw new D1Stage0StorageError('pr_state_corrupt');
      }
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new D1Stage0StorageError('pr_state_corrupt');
      }
      try {
        const validated = validatePrBabysitterState(value);
        const tuple = stateTuple(validated);
        if (tuple.baseSha !== row.base_sha || tuple.headSha !== row.head_sha || tuple.mergeSha !== row.merge_sha) {
          throw new D1Stage0StorageError('pr_state_corrupt');
        }
        return validated as Record<string, unknown>;
      } catch (error) {
        if (error instanceof D1Stage0StorageError) throw error;
        throw new D1Stage0StorageError('pr_state_corrupt');
      }
    } catch (error) {
      if (error instanceof D1Stage0StorageError) throw error;
      throw new D1Stage0StorageError('database_error');
    }
  }

  async function savePrState(repositoryId: number, prNumber: number, stateInput: unknown): Promise<void> {
    assertKey(repositoryId, prNumber);
    let state: Record<string, unknown>;
    let tuple: ReturnType<typeof stateTuple>;
    try {
      state = validatePrBabysitterState(stateInput) as Record<string, unknown>;
      tuple = stateTuple(state);
      if (typeof state.repository !== 'string' || state.prNumber !== prNumber) {
        throw new D1Stage0StorageError('pr_state_invalid');
      }
    } catch (error) {
      if (error instanceof D1Stage0StorageError) throw error;
      throw new D1Stage0StorageError('pr_state_invalid');
    }
    let json: string;
    try {
      json = JSON.stringify(state);
    } catch {
      throw new D1Stage0StorageError('pr_state_invalid');
    }
    if (new TextEncoder().encode(json).byteLength > MAX_PR_STATE_BYTES) {
      throw new D1Stage0StorageError('pr_state_too_large');
    }
    try {
      await db.prepare(
        'INSERT INTO pr_states (repository_id, pr_number, base_sha, head_sha, merge_sha, state_json, updated_at) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(repository_id, pr_number) DO UPDATE SET ' +
        'base_sha = excluded.base_sha, head_sha = excluded.head_sha, merge_sha = excluded.merge_sha, ' +
        'state_json = excluded.state_json, updated_at = excluded.updated_at',
      ).bind(
        repositoryId,
        prNumber,
        tuple.baseSha,
        tuple.headSha,
        tuple.mergeSha,
        json,
        new Date().toISOString(),
      ).run();
    } catch {
      throw new D1Stage0StorageError('database_error');
    }
  }

  async function getCheckRunMapping(
    repositoryId: number,
    prNumber: number,
    headShaInput: string,
  ): Promise<CheckRunMapping | null> {
    assertKey(repositoryId, prNumber);
    if (!REVISION_PATTERN.test(headShaInput)) throw new D1Stage0StorageError('check_run_mapping_invalid');
    try {
      const row = await db.prepare(
        'SELECT repository_id, pr_number, head_sha, check_run_id, updated_at FROM check_run_mappings ' +
        'WHERE repository_id = ? AND pr_number = ? AND head_sha = ?',
      ).bind(repositoryId, prNumber, headShaInput.toLowerCase()).first<{
        repository_id: number;
        pr_number: number;
        head_sha: string;
        check_run_id: number;
        updated_at: string;
      }>();
      if (!row) return null;
      return validateMapping({
        repositoryId: row.repository_id,
        prNumber: row.pr_number,
        headSha: row.head_sha,
        checkRunId: row.check_run_id,
        updatedAt: row.updated_at,
      });
    } catch (error) {
      if (error instanceof D1Stage0StorageError) throw error;
      throw new D1Stage0StorageError('database_error');
    }
  }

  async function saveCheckRunMapping(input: CheckRunMapping): Promise<void> {
    const mapping = validateMapping(input);
    try {
      await db.prepare(
        'INSERT INTO check_run_mappings (repository_id, pr_number, head_sha, check_run_id, updated_at) VALUES (?, ?, ?, ?, ?) ' +
        'ON CONFLICT(repository_id, pr_number, head_sha) DO UPDATE SET check_run_id = excluded.check_run_id, updated_at = excluded.updated_at',
      ).bind(
        mapping.repositoryId,
        mapping.prNumber,
        mapping.headSha,
        mapping.checkRunId,
        mapping.updatedAt,
      ).run();
    } catch {
      throw new D1Stage0StorageError('database_error');
    }
  }

  async function getReconciliationCursor(repositoryId: number): Promise<ReconciliationCursor> {
    assertKey(repositoryId, 0, true);
    try {
      const row = await db.prepare(
        'SELECT cursor_page, sweep_id, last_completed_at FROM reconciliation_state WHERE repository_id = ?',
      ).bind(repositoryId).first<{
        cursor_page: number;
        sweep_id: string | null;
        last_completed_at: string | null;
      }>();
      if (!row) return { page: 1, sweepId: null, lastCompletedAt: null };
      return validateCursor({ page: row.cursor_page, sweepId: row.sweep_id, lastCompletedAt: row.last_completed_at });
    } catch (error) {
      if (error instanceof D1Stage0StorageError) throw error;
      throw new D1Stage0StorageError('database_error');
    }
  }

  async function saveReconciliationCursor(repositoryId: number, input: ReconciliationCursor): Promise<void> {
    assertKey(repositoryId, 0, true);
    const cursor = validateCursor(input);
    try {
      await db.prepare(
        'INSERT INTO reconciliation_state (repository_id, cursor_page, sweep_id, last_completed_at, updated_at) VALUES (?, ?, ?, ?, ?) ' +
        'ON CONFLICT(repository_id) DO UPDATE SET cursor_page = excluded.cursor_page, sweep_id = excluded.sweep_id, ' +
        'last_completed_at = excluded.last_completed_at, updated_at = excluded.updated_at',
      ).bind(
        repositoryId,
        cursor.page,
        cursor.sweepId,
        cursor.lastCompletedAt,
        new Date().toISOString(),
      ).run();
    } catch {
      throw new D1Stage0StorageError('database_error');
    }
  }

  async function cleanupExpiredDeliveries(nowMs: number, limit: number): Promise<number> {
    if (!Number.isSafeInteger(nowMs) || nowMs < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
      throw new D1Stage0StorageError('configuration_invalid');
    }
    try {
      const result = await db.prepare(
        'DELETE FROM delivery_records WHERE delivery_id IN (' +
        'SELECT delivery_id FROM delivery_records WHERE expires_at <= ? ORDER BY expires_at ASC, delivery_id ASC LIMIT ?)',
      ).bind(nowMs, limit).run();
      return result.meta?.changes ?? 0;
    } catch {
      throw new D1Stage0StorageError('database_error');
    }
  }

  return Object.freeze({
    registerDelivery,
    createTaskRecord,
    createTaskRecordIfAbsent,
    loadTaskRecord,
    compareAndSaveTaskRecord,
    compareAndSaveTaskRecordUnderLease,
    claimTaskLease,
    releaseTaskLease,
    loadTaskLease,
    assertTaskLease,
    listTaskRecordsForReconciliation,
    getDeliveryStatus,
    setDeliveryStatus,
    claimLease,
    releaseLease,
    loadPrState,
    savePrState,
    getCheckRunMapping,
    saveCheckRunMapping,
    getReconciliationCursor,
    saveReconciliationCursor,
    cleanupExpiredDeliveries,
  });
}

void MAX_PR_STATE_BYTES;
