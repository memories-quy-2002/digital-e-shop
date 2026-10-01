import { validatePrBabysitterState } from '../../../../pr-state-contract.mjs';

const REVISION_PATTERN = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i;
const DELIVERY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const STABLE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/;
const MAX_PR_STATE_BYTES = 256 * 1024;

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
