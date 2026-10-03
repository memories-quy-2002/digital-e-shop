import type { Env } from '../index';
import { GitHubAppAuthError } from '../github/app-auth';
import { GitHubApiError } from '../github/api';
import { createGitHubObserverRuntime } from '../github/observer';
import { STAGE0_LIMITS } from '../limits';
import { createD1Stage0Storage } from '../storage/d1';
import type { Stage0QueueMessage } from './queue';

const SCHEDULER_LEASE_MS = 14 * 60 * 1000;

export class Stage0ReconciliationError extends Error {
  readonly code:
    | 'configuration_invalid'
    | 'scheduler_busy'
    | 'github_auth_configuration_invalid'
    | 'github_auth_app_key_invalid'
    | 'github_auth_token_request_failed'
    | 'github_auth_token_request_unauthorized'
    | 'github_auth_token_request_forbidden'
    | 'github_auth_token_request_not_found'
    | 'github_auth_token_request_unprocessable'
    | 'github_auth_token_request_rate_limited'
    | 'github_auth_token_response_invalid'
    | 'github_auth_token_request_network_error'
    | 'github_auth_token_request_timeout'
    | 'github_auth_token_request_redirect_rejected'
    | `github_auth_token_request_http_${number}`
    | 'github_api_configuration_invalid'
    | 'github_api_request_limit_reached'
    | 'github_api_network_error'
    | 'github_api_redirect_rejected'
    | 'github_api_response_too_large'
    | 'github_api_invalid_response'
    | 'github_api_bad_request'
    | 'github_api_unauthorized'
    | 'github_api_forbidden'
    | 'github_api_not_found'
    | 'github_api_rate_limited'
    | 'github_api_unprocessable_entity'
    | 'github_api_unavailable'
    | 'github_api_pagination_rejected'
    | 'github_api_pagination_limit'
    | 'queue_unavailable'
    | 'reconciliation_page_invalid'
    | 'reconciliation_page_limit';

  constructor(code: Stage0ReconciliationError['code']) {
    super(code);
    this.name = 'Stage0ReconciliationError';
    this.code = code;
  }
}

interface ReconciliationStorage {
  claimLease(repositoryId: number, prNumber: number, owner: string, nowMs: number, leaseMs: number): Promise<boolean>;
  releaseLease(repositoryId: number, prNumber: number, owner: string): Promise<boolean>;
  getReconciliationCursor(repositoryId: number): Promise<{ page: number; sweepId: string | null; lastCompletedAt: string | null }>;
  saveReconciliationCursor(
    repositoryId: number,
    cursor: { page: number; sweepId: string | null; lastCompletedAt: string | null },
  ): Promise<void>;
  cleanupExpiredDeliveries(nowMs: number, limit: number): Promise<number>;
}

interface ReconciliationApi {
  listOpenPullRequests(page: number): Promise<{ items: unknown[]; hasNext: boolean; pageCount: 1 }>;
}

interface ReconciliationQueue {
  send(message: Stage0QueueMessage, options?: QueueSendOptions): Promise<unknown>;
}

function githubReconciliationReason(error: unknown): Stage0ReconciliationError['code'] {
  if (error instanceof GitHubAppAuthError) {
    switch (error.code) {
      case 'configuration_invalid': return 'github_auth_configuration_invalid';
      case 'app_key_invalid': return 'github_auth_app_key_invalid';
      case 'token_request_failed': return 'github_auth_token_request_failed';
      case 'token_request_unauthorized': return 'github_auth_token_request_unauthorized';
      case 'token_request_forbidden': return 'github_auth_token_request_forbidden';
      case 'token_request_not_found': return 'github_auth_token_request_not_found';
      case 'token_request_unprocessable': return 'github_auth_token_request_unprocessable';
      case 'token_request_rate_limited': return 'github_auth_token_request_rate_limited';
      case 'token_response_invalid': return 'github_auth_token_response_invalid';
      case 'token_request_network_error': return 'github_auth_token_request_network_error';
      case 'token_request_timeout': return 'github_auth_token_request_timeout';
      case 'token_request_redirect_rejected': return 'github_auth_token_request_redirect_rejected';
      default:
        if (error.code.startsWith('token_request_http_')) {
          return `github_auth_${error.code}` as `github_auth_token_request_http_${number}`;
        }
        return 'github_auth_token_request_failed';
    }
  }
  if (error instanceof GitHubApiError) {
    switch (error.code) {
      case 'configuration_invalid': return 'github_api_configuration_invalid';
      case 'request_limit_reached': return 'github_api_request_limit_reached';
      case 'network_error': return 'github_api_network_error';
      case 'redirect_rejected': return 'github_api_redirect_rejected';
      case 'response_too_large': return 'github_api_response_too_large';
      case 'invalid_response': return 'github_api_invalid_response';
      case 'bad_request': return 'github_api_bad_request';
      case 'unauthorized': return 'github_api_unauthorized';
      case 'forbidden': return 'github_api_forbidden';
      case 'not_found': return 'github_api_not_found';
      case 'rate_limited': return 'github_api_rate_limited';
      case 'unprocessable_entity': return 'github_api_unprocessable_entity';
      case 'api_unavailable': return 'github_api_unavailable';
      case 'pagination_rejected': return 'github_api_pagination_rejected';
      case 'pagination_limit': return 'github_api_pagination_limit';
    }
  }
  return 'github_api_unavailable';
}

