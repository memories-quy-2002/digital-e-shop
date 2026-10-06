import assert from 'node:assert/strict';
import { it } from 'node:test';
import { selectUniqueRerunTarget } from '../stage1-target.mjs';

function errorWithCode(code) {
  return (error) => error?.code === code;
}

it('requires a retry-check decision before selecting a rerun target', () => {
  assert.throws(() => selectUniqueRerunTarget({ decision: { action: 'wait' }, candidates: [{ runId: 17 }] }),
    errorWithCode('retry_decision_required'));
});

it('refuses when no validated rerun target matches the failed observation', () => {
  assert.throws(() => selectUniqueRerunTarget({ decision: { action: 'retry-check' }, candidates: [] }),
    errorWithCode('rerun_target_ambiguous'));
});

it('does not choose between two matching run attempts', () => {
  assert.throws(() => selectUniqueRerunTarget({ decision: { action: 'retry-check' }, candidates: [{ runId: 17 }, { runId: 18 }] }),
    errorWithCode('rerun_target_ambiguous'));
});

it('returns the sole validated target without changing or widening its scope', () => {
  const target = Object.freeze({
    repositoryId: 9,
    prNumber: 2,
    testedSha: 'a'.repeat(40),
    runId: 17,
    runAttempt: 1,
    failedJobIds: Object.freeze([31]),
  });
  assert.strictEqual(selectUniqueRerunTarget({ decision: { action: 'retry-check' }, candidates: [target] }), target);
});

it('fails closed for missing or malformed candidate collections', () => {
  const decision = { action: 'retry-check' };
  assert.throws(() => selectUniqueRerunTarget({ decision }), errorWithCode('rerun_target_ambiguous'));
  assert.throws(() => selectUniqueRerunTarget({ decision, candidates: null }), errorWithCode('rerun_target_ambiguous'));
});
