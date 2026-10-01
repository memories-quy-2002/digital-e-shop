import { applyD1Migrations, env, reset } from 'cloudflare:test';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { normalizePrSnapshot, normalizeRequiredCheckSnapshot } from '../../../pr-evidence.mjs';
import { createD1Stage0Storage } from '../src/storage/d1';
import { processStage0QueueMessage, type Stage0QueueMessage } from '../src/handlers/queue';

interface TestEnvironment {
  STAGE0_DB: D1Database;
  TEST_MIGRATIONS: Array<{ name: string; queries: string[] }>;
}

const testEnv = env as unknown as TestEnvironment;
const repository = 'memories-quy-2002/digital-e-shop';
const repositoryId = 123456;
const baseSha = 'a'.repeat(40);
const headSha = 'b'.repeat(40);
const mergeSha = 'c'.repeat(40);
const policyFingerprint = '1'.repeat(64);
const fixedNow = Date.UTC(2026, 9, 1, 0, 0, 0);

const policy = {
  schemaVersion: 1 as const,
  protectedPaths: { high: ['scripts/loop/**'], critical: [] },
  riskRules: {
    low: ['docs/**'],
    medium: ['client/src/**', 'server/src/**'],
    high: ['scripts/loop/**'],
    criticalActions: [
      'production_secret_access',
      'production_db_mutation',
      'branch_protection_bypass',
      'direct_push_main',
      'disable_security_checks',
      'production_deployment_promotion',
    ],
  },
  stopConditions: {
    maxIterations: 5,
    maxSameFailure: 2,
    maxFlakyRetries: 3,
    maxChangedFiles: 25,
    maxChangedLines: 1000,
    maxWallClockSeconds: 1800,
    tokenLimit: null,
    ciRunLimit: null,
  },
};

function createCollected(requiredStatus: 'complete' | 'incomplete' | 'unavailable' = 'complete') {
  const normalizedPrSnapshot = normalizePrSnapshot({
    repository,
    number: 264,
    state: 'open',
    draft: false,
    baseRef: 'main',
    baseSha,
    headRef: 'feature/stage0',
    headSha,
    mergeSha,
    headRepository: repository,
    updatedAt: '2026-10-01T00:00:00.000Z',
  });
  const prSnapshot = Object.freeze({
    ...normalizedPrSnapshot,
    repositoryId,
    baseRepositoryId: repositoryId,
    headRepositoryId: repositoryId,
    defaultBranch: 'main',
  });
  const normalized = normalizeRequiredCheckSnapshot({
    baseRef: 'main',
    policyFingerprint,
    requiredChecks: [],
    requiredWorkflows: [],
    collectionStatus: requiredStatus,
  });
  return {
    prSnapshot,
    requiredCheckSnapshot: {
      ...normalized,
      requiredChecks: [],
      requiredWorkflows: [],
    },
    policy,
    checkObservations: [],
    checkCollectionComplete: requiredStatus === 'complete',
    collectionStatus: requiredStatus,
    reasonCode: requiredStatus === 'complete' ? null : 'required_check_policy_unavailable',
    changedFiles: { collectionStatus: 'complete' as const, count: 1 },
    reviewSummary: {
      collectionStatus: 'complete' as const,
      reviewCount: 0,
      commentCount: 0,
      issueCommentCount: 0,
      counts: { approved: 0, changesRequested: 0, commented: 0, dismissed: 0, pending: 0, other: 0 },
    },
    workflowEvidence: [],
  };
}

function message(deliveryId: string): Stage0QueueMessage {
  return {
    deliveryId,
    event: 'pull_request',
    action: 'opened',
    repositoryId,
    prNumber: 264,
    receivedAt: '2026-10-01T00:00:00.000Z',
  };
}

function dependencies(options: {
  collection?: ReturnType<typeof createCollected>;
  collect?: () => Promise<ReturnType<typeof createCollected>>;
} = {}) {
  const d1 = createD1Stage0Storage(testEnv.STAGE0_DB);
  const collected = options.collection ?? createCollected();
  const observer = {
    collect: options.collect ?? vi.fn(async () => collected),
    refresh: vi.fn(async () => collected.prSnapshot),
    refreshPolicy: vi.fn(async () => collected.requiredCheckSnapshot),
  };
  const publisher = { publish: vi.fn(async () => ({ checkRunId: 5001 })) };
  return {
    repository,
    repositoryId,
    storage: d1,
    observer,
    publisher,
    now: () => fixedNow,
  };
}

beforeEach(async () => {
  await reset();
  await applyD1Migrations(testEnv.STAGE0_DB, testEnv.TEST_MIGRATIONS);
});

