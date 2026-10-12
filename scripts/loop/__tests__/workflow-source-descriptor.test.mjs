import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createWorkflowSourceDescriptor,
  serializeWorkflowSourceDescriptor,
  WORKFLOW_SOURCE_DESCRIPTOR_VERSION,
} from '../workflow-source-descriptor.mjs';

const TESTED_SHA = 'a'.repeat(40);
const BASE_SHA = 'b'.repeat(40);
const HEAD_SHA = 'c'.repeat(40);

function pullRequestInput(overrides = {}) {
  return {
    repositoryId: 9,
    workflowId: 42,
    workflowPath: '.github/workflows/loop-foundation.yml',
    workflowRef: 'refs/pull/17/merge',
    runId: 123,
    runAttempt: 2,
    eventName: 'pull_request',
    testedSha: TESTED_SHA,
    pullRequest: {
      number: 17,
      baseSha: BASE_SHA,
      headSha: HEAD_SHA,
      mergeSha: TESTED_SHA,
    },
    ...overrides,
  };
}

describe('workflow source descriptor', () => {
  it('emits the fixed descriptor in canonical property order', () => {
    const descriptor = createWorkflowSourceDescriptor(pullRequestInput());

    assert.equal(WORKFLOW_SOURCE_DESCRIPTOR_VERSION, 1);
    assert.deepEqual(Object.keys(descriptor), [
      'schemaVersion',
      'repositoryId',
      'workflowId',
      'workflowPath',
      'workflowRef',
      'runId',
      'runAttempt',
      'eventName',
      'testedSha',
      'pullRequest',
    ]);
    assert.equal(
      serializeWorkflowSourceDescriptor(pullRequestInput()).toString('utf8'),
      `{"schemaVersion":1,"repositoryId":9,"workflowId":42,"workflowPath":".github/workflows/loop-foundation.yml","workflowRef":"refs/pull/17/merge","runId":123,"runAttempt":2,"eventName":"pull_request","testedSha":"${TESTED_SHA}","pullRequest":{"number":17,"baseSha":"${BASE_SHA}","headSha":"${HEAD_SHA}","mergeSha":"${TESTED_SHA}"}}`,
    );
    assert.equal(Object.isFrozen(descriptor), true);
    assert.equal(Object.isFrozen(descriptor.pullRequest), true);
  });

  it('rejects malformed IDs, SHA values, workflow paths, and refs', () => {
    const invalidInputs = [
      { repositoryId: 0 },
      { workflowId: Number.MAX_SAFE_INTEGER + 1 },
      { runId: -1 },
      { runAttempt: 0 },
      { testedSha: 'not-a-sha' },
      { workflowPath: '../loop-foundation.yml' },
      { workflowPath: '.github/workflows/../secret.yml' },
      { workflowPath: '.github/workflows\\loop-foundation.yml' },
      { workflowRef: 'refs/heads/feature..bad' },
      { workflowRef: 'refs/heads/feature name' },
      { workflowRef: 'refs/heads/feature/' },
    ];

    for (const overrides of invalidInputs) {
      assert.throws(() => createWorkflowSourceDescriptor(pullRequestInput(overrides)));
    }

    assert.throws(() => createWorkflowSourceDescriptor(pullRequestInput({
      pullRequest: { ...pullRequestInput().pullRequest, baseSha: 'bad' },
    })));
  });

  it('requires a complete PR tuple and permits a null tuple only for non-PR events', () => {
    assert.throws(() => createWorkflowSourceDescriptor(pullRequestInput({ pullRequest: null })));
    assert.throws(() => createWorkflowSourceDescriptor(pullRequestInput({
      pullRequest: { ...pullRequestInput().pullRequest, mergeSha: null },
    })));

    const pushInput = pullRequestInput({
      workflowRef: 'refs/heads/main',
      eventName: 'push',
      pullRequest: null,
    });
    const descriptor = createWorkflowSourceDescriptor(pushInput);
    assert.equal(descriptor.pullRequest, null);
    assert.throws(() => createWorkflowSourceDescriptor({ ...pushInput, pullRequest: pullRequestInput().pullRequest }));
  });

  it('rejects sourceSha and unknown keys', () => {
    assert.throws(() => createWorkflowSourceDescriptor({ ...pullRequestInput(), sourceSha: TESTED_SHA }));
    assert.throws(() => createWorkflowSourceDescriptor({ ...pullRequestInput(), extra: 'unexpected' }));
    assert.throws(() => createWorkflowSourceDescriptor({
      ...pullRequestInput(),
      pullRequest: { ...pullRequestInput().pullRequest, extra: 'unexpected' },
    }));
  });

  it('returns canonical descriptor bytes without mutating its input', () => {
    const input = pullRequestInput();
    const before = structuredClone(input);
    const bytes = serializeWorkflowSourceDescriptor(input);

    assert.ok(Buffer.isBuffer(bytes));
    assert.deepEqual(input, before);
    assert.equal(bytes.toString('utf8').startsWith('{"schemaVersion":1,'), true);
    assert.equal(bytes.includes(Buffer.from('\n')), false);
  });

  it('binds a trusted dispatch descriptor to the exact PR tuple and dispatch actor', () => {
    const target = { number: 17, baseSha: BASE_SHA, headSha: HEAD_SHA, mergeSha: TESTED_SHA, testedSha: TESTED_SHA,
      context: 'client', appId: 15368, checkRunId: 88, policyFingerprint: 'e'.repeat(64), requestId: '1'.repeat(32),
      actorId: 9988, actorLogin: 'digital-e-loop-runner[bot]' };
    const input = { repositoryId: 9, workflowId: 42, workflowPath: '.github/workflows/stage1-trusted-retry.yml',
      workflowRef: 'refs/heads/main', runId: 123, runAttempt: 2, eventName: 'workflow_dispatch', testedSha: BASE_SHA,
      pullRequest: null, dispatchTarget: target };
    const descriptor = createWorkflowSourceDescriptor(input);

    assert.equal(descriptor.schemaVersion, 2);
    assert.deepEqual(descriptor.dispatchTarget, target);
    assert.equal(Object.isFrozen(descriptor.dispatchTarget), true);
    assert.equal(serializeWorkflowSourceDescriptor(input).toString('utf8').includes('"requestId":"' + target.requestId + '"'), true);
    for (const invalid of [
      { ...input, workflowPath: '.github/workflows/other.yml' },
      { ...input, testedSha: TESTED_SHA },
      { ...input, dispatchTarget: { ...target, actorId: 0 } },
      { ...input, dispatchTarget: { ...target, requestId: 'bad' } },
      { ...input, dispatchTarget: { ...target, mergeSha: 'f'.repeat(40) } },
    ]) assert.throws(() => createWorkflowSourceDescriptor(invalid));
  });
});
