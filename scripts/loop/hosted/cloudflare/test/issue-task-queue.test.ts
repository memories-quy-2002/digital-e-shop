import { describe, expect, it } from 'vitest';

import { isIssueTaskQueueMessage } from '../src/handlers/issue-task-queue';

const message = {
  kind: 'issue_task',
  deliveryId: 'delivery-42',
  repositoryId: 743050379,
  issueNumber: 42,
  generation: 1,
  taskId: 'repo-743050379-issue-42-g1',
  sourceRevision: 'a'.repeat(40),
  policyRevision: 'a'.repeat(40),
};

describe('Issue task Queue envelope', () => {
  it('accepts only compact identity and revision metadata', () => {
    expect(isIssueTaskQueueMessage(message)).toBe(true);
    expect(isIssueTaskQueueMessage({ ...message, issueBody: 'raw prompt' })).toBe(false);
    expect(isIssueTaskQueueMessage({ ...message, policyRevision: 'b'.repeat(40) })).toBe(false);
    expect(isIssueTaskQueueMessage({ ...message, taskId: 'repo-743050379-issue-43-g1' })).toBe(false);
  });
});
