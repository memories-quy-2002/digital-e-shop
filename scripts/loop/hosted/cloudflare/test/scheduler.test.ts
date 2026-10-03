import { applyD1Migrations, env, reset } from 'cloudflare:test';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GitHubAppAuthError } from '../src/github/app-auth';
import { GitHubApiError } from '../src/github/api';
import { createD1Stage0Storage } from '../src/storage/d1';
import { runScheduledReconciliation } from '../src/handlers/scheduled';

interface TestEnvironment {
  STAGE0_DB: D1Database;
  TEST_MIGRATIONS: Array<{ name: string; queries: string[] }>;
}

const testEnv = env as unknown as TestEnvironment;
const repositoryId = 123456;
const fixedNow = Date.UTC(2026, 9, 1, 0, 15, 0);

beforeEach(async () => {
  await reset();
  await applyD1Migrations(testEnv.STAGE0_DB, testEnv.TEST_MIGRATIONS);
});

describe('scheduled open PR reconciliation', () => {
  it('persists and resumes a page cursor, then closes a completed sweep', async () => {
    const storage = createD1Stage0Storage(testEnv.STAGE0_DB);
    const send = vi.fn(async (_message: unknown) => undefined);
    const listOpenPullRequests = vi.fn()
      .mockResolvedValueOnce({
        items: Array.from({ length: 20 }, (_, index) => ({ number: index + 1 })),
        hasNext: true,
        pageCount: 1 as const,
      })
      .mockResolvedValueOnce({
        items: [{ number: 21 }],
        hasNext: false,
        pageCount: 1 as const,
      });
    const api = { listOpenPullRequests };

    const first = await runScheduledReconciliation({
      repositoryId,
      storage,
      api,
      queue: { send },
      now: () => fixedNow,
    });
    const cursorAfterFirst = await storage.getReconciliationCursor(repositoryId);
    const second = await runScheduledReconciliation({
      repositoryId,
      storage,
      api,
      queue: { send },
      now: () => fixedNow + 15 * 60 * 1000,
    });

    expect(first).toMatchObject({ status: 'enqueued', page: 1, enqueued: 20, sweepComplete: false });
    expect(cursorAfterFirst).toEqual({ page: 2, sweepId: first.sweepId, lastCompletedAt: null });
    expect(second).toMatchObject({ status: 'enqueued', page: 2, enqueued: 1, sweepComplete: true });
    expect(await storage.getReconciliationCursor(repositoryId)).toEqual({
      page: 1,
      sweepId: null,
      lastCompletedAt: new Date(fixedNow + 15 * 60 * 1000).toISOString(),
    });
    expect(send).toHaveBeenCalledTimes(21);
    expect(send.mock.calls[0]?.[0]).toMatchObject({
      event: 'schedule',
      repositoryId,
      prNumber: 1,
      deliveryId: 'reconcile-' + first.sweepId + '-1',
    });
    expect(send.mock.calls[20]?.[0]).toMatchObject({
      event: 'schedule',
      repositoryId,
      prNumber: 21,
      deliveryId: 'reconcile-' + first.sweepId + '-21',
    });
  });

  it('keeps the same sweep and delivery keys if queue enqueue partially fails', async () => {
    const storage = createD1Stage0Storage(testEnv.STAGE0_DB);
    const api = {
      listOpenPullRequests: vi.fn(async () => ({
        items: [{ number: 264 }, { number: 265 }],
        hasNext: true,
        pageCount: 1 as const,
      })),
    };
    let calls = 0;
    const sentIds: string[] = [];
    const queue = {
      send: vi.fn(async (message: { deliveryId: string }) => {
        calls += 1;
        sentIds.push(message.deliveryId);
        if (calls === 2) throw new Error('do not log this');
      }),
    };

    await expect(runScheduledReconciliation({
      repositoryId,
      storage,
      api,
      queue,
      now: () => fixedNow,
    })).rejects.toMatchObject({ code: 'queue_unavailable' });
    const savedAfterFailure = await storage.getReconciliationCursor(repositoryId);
    const retryQueue = { send: vi.fn(async (message: { deliveryId: string }) => { sentIds.push(message.deliveryId); }) };
    const retry = await runScheduledReconciliation({
      repositoryId,
      storage,
      api,
      queue: retryQueue,
      now: () => fixedNow + 60_000,
    });

    expect(savedAfterFailure.page).toBe(1);
    expect(savedAfterFailure.sweepId).toBeTruthy();
    expect(retry.sweepId).toBe(savedAfterFailure.sweepId);
    expect(sentIds[0]).toBe(sentIds[2]);
    expect(sentIds[1]).toBe(sentIds[3]);
  });

  it('preserves a GitHub App token failure as a specific reconciliation reason', async () => {
    const storage = createD1Stage0Storage(testEnv.STAGE0_DB);
    const api = {
      listOpenPullRequests: vi.fn(async () => {
        throw new GitHubAppAuthError('token_request_forbidden');
      }),
    };
    const queue = { send: vi.fn(async () => undefined) };

    await expect(runScheduledReconciliation({
      repositoryId,
      storage,
      api,
      queue,
      now: () => fixedNow,
    })).rejects.toMatchObject({ code: 'github_auth_token_request_forbidden' });
    expect(queue.send).not.toHaveBeenCalled();
  });

  it('preserves an unclassified GitHub HTTP status in the reconciliation reason', async () => {
    const storage = createD1Stage0Storage(testEnv.STAGE0_DB);
    const api = {
      listOpenPullRequests: vi.fn(async () => {
        throw new GitHubAppAuthError('token_request_http_503');
      }),
    };
    const queue = { send: vi.fn(async () => undefined) };

    await expect(runScheduledReconciliation({
      repositoryId,
      storage,
      api,
      queue,
      now: () => fixedNow,
    })).rejects.toMatchObject({ code: 'github_auth_token_request_http_503' });
    expect(queue.send).not.toHaveBeenCalled();
  });

  it('preserves a forbidden GitHub API response as a specific reconciliation reason', async () => {
    const storage = createD1Stage0Storage(testEnv.STAGE0_DB);
    const api = {
      listOpenPullRequests: vi.fn(async () => {
        throw new GitHubApiError('forbidden');
      }),
    };
    const queue = { send: vi.fn(async () => undefined) };

    await expect(runScheduledReconciliation({
      repositoryId,
      storage,
      api,
      queue,
      now: () => fixedNow,
    })).rejects.toMatchObject({ code: 'github_api_forbidden' });
    expect(queue.send).not.toHaveBeenCalled();
  });

  it('does not advance the cursor when GitHub cannot enumerate the current page', async () => {
    const storage = createD1Stage0Storage(testEnv.STAGE0_DB);
    const api = { listOpenPullRequests: vi.fn(async () => { throw new Error('sensitive github response'); }) };
    const queue = { send: vi.fn(async () => undefined) };

    await expect(runScheduledReconciliation({
      repositoryId,
      storage,
      api,
      queue,
      now: () => fixedNow,
    })).rejects.toMatchObject({ code: 'github_api_unavailable' });
    expect(await storage.getReconciliationCursor(repositoryId)).toMatchObject({ page: 1, sweepId: expect.any(String) });
    expect(queue.send).not.toHaveBeenCalled();
  });
});

