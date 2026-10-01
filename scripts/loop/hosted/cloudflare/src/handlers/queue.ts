import {
  buildFailureEvidence,
  normalizeCheckObservation,
  normalizePrSnapshot,
} from '../../../../pr-evidence.mjs';
import { classifyFailure } from '../../../../classify-failure.mjs';
import { decidePrAction } from '../../../../pr-babysitter.mjs';
import {
  createPrBabysitterState,
  reconcilePrBabysitterState,
  recordActionableFailure,
  recordCheckObservation,
} from '../../../../pr-state-contract.mjs';
import type { Env } from '../index';
import { createGitHubObserverRuntime, type Stage0Observation, type Stage0PrSnapshot } from '../github/observer';
import { createGitHubReportClient } from '../github/report-client';
import { STAGE0_LIMITS } from '../limits';
import { createD1Stage0Storage } from '../storage/d1';

const DELIVERY_RETENTION_MS = 48 * 60 * 60 * 1000;
const PR_PROCESSING_LEASE_MS = 12 * 60 * 1000;
const DELIVERY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export interface Stage0QueueMessage {
  deliveryId: string;
  event: string;
  action: string | null;
  repositoryId: number;
  prNumber: number;
  receivedAt: string;
}

interface QueueStorage {
  registerDelivery(input: {
    deliveryId: string;
    repositoryId: number;
    prNumber: number;
    event: string;
    action: string | null;
    receivedAt: string;
    expiresAt: number;
  }): Promise<'new' | 'duplicate'>;
  getDeliveryStatus(deliveryId: string): Promise<'received' | 'processed' | 'retry' | null>;
  setDeliveryStatus(deliveryId: string, status: 'processed' | 'retry', reasonCode?: string | null): Promise<void>;
  claimLease(repositoryId: number, prNumber: number, owner: string, nowMs: number, leaseMs: number): Promise<boolean>;
  releaseLease(repositoryId: number, prNumber: number, owner: string): Promise<boolean>;
  loadPrState(repositoryId: number, prNumber: number): Promise<Record<string, unknown> | null>;
  savePrState(repositoryId: number, prNumber: number, state: unknown): Promise<void>;
  getCheckRunMapping(repositoryId: number, prNumber: number, headSha: string): Promise<{
    repositoryId: number;
    prNumber: number;
    headSha: string;
    checkRunId: number;
    updatedAt: string;
  } | null>;
  saveCheckRunMapping(mapping: {
    repositoryId: number;
    prNumber: number;
    headSha: string;
    checkRunId: number;
    updatedAt: string;
  }): Promise<void>;
}

interface QueueObserver {
  collect(prNumber: number): Promise<Stage0Observation>;
  refresh(prNumber: number): Promise<Stage0PrSnapshot>;
  refreshPolicy(snapshot: Stage0PrSnapshot): Promise<Stage0Observation['requiredCheckSnapshot']>;
}

interface ReportPublicationInput {
  snapshot: Stage0PrSnapshot;
  decision: {
    action: string;
    reasonCode: string;
    headSha: string;
    baseSha: string;
    mergeSha: string | null;
    requiredCheckPolicyFingerprint: string;
  };
  requiredCheckSnapshot: Stage0Observation['requiredCheckSnapshot'];
  existingCheckRunId: number | null;
  refresh: () => Promise<{
    snapshot: Stage0PrSnapshot;
    requiredCheckSnapshot: Stage0Observation['requiredCheckSnapshot'];
  }>;
}

interface QueuePublisher {
  publish(input: ReportPublicationInput): Promise<{ checkRunId: number }>;
}

export class Stage0QueueError extends Error {
  readonly code:
    | 'invalid_queue_message'
    | 'queue_repository_mismatch'
    | 'lease_busy'
    | 'canonical_base_policy_unavailable'
    | 'observation_failed'
    | 'report_failed';

  constructor(code: Stage0QueueError['code']) {
    super(code);
    this.name = 'Stage0QueueError';
    this.code = code;
  }
}

function exactQueueMessage(value: unknown): value is Stage0QueueMessage {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.join('|') !== ['action', 'deliveryId', 'event', 'prNumber', 'receivedAt', 'repositoryId'].sort().join('|')) {
    return false;
  }
  return typeof record.deliveryId === 'string' && DELIVERY_ID_PATTERN.test(record.deliveryId)
    && typeof record.event === 'string' && record.event.length > 0 && record.event.length <= 50
    && (record.action === null || (typeof record.action === 'string' && record.action.length > 0 && record.action.length <= 50))
    && Number.isSafeInteger(record.repositoryId) && (record.repositoryId as number) > 0
    && Number.isSafeInteger(record.prNumber) && (record.prNumber as number) > 0
    && typeof record.receivedAt === 'string' && Number.isFinite(Date.parse(record.receivedAt))
    && new Date(record.receivedAt).toISOString() === record.receivedAt;
}

