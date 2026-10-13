import { handleQueue, type Stage0QueueMessage } from './handlers/queue';
import { handleScheduled } from './handlers/scheduled';
import { handleWebhook } from './handlers/webhook';
import type { IssueTaskQueueMessage } from './handlers/issue-task-queue';
import { unavailableEvidence } from './limits';
import { handleTaskQueue } from './handlers/task-dispatch';

export interface Env extends Record<string, unknown> {
  GITHUB_REPOSITORY?: string;
  GITHUB_INSTALLATION_ID?: string;
  GITHUB_APP_PRIVATE_KEY?: string;
  EVENT_QUEUE?: Queue<Stage0QueueMessage>;
  TASK_QUEUE?: Queue<IssueTaskQueueMessage>;
  TASK_RUNNER?: Fetcher;
  GITHUB_WEBHOOK_SECRET?: string;
  GITHUB_REPOSITORY_ID?: string;
  GITHUB_APP_ID?: string;
  STAGE0_CHECK_RUN_NAME?: string;
  STAGE0_DB?: D1Database;
}

const worker = {
  fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === '/webhook') return handleWebhook(request, env);

    return Promise.resolve(Response.json(unavailableEvidence('route_not_found'), {
      status: 404,
      headers: { 'cache-control': 'no-store' },
    }));
  },
  queue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
    if (batch.queue === 'digital-e-loop-issue-tasks') return handleTaskQueue(batch, env);
    return handleQueue(batch as MessageBatch<Stage0QueueMessage>, env);
  },
  scheduled: handleScheduled,
} satisfies ExportedHandler<Env>;

export default worker;
