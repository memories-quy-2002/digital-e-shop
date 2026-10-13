import { validateTaskRecord } from '../../../../tasks/contracts.mjs';
import type { Env } from '../index';
import { createGitHubObserverRuntime } from '../github/observer';
import { createD1Stage0Storage } from '../storage/d1';
import { loadCanonicalAutonomyPolicy } from './issue-policy';
import type { IssueTaskQueueMessage } from './issue-task-queue';

export async function runTaskReconciliation(input: {
  repositoryId: number; policy: Record<string, unknown>; sourceRevision: string; now: number;
  list(repositoryId: number, now: number, limit: number): Promise<unknown[]>;
  send(message: IssueTaskQueueMessage): Promise<unknown>;
}): Promise<{ status: 'disabled' | 'enqueued'; enqueued: number }> {
  if (input.policy.enabled !== true) return { status: 'disabled', enqueued: 0 };
  if (!Number.isSafeInteger(input.repositoryId) || input.repositoryId < 1 || !Number.isSafeInteger(input.now)
      || input.now < 1 || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(input.sourceRevision)) throw new Error('task_reconciliation_invalid');
  const records = await input.list(input.repositoryId, input.now, 20);
  if (!Array.isArray(records) || records.length > 20) throw new Error('task_reconciliation_limit');
  let enqueued = 0;
  for (const value of records) {
    const record = validateTaskRecord(value);
    if (record.key.repositoryId !== input.repositoryId || record.sourceRevision !== input.sourceRevision
        || record.policyRevision !== input.sourceRevision || Date.parse(record.deadline) <= input.now
        || ['completed', 'cancelled', 'failed', 'escalated', 'waiting-approval'].includes(record.state)) continue;
    await input.send({ kind: 'issue_task', deliveryId: `reconcile-${record.taskId}`, repositoryId: record.key.repositoryId,
      issueNumber: record.key.issueNumber, generation: record.key.generation, taskId: record.taskId,
      sourceRevision: record.sourceRevision, policyRevision: record.policyRevision });
    enqueued++;
  }
  return { status: 'enqueued', enqueued };
}

export async function handleTaskReconciliation(env: Env): Promise<void> {
  if (!env.TASK_QUEUE || !env.TASK_RUNNER || !env.STAGE0_DB) return;
  const runtime = createGitHubObserverRuntime(env);
  const canonical = await loadCanonicalAutonomyPolicy(runtime.api, runtime.configuration.repositoryId);
  await runTaskReconciliation({ repositoryId: runtime.configuration.repositoryId,
    policy: canonical.policy, sourceRevision: canonical.sourceRevision, now: Date.now(),
    list: createD1Stage0Storage(env.STAGE0_DB).listTaskRecordsForReconciliation,
    send: (message) => env.TASK_QUEUE!.send(message, { contentType: 'json' }) });
}
