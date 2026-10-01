import { applyD1Migrations, env, reset } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import { createPrBabysitterState } from '../../../pr-state-contract.mjs';
import { createD1Stage0Storage } from '../src/storage/d1';

interface TestEnvironment {
  STAGE0_DB: D1Database;
  TEST_MIGRATIONS: Array<{ name: string; queries: string[] }>;
}

const testEnv = env as unknown as TestEnvironment;
const repositoryId = 123456;

async function storage() {
  return createD1Stage0Storage(testEnv.STAGE0_DB);
}

beforeEach(async () => {
  await reset();
  await applyD1Migrations(testEnv.STAGE0_DB, testEnv.TEST_MIGRATIONS);
});

describe('D1 Stage 0 storage', () => {
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
