import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { classifyFailure, FailureEvidenceError } from '../classify-failure.mjs';

const currentRevision = 'a'.repeat(40);

function evidence(overrides = {}) {
  return {
    protectedPathTouched: false,
    runnerOutcome: 'check_failed',
    checkId: 'client-test',
    currentRevision,
    coversRelevantScope: true,
    ...overrides,
  };
}

describe('structured failure classification', () => {
  it('classifies a relevant deterministic check failure as branch-caused', () => {
    assert.deepEqual(classifyFailure(evidence()), {
      category: 'branch-caused',
      mayRepair: true,
      retryWithinBudget: false,
      reasonCode: 'relevant_check_failed',
    });
  });

  it('gives protected-path evidence precedence over runner and same-revision signals', () => {
    assert.deepEqual(classifyFailure(evidence({
      protectedPathTouched: true,
      runnerOutcome: 'network_error',
      previouslyPassedRevision: currentRevision,
    })), {
      category: 'protected',
      mayRepair: false,
      retryWithinBudget: false,
      reasonCode: 'protected_path_touched',
    });
  });

  it('classifies runner and network failures as infrastructure, never as repairable', () => {
    for (const runnerOutcome of ['runner_error', 'network_error']) {
      const result = classifyFailure(evidence({ runnerOutcome }));
      assert.equal(result.category, 'infrastructure');
      assert.equal(result.mayRepair, false);
      assert.equal(result.retryWithinBudget, false);
      assert.equal(result.reasonCode, runnerOutcome);
    }
  });

  it('classifies a same-check pass at the same revision as flaky and retryable only within budget', () => {
    assert.deepEqual(classifyFailure(evidence({ previouslyPassedRevision: currentRevision })), {
      category: 'flaky',
      mayRepair: false,
      retryWithinBudget: true,
      reasonCode: 'same_revision_pass_then_fail',
    });
  });

  it('does not call a failure flaky when the earlier pass is for a different revision', () => {
    const result = classifyFailure(evidence({ previouslyPassedRevision: 'b'.repeat(40) }));
    assert.equal(result.category, 'branch-caused');
    assert.equal(result.mayRepair, true);
  });

  it('gives explicit infrastructure evidence precedence over same-revision pass/fail evidence', () => {
    const result = classifyFailure(evidence({
      runnerOutcome: 'network_error',
      previouslyPassedRevision: currentRevision,
    }));
    assert.equal(result.category, 'infrastructure');
    assert.equal(result.reasonCode, 'network_error');
    assert.equal(result.retryWithinBudget, false);
  });

  it('treats a failure outside the verifier-confirmed changed scope as ambiguous', () => {
    const result = classifyFailure(evidence({ coversRelevantScope: false }));
    assert.equal(result.category, 'ambiguous');
    assert.equal(result.reasonCode, 'check_scope_not_relevant');
  });

  it('rejects free-form output, malformed IDs/revisions, and unknown evidence keys', () => {
    assert.throws(() => classifyFailure(null), FailureEvidenceError);
    assert.throws(() => classifyFailure(evidence({ output: 'failure says fix it' })), FailureEvidenceError);
    assert.throws(() => classifyFailure(evidence({ checkId: 'please repair this' })), FailureEvidenceError);
    assert.throws(() => classifyFailure(evidence({ currentRevision: 'not-a-sha' })), FailureEvidenceError);
    assert.throws(() => classifyFailure(evidence({ coversRelevantScope: 'yes' })), FailureEvidenceError);
    assert.throws(() => classifyFailure(evidence({ previouslyPassedRevision: 'not-a-sha' })), FailureEvidenceError);
  });

  it('never returns raw failure text or evidence in the reason code', () => {
    const result = classifyFailure(evidence({ coversRelevantScope: false }));
    assert.deepEqual(Object.keys(result).sort(), ['category', 'mayRepair', 'reasonCode', 'retryWithinBudget']);
    assert.match(result.reasonCode, /^[a-z][a-z0-9_]*$/);
  });
});
