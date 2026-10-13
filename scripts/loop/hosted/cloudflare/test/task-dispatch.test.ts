import { describe, expect, it } from 'vitest';
import { processIssueTaskMessage, type TaskDispatchServices } from '../src/handlers/task-dispatch';

const sha = 'a'.repeat(40);
const envelope = { kind: 'issue_task', deliveryId: 'delivery-1', repositoryId: 1234, issueNumber: 42,
  generation: 1, taskId: 'repo-1234-issue-42-g1', sourceRevision: sha, policyRevision: sha };
const record = { schemaVersion: 2, key: { repositoryId: 1234, issueNumber: 42, generation: 1 },
  taskId: envelope.taskId, requestDigest: 'b'.repeat(64), acceptanceIds: [], sourceRevision: sha, policyRevision: sha,
  state: 'queued', version: 1, attempt: 0, epoch: 0, deadline: '2026-10-14T00:00:00.000Z',
  budgets: { modelCalls: 0, repairs: 0, deliveries: 0, lastModelTokenUsed: null },
  links: { loopStateTaskId: envelope.taskId, pr: null }, outcomeReason: null, confirmedMergeSha: null };
function fixture(enabled = true) {
  const calls: string[] = [];
  const services: TaskDispatchServices = {
    loadPolicy: async () => ({ policy: { enabled }, sourceRevision: sha }),
    loadTask: async () => record,
    loadLease: async () => null,
    observeRunner: async () => ({ status: 'running' }),
    claimLease: async () => { calls.push('claim'); return true; },
    releaseLease: async () => { calls.push('release'); return true; },
    dispatch: async (packet: { taskId: string; expectedVersion: number }) => {
      calls.push('dispatch'); return { status: 'accepted', taskId: packet.taskId, expectedVersion: packet.expectedVersion };
    },
  };
  return { calls, services };
}
describe('Issue task dispatch', () => {
  it('hands off only bounded task identifiers after current policy and version-bound lease checks', async () => {
    const { calls, services } = fixture();
    const result = await processIssueTaskMessage(envelope, 1234, services, Date.parse('2026-10-13T00:00:00.000Z'));
    expect(result).toMatchObject({ status: 'accepted', taskId: envelope.taskId });
    expect(calls).toEqual(['claim', 'dispatch']);
  });
  it('does not dispatch disabled, stale, foreign or malformed tasks', async () => {
    const { calls, services } = fixture(false);
    expect(await processIssueTaskMessage(envelope, 1234, services)).toMatchObject({ status: 'ignored', reasonCode: 'policy_disabled' });
    expect(await processIssueTaskMessage({ ...envelope, prompt: 'unsafe' }, 1234, services)).toMatchObject({ status: 'ignored', reasonCode: 'task_envelope_invalid' });
    expect(calls).toEqual([]);
  });
  it('keeps its lease on ambiguous handoffs without inventing task progress or overlapping a running task', async () => {
    const { calls, services } = fixture();
    services.dispatch = async () => { calls.push('dispatch'); throw new Error('private host response'); };
    expect(await processIssueTaskMessage(envelope, 1234, services, Date.parse('2026-10-13T00:00:00.000Z'))).toMatchObject({ status: 'retry', reasonCode: 'task_runner_unavailable' });
    expect(calls).toEqual(['claim', 'dispatch']);
    expect(record.state).toBe('queued');
  });
  it('waits on lease contention and keeps current counters intact', async () => {
    const { calls, services } = fixture();
    services.claimLease = async () => { calls.push('claim'); return false; };
    expect(await processIssueTaskMessage(envelope, 1234, services, Date.parse('2026-10-13T00:00:00.000Z'))).toMatchObject({ status: 'retry', reasonCode: 'task_busy' });
    expect(calls).toEqual(['claim']);
  });
  it('never reclaims an expired runner lease until its exact owner/version is observed stopped', async () => {
    const { calls, services } = fixture();
    const now = Date.parse('2026-10-13T00:00:00.000Z');
    services.loadLease = async () => ({ owner: 'previous-runner', taskVersion: 1, leaseUntil: now - 1 });
    expect(await processIssueTaskMessage(envelope, 1234, services, now)).toMatchObject({ status: 'retry', reasonCode: 'runner_termination_unconfirmed' });
    expect(calls).toEqual([]);
    services.observeRunner = async () => ({ status: 'stopped', taskId: envelope.taskId, leaseOwner: 'previous-runner', expectedVersion: 1 });
    expect(await processIssueTaskMessage(envelope, 1234, services, now)).toMatchObject({ status: 'accepted' });
    expect(calls).toEqual(['claim', 'dispatch']);
  });
});
