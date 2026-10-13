import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { authorizeIssueTask } from '../tasks/issue-ingress.mjs';

const revision = 'c'.repeat(40);
const policy = Object.freeze({
  schemaVersion: 1,
  enabled: true,
  autoMergeEnabled: false,
  ownerActorIds: Object.freeze([93824124]),
  eligibleActors: Object.freeze([93824124]),
  optInLabel: 'autonomous:run',
  eligibleCategories: Object.freeze(['documentation']),
  eligiblePaths: Object.freeze(['docs/API.md']),
  eligibleRisks: Object.freeze(['low']),
  runner: Object.freeze({ provider: 'openai', model: 'GPT-6-Luna' }),
  capabilities: Object.freeze(['observe']),
  budgets: Object.freeze({ maxModelCalls: 8, maxDeliveryGenerations: 2, taskConcurrency: 1, maxHostedWorkflowRuns: 3 }),
  trustedRevision: revision,
});

const input = {
  action: 'opened', repositoryId: 1234, configuredRepositoryId: 1234, issueNumber: 42, actorId: 93824124,
  labels: ['bug', 'autonomous:run'], body: 'Please improve this page.',
  isPullRequest: false, sourceRevision: revision, policy, now: '2026-10-13T12:00:00.000Z',
  deadline: '2026-10-13T12:30:00.000Z',
};

describe('Issue task ingress', () => {
  it('creates only bounded TaskRecord metadata and a digest for an opted-in eligible Issue', async () => {
    const result = await authorizeIssueTask(input);
    assert.equal(result.status, 'authorized');
    assert.equal(result.record.taskId, 'repo-1234-issue-42-g1');
    assert.equal(result.record.state, 'queued');
    assert.equal(result.record.requestDigest.length, 64);
    assert.equal(result.record.sourceRevision, revision);
    assert.equal(result.record.policyRevision, revision);
    assert.deepEqual(result.record.acceptanceIds, []);
    assert.equal(JSON.stringify(result).includes(input.body), false);
    assert.equal(JSON.stringify(result).includes('Please improve'), false);
  });

  it('fails closed when policy is disabled or the revision differs from the trusted source', async () => {
    assert.deepEqual(await authorizeIssueTask({ ...input, policy: Object.freeze({ ...policy, enabled: false }) }), {
      status: 'ignored', reasonCode: 'policy_disabled',
    });
    assert.deepEqual(await authorizeIssueTask({ ...input, sourceRevision: 'd'.repeat(40) }), {
      status: 'ignored', reasonCode: 'policy_revision_mismatch',
    });
  });

  it('requires a supported Issue action, exact eligible actor, opt-in label, and non-PR Issue', async () => {
    for (const [override, reasonCode] of [
      [{ action: 'edited' }, 'unsupported_action'],
      [{ actorId: 7 }, 'actor_not_eligible'],
      [{ labels: ['bug'] }, 'opt_in_missing'],
      [{ isPullRequest: true }, 'pull_request_issue'],
      [{ repositoryId: 7 }, 'wrong_repository'],
    ]) {
      assert.deepEqual(await authorizeIssueTask({ ...input, ...override }), { status: 'ignored', reasonCode });
    }
  });

  it('rejects malformed or oversized request material without returning it', async () => {
    for (const override of [{ body: ' ' }, { body: 'x'.repeat(64 * 1024 + 1) }, { issueNumber: 0 }]) {
      await assert.rejects(authorizeIssueTask({ ...input, ...override }));
    }
  });
});