export async function runScheduledReconciliation(input: {
  repositoryId: number;
  storage: ReconciliationStorage;
  api: ReconciliationApi;
  queue: ReconciliationQueue;
  now?: () => number;
}): Promise<{
  status: 'enqueued' | 'incomplete';
  page: number;
  enqueued: number;
  sweepComplete: boolean;
  sweepId: string;
  reasonCode?: 'reconciliation_page_limit';
}> {
  if (!input || !Number.isSafeInteger(input.repositoryId) || input.repositoryId < 1) {
    throw new Stage0ReconciliationError('configuration_invalid');
  }
  const now = input.now ?? Date.now;
  const nowMs = now();
  if (!Number.isSafeInteger(nowMs) || nowMs < 1) throw new Stage0ReconciliationError('configuration_invalid');
  const owner = 'scheduler-' + nowMs;
  const acquired = await input.storage.claimLease(
    input.repositoryId,
    0,
    owner,
    nowMs,
    SCHEDULER_LEASE_MS,
  );
  if (!acquired) throw new Stage0ReconciliationError('scheduler_busy');

  try {
    await input.storage.cleanupExpiredDeliveries(nowMs, 100);
    const cursor = await input.storage.getReconciliationCursor(input.repositoryId);
    const sweepId = cursor.sweepId ?? 'sweep-' + nowMs;
    if (cursor.sweepId === null) {
      await input.storage.saveReconciliationCursor(input.repositoryId, {
        ...cursor,
        sweepId,
      });
    }

    let page: { items: unknown[]; hasNext: boolean; pageCount: 1 };
    try {
      page = await input.api.listOpenPullRequests(cursor.page);
    } catch (error) {
      throw new Stage0ReconciliationError(githubReconciliationReason(error));
    }
    if (!page || !Array.isArray(page.items) || page.items.length > STAGE0_LIMITS.maxOpenPullRequestsPerSweep
        || typeof page.hasNext !== 'boolean' || page.pageCount !== 1) {
      throw new Stage0ReconciliationError('reconciliation_page_invalid');
    }
    const prNumbers: number[] = [];
    const seenNumbers = new Set<number>();
    for (const value of page.items) {
      const number = typeof value === 'object' && value !== null && !Array.isArray(value)
        ? (value as { number?: unknown }).number
        : null;
      if (!Number.isSafeInteger(number) || (number as number) < 1 || seenNumbers.has(number as number)) {
        throw new Stage0ReconciliationError('reconciliation_page_invalid');
      }
      seenNumbers.add(number as number);
      prNumbers.push(number as number);
    }
    const receivedAt = new Date(nowMs).toISOString();
    for (const prNumber of prNumbers) {
      const message: Stage0QueueMessage = {
        deliveryId: 'reconcile-' + sweepId + '-' + prNumber,
        event: 'schedule',
        action: null,
        repositoryId: input.repositoryId,
        prNumber,
        receivedAt,
      };
      try {
        await input.queue.send(message, { contentType: 'json' });
      } catch {
        throw new Stage0ReconciliationError('queue_unavailable');
      }
    }

    const completedAt = receivedAt;
    if (page.hasNext && cursor.page < STAGE0_LIMITS.maxReconciliationPagesPerSweep) {
      await input.storage.saveReconciliationCursor(input.repositoryId, {
        page: cursor.page + 1,
        sweepId,
        lastCompletedAt: null,
      });
      return {
        status: 'enqueued',
        page: cursor.page,
        enqueued: prNumbers.length,
        sweepComplete: false,
        sweepId,
      };
    }
    if (page.hasNext) {
      await input.storage.saveReconciliationCursor(input.repositoryId, {
        page: 1,
        sweepId: null,
        lastCompletedAt: cursor.lastCompletedAt,
      });
      console.warn('stage0_reconciliation_page_limit_reached');
      return {
        status: 'incomplete',
        page: cursor.page,
        enqueued: prNumbers.length,
        sweepComplete: false,
        sweepId,
        reasonCode: 'reconciliation_page_limit',
      };
    }
    await input.storage.saveReconciliationCursor(input.repositoryId, {
      page: 1,
      sweepId: null,
      lastCompletedAt: completedAt,
    });
    return {
      status: 'enqueued',
      page: cursor.page,
      enqueued: prNumbers.length,
      sweepComplete: true,
      sweepId,
    };
  } finally {
    await input.storage.releaseLease(input.repositoryId, 0, owner).catch(() => false);
  }
}

export async function handleScheduled(_controller: ScheduledController, env: Env): Promise<void> {
  if (!env.EVENT_QUEUE || !env.STAGE0_DB) {
    console.warn('stage0_scheduled_reconciliation_unavailable');
    return;
  }
  try {
    const runtime = createGitHubObserverRuntime(env);
    await runScheduledReconciliation({
      repositoryId: runtime.configuration.repositoryId,
      storage: createD1Stage0Storage(env.STAGE0_DB),
      api: runtime.api,
      queue: env.EVENT_QUEUE,
    });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error
      && typeof error.code === 'string' && /^[a-z][a-z0-9_]{0,80}$/.test(error.code)
      ? error.code
      : 'reconciliation_failed';
    console.warn('stage0_scheduled_reconciliation_failed', { reasonCode: code });
  }
}
