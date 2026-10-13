import { validateTaskRecord } from '../../../../tasks/contracts.mjs';
import type { Env } from '../index';
import { createGitHubObserverRuntime } from '../github/observer';
import { createD1Stage0Storage } from '../storage/d1';
import { loadCanonicalAutonomyPolicy } from './issue-policy';
import { isIssueTaskQueueMessage, type IssueTaskQueueMessage } from './issue-task-queue';

export interface TaskDispatchPacket extends IssueTaskQueueMessage {
  expectedVersion: number;
  leaseOwner: string;
  leaseUntil: number;
}
export interface TaskDispatchServices {
  loadPolicy(): Promise<{ policy: Record<string, unknown>; sourceRevision: string }>;
  loadTask(taskId: string): Promise<unknown>;
  loadLease(taskId: string): Promise<{ owner: string; taskVersion: number; leaseUntil: number } | null>;
  observeRunner(taskId: string): Promise<unknown>;
  claimLease(taskId: string, owner: string, now: number, leaseMs: number, version: number): Promise<boolean>;
  releaseLease(taskId: string, owner: string): Promise<boolean>;
  dispatch(packet: TaskDispatchPacket): Promise<unknown>;
}
type Outcome = { status: 'accepted' | 'ignored' | 'retry'; taskId?: string; reasonCode?: string };
const LEASE_MS = 15 * 60 * 1000;

async function readRunnerJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('task_runner_unavailable');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 1024) { await reader.cancel(); throw new Error('task_runner_unavailable'); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

/** The runner gateway must independently authenticate policy, Issue digest and leases before execution. */
export async function processIssueTaskMessage(
  input: unknown, repositoryId: number, services: TaskDispatchServices, now = Date.now(),
): Promise<Outcome> {
  if (!isIssueTaskQueueMessage(input) || input.repositoryId !== repositoryId) return { status: 'ignored', reasonCode: 'task_envelope_invalid' };
  const taskId = input.taskId;
  if (!Number.isSafeInteger(now) || now < 1) return { status: 'retry', taskId, reasonCode: 'task_clock_invalid' };
  let acquired = false;
  let accepted = false;
  let dispatchAttempted = false;
  const owner = `task-${crypto.randomUUID()}`;
  try {
    const canonical = await services.loadPolicy();
    if (canonical.policy.enabled !== true) return { status: 'ignored', taskId, reasonCode: 'policy_disabled' };
    if (canonical.sourceRevision !== input.sourceRevision || canonical.sourceRevision !== input.policyRevision) {
      return { status: 'ignored', taskId, reasonCode: 'policy_revision_mismatch' };
    }
    const record = validateTaskRecord(await services.loadTask(taskId));
    if (record.taskId !== taskId || record.key.repositoryId !== input.repositoryId
        || record.key.issueNumber !== input.issueNumber || record.key.generation !== input.generation
        || record.sourceRevision !== input.sourceRevision || record.policyRevision !== input.policyRevision) {
      return { status: 'ignored', taskId, reasonCode: 'task_identity_mismatch' };
    }
    if (['completed', 'cancelled', 'failed', 'escalated'].includes(record.state)) return { status: 'ignored', taskId, reasonCode: 'task_terminal' };
    if (Date.parse(record.deadline) <= now) return { status: 'ignored', taskId, reasonCode: 'task_deadline_exhausted' };
    const priorLease = await services.loadLease(taskId);
    if (priorLease) {
      if (priorLease.leaseUntil > now) return { status: 'retry', taskId, reasonCode: 'task_busy' };
      const stopped = await services.observeRunner(taskId);
      if (typeof stopped !== 'object' || stopped === null || Array.isArray(stopped)
          || Object.keys(stopped).sort().join('|') !== 'expectedVersion|leaseOwner|status|taskId'
          || (stopped as Record<string, unknown>).status !== 'stopped'
          || (stopped as Record<string, unknown>).taskId !== taskId
          || (stopped as Record<string, unknown>).leaseOwner !== priorLease.owner
          || (stopped as Record<string, unknown>).expectedVersion !== priorLease.taskVersion) {
        return { status: 'retry', taskId, reasonCode: 'runner_termination_unconfirmed' };
      }
    }
    acquired = await services.claimLease(taskId, owner, now, LEASE_MS, record.version);
    if (!acquired) return { status: 'retry', taskId, reasonCode: 'task_busy' };
    dispatchAttempted = true;
    const response = await services.dispatch({ ...input, expectedVersion: record.version, leaseOwner: owner, leaseUntil: now + LEASE_MS });
    if (typeof response === 'object' && response !== null && !Array.isArray(response)
        && Object.keys(response).join('|') === 'status' && (response as Record<string, unknown>).status === 'not_started') {
      dispatchAttempted = false;
      return { status: 'retry', taskId, reasonCode: 'task_runner_unavailable' };
    }
    if (typeof response !== 'object' || response === null || Array.isArray(response)
        || Object.keys(response).sort().join('|') !== 'expectedVersion|status|taskId'
        || (response as Record<string, unknown>).status !== 'accepted'
        || (response as Record<string, unknown>).taskId !== taskId
        || (response as Record<string, unknown>).expectedVersion !== record.version) {
      return { status: 'retry', taskId, reasonCode: 'task_runner_unavailable' };
    }
    accepted = true;
    return { status: 'accepted', taskId };
  } catch {
    return { status: 'retry', taskId, reasonCode: 'task_runner_unavailable' };
  } finally {
    if (acquired && !accepted && !dispatchAttempted) await services.releaseLease(taskId, owner).catch(() => false);
  }
}

export async function handleTaskQueue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
  const repositoryId = Number(env.GITHUB_REPOSITORY_ID);
  for (const message of batch.messages) {
    if (!env.STAGE0_DB || !Number.isSafeInteger(repositoryId) || repositoryId < 1) { message.retry({ delaySeconds: 60 }); continue; }
    const storage = createD1Stage0Storage(env.STAGE0_DB);
    const outcome = await processIssueTaskMessage(message.body, repositoryId, {
      loadPolicy: async () => loadCanonicalAutonomyPolicy(createGitHubObserverRuntime(env).api, repositoryId),
      loadTask: storage.loadTaskRecord,
      loadLease: storage.loadTaskLease,
      observeRunner: async (taskId) => {
        if (!env.TASK_RUNNER) throw new Error('task_runner_unavailable');
        const response = await env.TASK_RUNNER.fetch(`https://task-runner.internal/v1/tasks/${taskId}`, {
          method: 'GET', signal: AbortSignal.timeout(10_000), redirect: 'manual',
        });
        if (response.status !== 200) throw new Error('task_runner_unavailable');
        return readRunnerJson(response);
      },
      claimLease: storage.claimTaskLease,
      releaseLease: storage.releaseTaskLease,
      dispatch: async (packet) => {
        if (!env.TASK_RUNNER) return { status: 'not_started' };
        const response = await env.TASK_RUNNER.fetch('https://task-runner.internal/v1/tasks', {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(packet),
          signal: AbortSignal.timeout(10_000), redirect: 'manual',
        });
        if (response.status !== 202) throw new Error('task_runner_unavailable');
        return readRunnerJson(response);
      },
    });
    if (outcome.status === 'retry') message.retry({ delaySeconds: 60 }); else message.ack();
  }
}