function prDecisionSnapshot(snapshot: Stage0PrSnapshot) {
  return normalizePrSnapshot({
    repository: snapshot.repository,
    number: snapshot.number,
    state: snapshot.state,
    draft: snapshot.draft,
    baseRef: snapshot.baseRef,
    baseSha: snapshot.baseSha,
    headRef: snapshot.headRef,
    headSha: snapshot.headSha,
    mergeSha: snapshot.mergeSha,
    headRepository: snapshot.headRepository,
    updatedAt: snapshot.updatedAt,
  });
}

function decisionRequiredSnapshot(snapshot: Stage0Observation['requiredCheckSnapshot']) {
  return {
    baseRef: snapshot.baseRef,
    policyFingerprint: snapshot.policyFingerprint,
    requiredCheckKeys: snapshot.requiredCheckKeys,
    requiredWorkflowKeys: snapshot.requiredWorkflowKeys,
    requiredWorkflows: snapshot.requiredWorkflows.map(({ repositoryId, path, ref, sha }) => ({
      repositoryId,
      path,
      ref,
      sha,
    })),
    collectionStatus: snapshot.collectionStatus,
  };
}

function recordCurrentObservations(
  state: Record<string, unknown>,
  decisionSnapshot: ReturnType<typeof prDecisionSnapshot>,
  currentSnapshot: Stage0PrSnapshot,
  observations: Record<string, unknown>[],
) {
  let next = reconcilePrBabysitterState(state, decisionSnapshot);
  for (const input of observations) {
    const observation = normalizeCheckObservation(input);
    next = recordCheckObservation(next, observation);
    const failure = buildFailureEvidence(observation, {
      currentHeadSha: currentSnapshot.headSha,
      currentBaseSha: currentSnapshot.baseSha,
      currentMergeSha: currentSnapshot.mergeSha,
    });
    if (failure?.status !== 'actionable') continue;
    classifyFailure(failure.evidence);
    next = recordActionableFailure(next, {
      headSha: observation.headSha,
      baseSha: observation.baseSha,
      mergeSha: observation.mergeSha,
      attemptKey: observation.attemptKey,
      failureFingerprint: observation.failureFingerprint,
    });
  }
  return next;
}

function safeFailureReason(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error
      && typeof error.code === 'string' && /^[a-z][a-z0-9_]{0,80}$/.test(error.code)) return error.code;
  return 'stage0_queue_processing_failed';
}

