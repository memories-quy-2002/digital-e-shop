import { describe, expect, it } from 'vitest';
import { runTaskReconciliation } from '../src/handlers/task-reconciliation';

const sha = 'a'.repeat(40);
const task = { schemaVersion: 2, key: { repositoryId: 1234, issueNumber: 42, generation: 1 }, taskId: 'repo-1234-issue-42-g1',
  requestDigest: 'b'.repeat(64), acceptanceIds: [], sourceRevision: sha, policyRevision: sha, state: 'queued', version: 1,
  attempt: 0, epoch: 0, deadline: '2026-10-14T00:00:00.000Z', budgets: { modelCalls: 0, repairs: 0, deliveries: 0, lastModelTokenUsed: null },
  links: { loopStateTaskId: 'repo-1234-issue-42-g1', pr: null }, outcomeReason: null, confirmedMergeSha: null };
describe('bounded task reconciliation', () => {
  it('re-enqueues bounded identity metadata without resetting progress or counters', async () => {
    const messages: unknown[] = [];
    const result = await runTaskReconciliation({ repositoryId: 1234, policy: { enabled: true }, sourceRevision: sha,
      now: Date.parse('2026-10-13T00:00:00.000Z'), list: async () => [task], send: async (value) => { messages.push(value); } });
    expect(result.enqueued).toBe(1);
    expect(messages[0]).toMatchObject({ taskId: task.taskId, kind: 'issue_task', policyRevision: sha });
    expect(JSON.stringify(messages)).not.toContain('requestDigest');
    expect(task.version).toBe(1);
  });
  it('does no work under disabled policy and skips stale revisions or expired tasks', async () => {
    let calls = 0;
    const input = { repositoryId: 1234, policy: { enabled: false }, sourceRevision: sha, now: Date.parse('2026-10-13T00:00:00.000Z'),
      list: async () => { calls++; return [task]; }, send: async () => { calls++; } };
    expect(await runTaskReconciliation(input)).toMatchObject({ status: 'disabled', enqueued: 0 });
    expect(calls).toBe(0);
    expect(await runTaskReconciliation({ ...input, policy: { enabled: true }, sourceRevision: 'c'.repeat(40) })).toMatchObject({ enqueued: 0 });
  });
});
