import { applyD1Migrations, env, reset } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import { createPrBabysitterState } from '../../../pr-state-contract.mjs';
import { validateTaskRecord } from '../../../tasks/contracts.mjs';
import { createD1Stage0Storage } from '../src/storage/d1';

interface TestEnvironment {
  STAGE0_DB: D1Database;
  TEST_MIGRATIONS: Array<{ name: string; queries: string[] }>;
}

const testEnv = env as unknown as TestEnvironment;
const repositoryId = 123456;

function taskRecord(overrides: Record<string, unknown> = {}) {
  return validateTaskRecord({
    schemaVersion: 2,
    key: { repositoryId, issueNumber: 42, generation: 1 },
    taskId: `repo-${repositoryId}-issue-42-g1`,
    requestDigest: 'a'.repeat(64),
    acceptanceIds: ['behavior', 'verification'],
    sourceRevision: 'b'.repeat(40),
    policyRevision: 'c'.repeat(40),
    state: 'queued',
    version: 1,
    attempt: 0,
    epoch: 0,
    deadline: '2026-10-14T00:00:00.000Z',
    budgets: { modelCalls: 0, repairs: 0, deliveries: 0, lastModelTokenUsed: null },
    links: { loopStateTaskId: `repo-${repositoryId}-issue-42-g1`, pr: null },
    outcomeReason: null,
    confirmedMergeSha: null,
    ...overrides,
  });
}

async function storage() {
  return createD1Stage0Storage(testEnv.STAGE0_DB);
}

beforeEach(async () => {
  await reset();
  await applyD1Migrations(testEnv.STAGE0_DB, testEnv.TEST_MIGRATIONS);
});