describe('Stage 0 Queue consumer', () => {
  it('records Phase 2A state, publishes an observation, and acknowledges duplicate deliveries idempotently', async () => {
    const deps = dependencies();

    const first = await processStage0QueueMessage(message('delivery-1'), deps);
    const duplicate = await processStage0QueueMessage(message('delivery-1'), deps);

    expect(first).toMatchObject({ status: 'processed', action: 'ready-for-human' });
    expect(duplicate).toEqual({ status: 'duplicate' });
    expect(deps.publisher.publish).toHaveBeenCalledTimes(1);
    expect(await deps.storage.getDeliveryStatus('delivery-1')).toBe('processed');
    expect(await deps.storage.loadPrState(repositoryId, 264)).toMatchObject({
      schemaVersion: 3,
      repository,
      prNumber: 264,
      headSha,
      baseSha,
      mergeSha,
    });
  });

  it('does not publish when required-check policy collection is incomplete', async () => {
    const deps = dependencies({ collection: createCollected('unavailable') });

    const result = await processStage0QueueMessage(message('delivery-policy-missing'), deps);

    expect(result).toMatchObject({ status: 'processed', action: 'wait', reasonCode: 'required_check_policy_unavailable' });
    expect(deps.publisher.publish).not.toHaveBeenCalled();
    expect(await deps.storage.getDeliveryStatus('delivery-policy-missing')).toBe('processed');
  });

  it('does not replace invalid persisted PR state with a fresh state', async () => {
    await testEnv.STAGE0_DB.prepare(
      'INSERT INTO pr_states (repository_id, pr_number, base_sha, head_sha, merge_sha, state_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      repositoryId,
      264,
      baseSha,
      headSha,
      mergeSha,
      '{"schemaVersion":3}',
      '2026-10-01T00:00:00.000Z',
    ).run();
    const deps = dependencies();

    await expect(processStage0QueueMessage(message('delivery-corrupt-state'), deps)).rejects.toMatchObject({
      code: 'pr_state_corrupt',
    });
    expect(deps.publisher.publish).not.toHaveBeenCalled();
    expect(await deps.storage.getDeliveryStatus('delivery-corrupt-state')).toBe('retry');
  });

  it('resumes a retry after the decision state was stored but report publication failed', async () => {
    const deps = dependencies();
    vi.mocked(deps.publisher.publish)
      .mockRejectedValueOnce(new Error('private GitHub response'))
      .mockResolvedValueOnce({ checkRunId: 5002 });

    await expect(processStage0QueueMessage(message('delivery-resume'), deps)).rejects.toMatchObject({
      code: 'report_failed',
    });
    expect(await deps.storage.getDeliveryStatus('delivery-resume')).toBe('retry');
    expect(await deps.storage.loadPrState(repositoryId, 264)).toMatchObject({
      schemaVersion: 3,
      headSha,
      baseSha,
      mergeSha,
    });

    await expect(processStage0QueueMessage(message('delivery-resume'), deps)).resolves.toMatchObject({
      status: 'processed',
    });
    expect(deps.publisher.publish).toHaveBeenCalledTimes(2);
    expect(await deps.storage.getDeliveryStatus('delivery-resume')).toBe('processed');
  });

  it('fails closed when D1 cannot register a delivery', async () => {
    const deps = dependencies();
    const failingStorage = {
      ...deps.storage,
      registerDelivery: vi.fn(async () => { throw new Error('sensitive D1 failure'); }),
    };

    await expect(processStage0QueueMessage(message('delivery-d1-failure'), {
      ...deps,
      storage: failingStorage,
    })).rejects.toThrow('sensitive D1 failure');
    expect(deps.observer.collect).not.toHaveBeenCalled();
    expect(deps.publisher.publish).not.toHaveBeenCalled();
  });

  it('does not let concurrent messages publish for the same PR tuple', async () => {
    let releaseCollection!: () => void;
    let notifyCollectionStarted!: () => void;
    const blocked = new Promise<void>((resolve) => { releaseCollection = resolve; });
    const collectionStarted = new Promise<void>((resolve) => { notifyCollectionStarted = resolve; });
    const deps = dependencies({
      collect: async () => {
        notifyCollectionStarted();
        await blocked;
        return createCollected();
      },
    });

    const first = processStage0QueueMessage(message('delivery-concurrent-a'), deps);
    await collectionStarted;
    const second = processStage0QueueMessage(message('delivery-concurrent-b'), deps);
    await expect(second).rejects.toMatchObject({ code: 'lease_busy' });
    releaseCollection();
    await expect(first).resolves.toMatchObject({ status: 'processed' });
    expect(deps.publisher.publish).toHaveBeenCalledTimes(1);
  });
});
