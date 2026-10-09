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
    highRiskActions: ['stage1_required_check_recovery'],
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

    const error = await processStage0QueueMessage(message('delivery-d1-failure'), {
      ...deps,
      storage: failingStorage,
    }).catch((value: unknown) => value);
    expect(error).toMatchObject({ code: 'stage0_register_delivery_failed', stage: 'register_delivery' });
    expect((error as Error).message).not.toContain('sensitive D1 failure');
    expect(deps.observer.collect).not.toHaveBeenCalled();
    expect(deps.publisher.publish).not.toHaveBeenCalled();
  });

  it('does not overwrite a duplicate delivery when its status lookup fails', async () => {
    const deps = dependencies();
    await processStage0QueueMessage(message('delivery-duplicate-status'), deps);
    const setStatus = vi.fn(deps.storage.setDeliveryStatus);
    const storage = {
      ...deps.storage,
      getDeliveryStatus: vi.fn(async () => { throw new Error('status lookup unavailable'); }),
      setDeliveryStatus: setStatus,
    };

    const error = await processStage0QueueMessage(message('delivery-duplicate-status'), { ...deps, storage })
      .catch((value: unknown) => value);

    expect(error).toMatchObject({ code: 'stage0_register_delivery_failed', stage: 'register_delivery' });
    expect(setStatus).not.toHaveBeenCalled();
    expect(await deps.storage.getDeliveryStatus('delivery-duplicate-status')).toBe('processed');
  });

  it('keeps observer failure diagnostics bounded when retry status recording also fails', async () => {
    const deps = dependencies();
    const secret = 'hostile-diagnostic-sentinel';
    const hostile = Object.assign(new Error(secret), {
      code: 'plausible_but_unrecognized_code',
      cause: new Error('hostile-cause-sentinel'),
    });
    vi.mocked(deps.observer.collect).mockRejectedValueOnce(hostile);
    const setStatus = vi.fn(async (_id: string, status: 'processed' | 'retry', reason?: string | null) => {
      if (status === 'retry') throw new Error('status-write-sentinel');
      return await deps.storage.setDeliveryStatus(_id, status, reason);
    });
    const release = vi.fn(deps.storage.releaseLease);
    const storage = { ...deps.storage, setDeliveryStatus: setStatus, releaseLease: release };

    const error = await processStage0QueueMessage(message('delivery-hostile'), { ...deps, storage }).catch((value: unknown) => value);

    expect(error).toMatchObject({ code: 'stage0_observe_failed', stage: 'observe' });
    const diagnostic = error as { code: string; stage: string; message: string };
    expect(JSON.stringify(diagnostic)).not.toContain(secret);
    expect(await deps.storage.getDeliveryStatus('delivery-hostile')).toBe('received');
    expect(setStatus).toHaveBeenCalledWith('delivery-hostile', 'retry', 'stage0_observe_failed');
    expect(release).toHaveBeenCalledOnce();
  });

  it.each([
    'register_delivery', 'claim_lease', 'observe', 'normalize_snapshot', 'load_state', 'reconcile_state',
    'save_state', 'decide', 'load_report_mapping', 'publish_report', 'save_report_mapping', 'mark_processed',
  ] as const)('records bounded diagnostics and preserves retry semantics at %s', async (stage) => {
    const deps = dependencies();
    const secret = `secret-${stage}`;
    const failure = Object.assign(new Error(secret), { code: `untrusted_${stage}_failure` });
    const release = vi.fn(deps.storage.releaseLease);
    const storage = { ...deps.storage, releaseLease: release };
    const collected = createCollected();
    const observer = { ...deps.observer };
    const publisher = { ...deps.publisher };

    if (stage === 'register_delivery') storage.registerDelivery = vi.fn(async () => { throw failure; });
    if (stage === 'claim_lease') storage.claimLease = vi.fn(async () => { throw failure; });
    if (stage === 'observe') observer.collect = vi.fn(async () => { throw failure; });
    if (stage === 'normalize_snapshot') observer.collect = vi.fn(async () => ({
      ...collected,
      prSnapshot: { ...collected.prSnapshot, headSha: 'invalid' },
    }));
    if (stage === 'load_state') storage.loadPrState = vi.fn(async () => { throw failure; });
    if (stage === 'reconcile_state') {
      collected.checkObservations = [{ hostile: secret }] as unknown as never[];
      observer.collect = vi.fn(async () => collected);
    }
    if (stage === 'save_state') storage.savePrState = vi.fn(async () => { throw failure; });
    if (stage === 'decide') {
      collected.requiredCheckSnapshot = { ...collected.requiredCheckSnapshot, requiredWorkflows: null } as never;
      observer.collect = vi.fn(async () => collected);
    }
    if (stage === 'load_report_mapping') storage.getCheckRunMapping = vi.fn(async () => { throw failure; });
    if (stage === 'publish_report') publisher.publish = vi.fn(async () => { throw failure; });
    if (stage === 'save_report_mapping') storage.saveCheckRunMapping = vi.fn(async () => { throw failure; });
    if (stage === 'mark_processed') {
      const setStatus = deps.storage.setDeliveryStatus;
      let processedFailureUsed = false;
      storage.setDeliveryStatus = vi.fn(async (id, status, reason) => {
        if (status === 'processed' && !processedFailureUsed) {
          processedFailureUsed = true;
          throw failure;
        }
        return setStatus(id, status, reason);
      });
    }

    const error = await processStage0QueueMessage(message(`delivery-${stage}`), {
      ...deps, storage, observer, publisher,
    }).catch((value: unknown) => value);

    const expectedCode = stage === 'publish_report' || stage === 'save_report_mapping'
      ? 'report_failed' : `stage0_${stage}_failed`;
    expect(error).toMatchObject({ code: expectedCode, stage });
    const diagnostic = error as { code: string; stage: string; message: string };
    expect(JSON.stringify(diagnostic)).not.toContain(secret);
    if (stage === 'register_delivery') {
      expect(await deps.storage.getDeliveryStatus(`delivery-${stage}`)).toBeNull();
    } else {
      expect(await deps.storage.getDeliveryStatus(`delivery-${stage}`)).toBe('retry');
      const row = await testEnv.STAGE0_DB.prepare('SELECT reason_code FROM delivery_records WHERE delivery_id = ?')
        .bind(`delivery-${stage}`).first<{ reason_code: string | null }>();
      expect(row?.reason_code).toBe(expectedCode);
    }
    expect(release).toHaveBeenCalledTimes(stage === 'claim_lease' ? 0 : stage === 'register_delivery' ? 0 : 1);
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