export async function processStage0QueueMessage(
  input: unknown,
  dependencies: {
    repository: string;
    repositoryId: number;
    storage: QueueStorage;
    observer: QueueObserver;
    publisher: QueuePublisher;
    now?: () => number;
  },
): Promise<{ status: 'processed' | 'duplicate'; action?: string; reasonCode?: string }> {
  if (!exactQueueMessage(input)) throw new Stage0QueueError('invalid_queue_message');
  if (input.repositoryId !== dependencies.repositoryId) throw new Stage0QueueError('queue_repository_mismatch');
  const now = dependencies.now ?? Date.now;
  const nowMs = now();
  if (!Number.isSafeInteger(nowMs) || nowMs < 1) throw new Stage0QueueError('observation_failed');

  const registered = await dependencies.storage.registerDelivery({
    ...input,
    expiresAt: nowMs + DELIVERY_RETENTION_MS,
  });
  if (registered === 'duplicate' && await dependencies.storage.getDeliveryStatus(input.deliveryId) === 'processed') {
    return { status: 'duplicate' };
  }

  const leaseOwner = crypto.randomUUID().replaceAll('-', '');
  const leaseAcquired = await dependencies.storage.claimLease(
    input.repositoryId,
    input.prNumber,
    leaseOwner,
    nowMs,
    PR_PROCESSING_LEASE_MS,
  );
  if (!leaseAcquired) {
    await dependencies.storage.setDeliveryStatus(input.deliveryId, 'retry', 'lease_busy').catch(() => undefined);
    throw new Stage0QueueError('lease_busy');
  }

  try {
    const collected = await dependencies.observer.collect(input.prNumber);
    const snapshot = prDecisionSnapshot(collected.prSnapshot);
    if (collected.prSnapshot.repository.toLowerCase() !== dependencies.repository.toLowerCase()
        || collected.prSnapshot.repositoryId !== dependencies.repositoryId
        || collected.prSnapshot.number !== input.prNumber) {
      throw new Stage0QueueError('queue_repository_mismatch');
    }
    const existingState = await dependencies.storage.loadPrState(input.repositoryId, input.prNumber);
    let prState = existingState ?? createPrBabysitterState(snapshot);
    prState = recordCurrentObservations(prState, snapshot, collected.prSnapshot, collected.checkObservations);
    await dependencies.storage.savePrState(input.repositoryId, input.prNumber, prState);

    let decision: ReportPublicationInput['decision'];
    if (!collected.policy) {
      decision = {
        action: 'wait',
        reasonCode: 'canonical_base_policy_unavailable',
        headSha: snapshot.headSha,
        baseSha: snapshot.baseSha,
        mergeSha: snapshot.mergeSha,
        requiredCheckPolicyFingerprint: collected.requiredCheckSnapshot.policyFingerprint,
      };
    } else {
      const result = decidePrAction({
        prSnapshot: snapshot,
        requiredCheckSnapshot: decisionRequiredSnapshot(collected.requiredCheckSnapshot),
        checkObservations: collected.checkObservations,
        checkCollectionComplete: collected.checkCollectionComplete,
        prState,
        policy: collected.policy,
      });
      decision = {
        action: result.action,
        reasonCode: result.reasonCode,
        headSha: result.headSha,
        baseSha: result.baseSha,
        mergeSha: result.mergeSha,
        requiredCheckPolicyFingerprint: result.requiredCheckPolicyFingerprint,
      };
    }

    if (collected.requiredCheckSnapshot.collectionStatus === 'complete') {
      const mapping = await dependencies.storage.getCheckRunMapping(
        input.repositoryId,
        input.prNumber,
        snapshot.headSha,
      );
      try {
        const published = await dependencies.publisher.publish({
          snapshot: collected.prSnapshot,
          decision,
          requiredCheckSnapshot: collected.requiredCheckSnapshot,
          existingCheckRunId: mapping?.checkRunId ?? null,
          refresh: async () => {
            const refreshedSnapshot = await dependencies.observer.refresh(input.prNumber);
            const refreshedPolicy = await dependencies.observer.refreshPolicy(refreshedSnapshot);
            return { snapshot: refreshedSnapshot, requiredCheckSnapshot: refreshedPolicy };
          },
        });
        if (!Number.isSafeInteger(published.checkRunId) || published.checkRunId < 1) {
          throw new Stage0QueueError('report_failed');
        }
        await dependencies.storage.saveCheckRunMapping({
          repositoryId: input.repositoryId,
          prNumber: input.prNumber,
          headSha: snapshot.headSha,
          checkRunId: published.checkRunId,
          updatedAt: new Date(now()).toISOString(),
        });
      } catch (error) {
        if (error instanceof Stage0QueueError) throw error;
        throw new Stage0QueueError('report_failed');
      }
    }

    await dependencies.storage.setDeliveryStatus(input.deliveryId, 'processed', null);
    return { status: 'processed', action: decision.action, reasonCode: decision.reasonCode };
  } catch (error) {
    const reasonCode = safeFailureReason(error);
    await dependencies.storage.setDeliveryStatus(input.deliveryId, 'retry', reasonCode).catch(() => undefined);
    throw error;
  } finally {
    await dependencies.storage.releaseLease(input.repositoryId, input.prNumber, leaseOwner).catch(() => false);
  }
}

export async function handleQueue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
  if (!env.EVENT_QUEUE || !env.STAGE0_DB) {
    console.warn('stage0_queue_consumer_unavailable');
    for (const message of batch.messages) message.retry({ delaySeconds: 60 });
    return;
  }
  let runtime: ReturnType<typeof createGitHubObserverRuntime>;
  let storage: ReturnType<typeof createD1Stage0Storage>;
  let publisher: ReturnType<typeof createGitHubReportClient>;
  try {
    runtime = createGitHubObserverRuntime(env);
    storage = createD1Stage0Storage(env.STAGE0_DB);
    publisher = createGitHubReportClient({ configuration: runtime.configuration, auth: runtime.auth });
  } catch (error) {
    console.warn('stage0_queue_consumer_setup_failed', { reasonCode: safeFailureReason(error) });
    for (const message of batch.messages) message.retry({ delaySeconds: 60 });
    return;
  }
  for (const message of batch.messages.slice(0, STAGE0_LIMITS.maxQueueBatchSize)) {
    if (!exactQueueMessage(message.body)) {
      console.warn('stage0_queue_invalid_message');
      message.ack();
      continue;
    }
    try {
      await processStage0QueueMessage(message.body, {
        repository: runtime.configuration.repository,
        repositoryId: runtime.configuration.repositoryId,
        storage,
        observer: runtime.observer,
        publisher,
      });
      message.ack();
    } catch (error) {
      const reasonCode = safeFailureReason(error);
      console.warn('stage0_queue_message_retry', {
        repositoryId: message.body.repositoryId,
        prNumber: message.body.prNumber,
        attempt: message.attempts,
        reasonCode,
      });
      message.retry({ delaySeconds: Math.min(300, 15 * (2 ** Math.min(Math.max(message.attempts - 1, 0), 4))) });
    }
  }
  for (const message of batch.messages.slice(STAGE0_LIMITS.maxQueueBatchSize)) {
    message.retry({ delaySeconds: 60 });
  }
}