describe('D1 Stage 0 storage', () => {
  it('enforces one task per repository even when another task lease has expired but termination is unknown', async () => {
    const d1 = await storage();
    const first = taskRecord();
    const second = taskRecord({ taskId: `repo-${repositoryId}-issue-43-g1`, key: { repositoryId, issueNumber: 43, generation: 1 },
      links: { loopStateTaskId: `repo-${repositoryId}-issue-43-g1`, pr: null } });
    await d1.createTaskRecord(first);
    await d1.createTaskRecord(second);
    const now = Date.now();
    expect(await d1.claimTaskLease(first.taskId, 'runner-a', now, 10, 1)).toBe(true);
    expect(await d1.claimTaskLease(second.taskId, 'runner-b', now + 20, 10, 1)).toBe(false);
    await d1.releaseTaskLease(first.taskId, 'runner-a');
    expect(await d1.claimTaskLease(second.taskId, 'runner-b', now + 20, 10, 1)).toBe(true);
  });
  it('lists only bounded nonterminal task records without live execution leases for reconciliation', async () => {
    const d1 = await storage();
    const task = taskRecord();
    await d1.createTaskRecord(task);
    const now = Date.now();
    expect(await d1.listTaskRecordsForReconciliation(repositoryId, now, 10)).toEqual([task]);
    await d1.claimTaskLease(task.taskId, 'runner-a', now, 5000, 1);
    expect(await d1.listTaskRecordsForReconciliation(repositoryId, now, 10)).toEqual([]);
    expect(await d1.listTaskRecordsForReconciliation(repositoryId, now + 5000, 10)).toEqual([task]);
  });
  it('binds task CAS updates to the live lease owner and advances the lease version atomically', async () => {
    const d1 = await storage();
    const task = taskRecord();
    await d1.createTaskRecord(task);
    const now = Date.now();
    await d1.claimTaskLease(task.taskId, 'runner-a', now, 5000, 1);
    expect(await d1.assertTaskLease(task.taskId, 'runner-a', now, 1)).toBe(true);
    expect(await d1.assertTaskLease(task.taskId, 'runner-a', now + 5000, 1)).toBe(false);
    expect(await d1.assertTaskLease(task.taskId, 'runner-b', now, 1)).toBe(false);
    const next = taskRecord({ state: 'planning', version: 2 });
    expect(await d1.compareAndSaveTaskRecordUnderLease(next, 1, 'runner-b', now)).toBe('stale');
    expect(await d1.compareAndSaveTaskRecordUnderLease(next, 1, 'runner-a', now + 5000)).toBe('stale');
    expect(await d1.compareAndSaveTaskRecordUnderLease(next, 1, 'runner-a', now)).toBe('saved');
    expect(await d1.compareAndSaveTaskRecordUnderLease(taskRecord({ state: 'executing', version: 3 }), 2, 'runner-a', now)).toBe('saved');
    expect((await d1.loadTaskRecord(task.taskId)).version).toBe(3);
    expect((await d1.loadTaskLease(task.taskId))?.taskVersion).toBe(3);
  });
  it('persists validated TaskRecords and applies optimistic version updates exactly once', async () => {
    const d1 = await storage();
    const initial = taskRecord();

    expect(await d1.createTaskRecord(initial)).toBe('created');
    expect(await d1.loadTaskRecord(initial.taskId)).toEqual(initial);
    await expect(d1.createTaskRecord(initial)).rejects.toMatchObject({ code: 'task_conflict' });

    const next = taskRecord({ state: 'planning', version: 2 });
    expect(await d1.compareAndSaveTaskRecord(next, 1)).toBe('saved');
    expect(await d1.compareAndSaveTaskRecord(taskRecord({ state: 'executing', version: 2 }), 1)).toBe('stale');
    expect(await d1.loadTaskRecord(initial.taskId)).toEqual(next);
  });

  it('creates an Issue task once and refuses duplicate keys with changed request or policy identity', async () => {
    const d1 = await storage();
    const initial = taskRecord();
    expect(await d1.createTaskRecordIfAbsent(initial)).toBe('created');
    expect(await d1.createTaskRecordIfAbsent(initial)).toBe('duplicate');
    await expect(d1.createTaskRecordIfAbsent(taskRecord({ requestDigest: 'b'.repeat(64) })))
      .rejects.toMatchObject({ code: 'task_conflict' });
    await expect(d1.createTaskRecordIfAbsent(taskRecord({ policyRevision: 'd'.repeat(40) })))
      .rejects.toMatchObject({ code: 'task_conflict' });
    expect(await d1.loadTaskRecord(initial.taskId)).toEqual(initial);
  });

  it('refuses corrupt TaskRecords and immutable task identity changes', async () => {
    const d1 = await storage();
    const initial = taskRecord();
    await expect(d1.createTaskRecord({ ...initial, taskId: '../unsafe' })).rejects.toMatchObject({
      code: 'task_record_invalid',
    });
    await d1.createTaskRecord(initial);

    const changedIdentity = taskRecord({
      requestDigest: 'd'.repeat(64),
      version: 2,
      state: 'planning',
    });
    await expect(d1.compareAndSaveTaskRecord(changedIdentity, 1)).rejects.toMatchObject({
      code: 'task_record_invalid',
    });
  });

  it('serializes task leases, rejects stale task versions, and allows only the owner to release', async () => {
    const d1 = await storage();
    const task = taskRecord();
    await d1.createTaskRecord(task);
    const now = Date.now();

    expect(await d1.claimTaskLease(task.taskId, 'runner-a', now, 5_000, task.version)).toBe(true);
    expect(await d1.claimTaskLease(task.taskId, 'runner-b', now, 5_000, task.version)).toBe(false);
    expect(await d1.releaseTaskLease(task.taskId, 'runner-b')).toBe(false);
    expect(await d1.claimTaskLease(task.taskId, 'runner-b', now + 5_001, 5_000, task.version)).toBe(true);
    expect(await d1.releaseTaskLease(task.taskId, 'runner-a')).toBe(false);
    expect(await d1.releaseTaskLease(task.taskId, 'runner-b')).toBe(true);
    expect(await d1.claimTaskLease(task.taskId, 'runner-c', now + 6_000, 5_000, task.version + 1)).toBe(false);
  });

  it('deduplicates delivery IDs and refuses an ID reused for different routing metadata', async () => {
    const d1 = await storage();
    const input = {
      deliveryId: 'delivery-123',
      repositoryId,
      prNumber: 264,
      event: 'pull_request',
      action: 'synchronize',
      receivedAt: '2026-10-01T00:00:00.000Z',
      expiresAt: Date.now() + 60_000,
    };

    expect(await d1.registerDelivery(input)).toBe('new');
    expect(await d1.registerDelivery(input)).toBe('duplicate');
    await expect(d1.registerDelivery({ ...input, prNumber: 265 })).rejects.toMatchObject({
      code: 'delivery_id_conflict',
    });
  });

  it('serializes PR processing leases and allows an expired lease to be reclaimed', async () => {
    const d1 = await storage();
    const now = Date.now();

    expect(await d1.claimLease(repositoryId, 264, 'owner-a', now, 5_000)).toBe(true);
    expect(await d1.claimLease(repositoryId, 264, 'owner-b', now, 5_000)).toBe(false);
    expect(await d1.claimLease(repositoryId, 264, 'owner-b', now + 5_001, 5_000)).toBe(true);
    expect(await d1.releaseLease(repositoryId, 264, 'owner-a')).toBe(false);
    expect(await d1.releaseLease(repositoryId, 264, 'owner-b')).toBe(true);
  });

  it('persists bounded, tuple-scoped Phase 2A state and refuses corrupt or oversized state', async () => {
    const d1 = await storage();
    const state = createPrBabysitterState({
      repository: 'memories-quy-2002/digital-e-shop',
      number: 264,
      state: 'open',
      draft: false,
      baseRef: 'main',
      baseSha: 'a'.repeat(40),
      headRef: 'feature/stage0',
      headSha: 'b'.repeat(40),
      mergeSha: 'c'.repeat(40),
      headRepository: 'memories-quy-2002/digital-e-shop',
      updatedAt: '2026-10-01T00:00:00.000Z',
    });

    await d1.savePrState(repositoryId, 264, state);
    expect(await d1.loadPrState(repositoryId, 264)).toEqual(state);
    const largeState = structuredClone(state);
    largeState.observedAttemptKeys = Array.from(
      { length: 3000 },
      (_, index) => 'attempt-' + index + '-' + 'x'.repeat(100),
    );
    largeState.telemetry.observationsRecorded = largeState.observedAttemptKeys.length;
    await expect(d1.savePrState(repositoryId, 264, largeState)).rejects.toMatchObject({
      code: 'pr_state_too_large',
    });
  });

  it('upserts one report Check Run mapping per repository, PR, and head SHA', async () => {
    const d1 = await storage();
    const original = {
      repositoryId,
      prNumber: 264,
      headSha: 'b'.repeat(40),
      checkRunId: 7001,
      updatedAt: '2026-10-01T00:00:00.000Z',
    };
    await d1.saveCheckRunMapping(original);

    expect(await d1.getCheckRunMapping(repositoryId, 264, original.headSha)).toEqual(original);
    await d1.saveCheckRunMapping({ ...original, checkRunId: 7002 });
    expect(await d1.getCheckRunMapping(repositoryId, 264, original.headSha)).toEqual({
      ...original,
      checkRunId: 7002,
    });
    expect(await d1.getCheckRunMapping(repositoryId, 264, 'd'.repeat(40))).toBeNull();
  });

  it('resumes a bounded reconciliation cursor and clears only expired delivery rows', async () => {
    const d1 = await storage();
    const initial = await d1.getReconciliationCursor(repositoryId);
    expect(initial).toEqual({ page: 1, sweepId: null, lastCompletedAt: null });

    await d1.saveReconciliationCursor(repositoryId, {
      page: 2,
      sweepId: 'sweep-20261001',
      lastCompletedAt: null,
    });
    expect(await d1.getReconciliationCursor(repositoryId)).toEqual({
      page: 2,
      sweepId: 'sweep-20261001',
      lastCompletedAt: null,
    });
    await d1.saveReconciliationCursor(repositoryId, {
      page: 1,
      sweepId: null,
      lastCompletedAt: '2026-10-01T00:15:00.000Z',
    });
    expect(await d1.getReconciliationCursor(repositoryId)).toEqual({
      page: 1,
      sweepId: null,
      lastCompletedAt: '2026-10-01T00:15:00.000Z',
    });

    const input = {
      deliveryId: 'expired-delivery',
      repositoryId,
      prNumber: 264,
      event: 'pull_request',
      action: 'synchronize',
      receivedAt: '2026-09-30T00:00:00.000Z',
      expiresAt: 10,
    };
    await d1.registerDelivery(input);
    expect(await d1.cleanupExpiredDeliveries(11, 10)).toBe(1);
    expect(await d1.getDeliveryStatus(input.deliveryId)).toBeNull();
  });
});
