import type { Env } from '../index';
import { createGitHubObserverRuntime } from '../github/observer';
import { STAGE0_LIMITS } from '../limits';
import { createD1Stage0Storage } from '../storage/d1';
import type { Stage0QueueMessage } from './queue';

const SCHEDULER_LEASE_MS = 14 * 60 * 1000;

export class Stage0ReconciliationError extends Error {
  readonly code:
    | 'configuration_invalid'
    | 'scheduler_busy'
    | 'github_api_unavailable'
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
    } catch {
      throw new Stage0ReconciliationError('github_api_unavailable');
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
