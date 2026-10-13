import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { TaskRecordValidationError, validateTaskRecord } from '../tasks/contracts.mjs';

function record(overrides = {}) {
  return {
    schemaVersion: 2,
    key: { repositoryId: 1234, issueNumber: 42, generation: 1 },
    taskId: 'repo-1234-issue-42-g1',
    requestDigest: 'a'.repeat(64),
    acceptanceIds: ['tests', 'types'],
    sourceRevision: 'b'.repeat(40),
    policyRevision: 'c'.repeat(40),
    state: 'queued',
    version: 1,
    attempt: 0,
    epoch: 0,
    deadline: '2026-10-14T00:00:00.000Z',
    budgets: { modelCalls: 0, repairs: 0, deliveries: 0, lastModelTokenUsed: null },
    links: { loopStateTaskId: 'repo-1234-issue-42-g1', pr: null },
    outcomeReason: null,
    confirmedMergeSha: null,
    ...overrides,
  };
}

describe('TaskRecord contract', () => {
  it('accepts bounded identity and lifecycle metadata without mutating input', () => {
    const input = record();
    const output = validateTaskRecord(input);
    assert.deepEqual(output, input);
    assert.notEqual(output, input);
  });

  it('fails closed for unsupported schema versions, missing records, and corrupt shapes', () => {
    assert.throws(() => validateTaskRecord(null), TaskRecordValidationError);
    assert.throws(() => validateTaskRecord({ ...record(), schemaVersion: 1 }), /schemaVersion/);
    assert.throws(() => validateTaskRecord({ ...record(), extra: 'raw issue body' }), /unsupported|unknown/i);
    assert.throws(() => validateTaskRecord({ ...record(), requestDigest: 'short' }), TaskRecordValidationError);
    assert.throws(() => validateTaskRecord({ ...record(), acceptanceIds: ['same', 'same'] }), TaskRecordValidationError);
  });

  it('rejects unsafe identity, timestamps, counters, and prompt-bearing fields', () => {
    assert.throws(() => validateTaskRecord({ ...record(), taskId: '../escape' }), TaskRecordValidationError);
    assert.throws(() => validateTaskRecord({ ...record(), deadline: 'tomorrow' }), TaskRecordValidationError);
    assert.throws(() => validateTaskRecord({ ...record(), budgets: { modelCalls: -1, repairs: 0, deliveries: 0, lastModelTokenUsed: null } }), TaskRecordValidationError);
    assert.throws(() => validateTaskRecord({ ...record(), prompt: 'private text' }), TaskRecordValidationError);
  });

  it('binds taskId and linked LoopState ID to the repository, issue, and generation key', () => {
    assert.throws(() => validateTaskRecord({ ...record(), taskId: 'repo-1234-issue-43-g1' }), TaskRecordValidationError);
    assert.throws(() => validateTaskRecord({ ...record(), links: { loopStateTaskId: 'other-task', pr: null } }), TaskRecordValidationError);
    assert.throws(() => validateTaskRecord({ ...record(), key: { repositoryId: 1234, issueNumber: 43, generation: 1 } }), TaskRecordValidationError);
  });

  it('rejects merged records whose PR tuple contradicts the confirmed SHA', () => {
    assert.throws(() => validateTaskRecord({ ...record(), state: 'merged', confirmedMergeSha: 'd'.repeat(40) }), TaskRecordValidationError);
  });
});
