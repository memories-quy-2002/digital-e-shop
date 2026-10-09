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

type QueueProcessingStage = 'register_delivery' | 'claim_lease' | 'observe' | 'normalize_snapshot'
  | 'load_state' | 'reconcile_state' | 'save_state' | 'decide' | 'load_report_mapping'
  | 'publish_report' | 'save_report_mapping' | 'mark_processed';

const RECOGNIZED_ERROR_CODES = new Set([
  'invalid_queue_message', 'queue_repository_mismatch', 'lease_busy', 'canonical_base_policy_unavailable',
  'observation_failed', 'report_failed', 'pr_snapshot_invalid', 'check_observation_invalid',
  'configuration_invalid', 'app_key_invalid', 'token_request_failed', 'token_request_unauthorized',
  'token_request_forbidden', 'token_request_not_found', 'token_request_unprocessable',
  'token_request_rate_limited', 'token_response_invalid', 'token_request_network_error',
  'token_request_timeout', 'token_request_redirect_rejected', 'request_limit_reached', 'network_error',
  'redirect_rejected', 'response_too_large', 'invalid_response', 'bad_request', 'unauthorized',
  'forbidden', 'not_found', 'rate_limited', 'unprocessable_entity', 'api_unavailable',
  'pagination_rejected', 'pagination_limit', 'delivery_id_conflict', 'delivery_not_found',
  'pr_state_invalid', 'pr_state_corrupt', 'pr_state_too_large', 'check_run_mapping_invalid',
  'reconciliation_cursor_invalid', 'database_error', 'report_configuration_invalid', 'report_input_invalid',
  'policy_incomplete', 'report_check_is_required', 'stale_pr_tuple', 'stale_required_check_policy',
  'lookup_incomplete', 'lookup_ambiguous', 'response_invalid', 'report_write_refused',
  'github_auth_configuration_invalid', 'github_auth_app_key_invalid', 'github_auth_token_request_failed',
  'github_auth_token_request_unauthorized', 'github_auth_token_request_forbidden',
  'github_auth_token_request_not_found', 'github_auth_token_request_unprocessable',
  'github_auth_token_request_rate_limited', 'github_auth_token_response_invalid',
  'github_auth_token_request_network_error', 'github_auth_token_request_timeout',
  'github_auth_token_request_redirect_rejected', 'github_api_configuration_invalid',
  'github_api_request_limit_reached', 'github_api_network_error', 'github_api_redirect_rejected',
  'github_api_response_too_large', 'github_api_invalid_response', 'github_api_bad_request',
  'github_api_unauthorized', 'github_api_forbidden', 'github_api_not_found', 'github_api_rate_limited',
  'github_api_unprocessable_entity', 'github_api_unavailable', 'github_api_pagination_rejected',
  'github_api_pagination_limit',
]);

class Stage0QueueDiagnosticError extends Error {
  readonly code: string;
  readonly stage: QueueProcessingStage;

  constructor(code: string, stage: QueueProcessingStage) {
    super(code);
    this.name = 'Stage0QueueDiagnosticError';
    this.code = code;
    this.stage = stage;
  }
}

function recognizedErrorCode(error: unknown): string | null {
  let code: unknown;
  try {
    if (typeof error !== 'object' || error === null || !('code' in error)) return null;
    code = error.code;
  } catch {
    return null;
  }
  if (typeof code !== 'string') return null;
  if (RECOGNIZED_ERROR_CODES.has(code)) return code;
  const match = /^token_request_http_(\d{3})$/.exec(code);
  if (match && Number(match[1]) >= 100 && Number(match[1]) <= 599) return code;
  const authMatch = /^github_auth_token_request_http_(\d{3})$/.exec(code);
  if (authMatch && Number(authMatch[1]) >= 100 && Number(authMatch[1]) <= 599) return code;
  return null;
}

function diagnosticError(error: unknown, stage: QueueProcessingStage): Stage0QueueDiagnosticError {
  if (error instanceof Stage0QueueDiagnosticError) return error;
  const code = recognizedErrorCode(error) ?? `stage0_${stage}_failed`;
  return new Stage0QueueDiagnosticError(code, stage);
}

function safeFailureReason(error: unknown): string {
  return recognizedErrorCode(error) ?? 'stage0_queue_consumer_setup_failed';
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
  const leaseOwner = crypto.randomUUID().replaceAll('-', '');
  let stage: QueueProcessingStage = 'register_delivery';
  let registered = false;
  let duplicateStatusUnknown = false;
  let leaseAcquired = false;
  try {
    const registration = await dependencies.storage.registerDelivery({
      ...input,
      expiresAt: nowMs + DELIVERY_RETENTION_MS,
    });
    registered = true;
    if (registration === 'duplicate') {
      stage = 'register_delivery';
      duplicateStatusUnknown = true;
      if (await dependencies.storage.getDeliveryStatus(input.deliveryId) === 'processed') return { status: 'duplicate' };
      duplicateStatusUnknown = false;
    }
    stage = 'claim_lease';
    leaseAcquired = await dependencies.storage.claimLease(
      input.repositoryId,
      input.prNumber,
      leaseOwner,
      nowMs,
      PR_PROCESSING_LEASE_MS,
    );
    if (!leaseAcquired) throw new Stage0QueueError('lease_busy');

    stage = 'observe';
    const collected = await dependencies.observer.collect(input.prNumber);
    stage = 'normalize_snapshot';
    const snapshot = prDecisionSnapshot(collected.prSnapshot);
    if (collected.prSnapshot.repository.toLowerCase() !== dependencies.repository.toLowerCase()
        || collected.prSnapshot.repositoryId !== dependencies.repositoryId
        || collected.prSnapshot.number !== input.prNumber) {
      throw new Stage0QueueError('queue_repository_mismatch');
    }
    stage = 'load_state';
    const existingState = await dependencies.storage.loadPrState(input.repositoryId, input.prNumber);
    let prState = existingState ?? createPrBabysitterState(snapshot);
    stage = 'reconcile_state';
    prState = recordCurrentObservations(prState, snapshot, collected.prSnapshot, collected.checkObservations);
    stage = 'save_state';
    await dependencies.storage.savePrState(input.repositoryId, input.prNumber, prState);

    stage = 'decide';
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
      stage = 'load_report_mapping';
      const mapping = await dependencies.storage.getCheckRunMapping(
        input.repositoryId,
        input.prNumber,
        snapshot.headSha,
      );
      try {
        stage = 'publish_report';
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
        stage = 'save_report_mapping';
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

    stage = 'mark_processed';
    await dependencies.storage.setDeliveryStatus(input.deliveryId, 'processed', null);
    return { status: 'processed', action: decision.action, reasonCode: decision.reasonCode };
  } catch (error) {
    const diagnostic = diagnosticError(error, stage);
    if (registered && !duplicateStatusUnknown) {
      await dependencies.storage.setDeliveryStatus(input.deliveryId, 'retry', diagnostic.code).catch(() => undefined);
    }
    throw diagnostic;
  } finally {
    if (leaseAcquired) {
      await dependencies.storage.releaseLease(input.repositoryId, input.prNumber, leaseOwner).catch(() => false);
    }
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
        stage: error instanceof Stage0QueueDiagnosticError ? error.stage : 'register_delivery',
      });
      message.retry({ delaySeconds: Math.min(300, 15 * (2 ** Math.min(Math.max(message.attempts - 1, 0), 4))) });
    }
  }
  for (const message of batch.messages.slice(STAGE0_LIMITS.maxQueueBatchSize)) {
    message.retry({ delaySeconds: 60 });
  }
}
