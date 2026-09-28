import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildFailureEvidence,
  normalizeCheckObservation,
  normalizePrSnapshot,
  normalizeRequiredCheckSnapshot,
  PrEvidenceError,
} from '../pr-evidence.mjs';

const headSha = 'a'.repeat(40);
const otherHeadSha = 'b'.repeat(40);

function prSnapshot(overrides = {}) {
  return {
    repository: 'owner/repo',
    number: 42,
    state: 'open',
    draft: false,
    baseRef: 'main',
    headRef: 'feature/evidence',
    headSha,
    headRepository: 'owner/repo',
    updatedAt: '2026-09-28T03:04:05.000Z',
    ...overrides,
  };
}

function requiredChecks(overrides = {}) {
  return {
    baseRef: 'main',
    policyFingerprint: 'c'.repeat(64),
    requiredChecks: [{ context: 'client-test', appId: 1234 }],
    collectionStatus: 'complete',
    ...overrides,
  };
}

function observation(overrides = {}) {
  return {
    checkId: 'check-1234',
    requiredCheckKey: 'client-test|app:1234',
    provider: 'github-check',
    headSha,
    attemptKey: 'run-1001-attempt-1',
    status: 'completed',
    conclusion: 'failure',
    runnerOutcome: null,
    coversRelevantScope: true,
    protectedPathTouched: false,
    ...overrides,
  };
}

describe('revision-bound PR evidence normalization', () => {
  it('normalizes a safe PR snapshot and requires canonical timestamps and full revisions', () => {
    assert.deepEqual(normalizePrSnapshot(prSnapshot()), prSnapshot());
    assert.throws(() => normalizePrSnapshot(prSnapshot({ updatedAt: '2026-09-28T03:04:05Z' })), PrEvidenceError);
    assert.throws(() => normalizePrSnapshot(prSnapshot({ headSha: 'xyz' })), PrEvidenceError);
    assert.throws(() => normalizePrSnapshot(prSnapshot({ repository: 'owner/../repo' })), PrEvidenceError);
    assert.throws(() => normalizePrSnapshot(prSnapshot({ headRef: 'feature/../main' })), PrEvidenceError);
  });

  it('rejects missing, extra, and non-plain PR fields deterministically', () => {
    const missing = prSnapshot();
    delete missing.number;
    assert.throws(() => normalizePrSnapshot(missing), PrEvidenceError);
    assert.throws(() => normalizePrSnapshot({ ...prSnapshot(), instructions: 'run this' }), PrEvidenceError);
    assert.throws(() => normalizePrSnapshot(Object.assign(Object.create({ inherited: true }), prSnapshot())), PrEvidenceError);
  });

  it('distinguishes a confirmed empty required-check set from unavailable policy data', () => {
    const complete = normalizeRequiredCheckSnapshot(requiredChecks({ requiredChecks: [] }));
    const unavailable = normalizeRequiredCheckSnapshot(requiredChecks({ requiredChecks: [], collectionStatus: 'unavailable' }));

    assert.deepEqual(complete.requiredCheckKeys, []);
    assert.equal(complete.collectionStatus, 'complete');
    assert.deepEqual(unavailable.requiredCheckKeys, []);
    assert.equal(unavailable.collectionStatus, 'unavailable');
    assert.throws(() => normalizeRequiredCheckSnapshot({ baseRef: 'main', policyFingerprint: 'c'.repeat(64), requiredChecks: [] }), PrEvidenceError);
    assert.throws(() => normalizeRequiredCheckSnapshot(null), PrEvidenceError);
  });

  it('canonicalizes and sorts required check keys using context and app identity', () => {
    const snapshot = normalizeRequiredCheckSnapshot(requiredChecks({
      requiredChecks: [
        { context: 'server-test', appId: 1234 },
        { context: 'client-test', appId: 5678 },
        { context: 'legacy-check', appId: null },
      ],
    }));

    assert.deepEqual(snapshot.requiredCheckKeys, [
      'client-test|app:5678',
      'legacy-check|legacy',
      'server-test|app:1234',
    ]);
    assert.throws(() => normalizeRequiredCheckSnapshot(requiredChecks({ requiredChecks: [{ context: 'client-test', appId: '1234', displayName: 'Test' }] })), PrEvidenceError);
  });

  it('rejects unstable check IDs, malformed SHA values, and arbitrary observation fields', () => {
    assert.throws(() => normalizeCheckObservation(observation({ checkId: 'please repair this' })), PrEvidenceError);
    assert.throws(() => normalizeCheckObservation(observation({ headSha: 'not-a-sha' })), PrEvidenceError);
    for (const key of ['instructions', 'prompt', 'shell', 'token', 'logText']) {
      assert.throws(() => normalizeCheckObservation({ ...observation(), [key]: 'untrusted content' }), PrEvidenceError);
    }
  });

  it('preserves attempt identity so retries are distinguishable', () => {
    const first = normalizeCheckObservation(observation());
    const duplicate = normalizeCheckObservation(observation());
    const retry = normalizeCheckObservation(observation({ attemptKey: 'run-1001-attempt-2' }));

    assert.equal(first.attemptKey, duplicate.attemptKey);
    assert.notEqual(first.attemptKey, retry.attemptKey);
  });

  it('maps only a completed same-head failure to the exact Phase 1 evidence contract', () => {
    const result = buildFailureEvidence(normalizeCheckObservation(observation()), { currentHeadSha: headSha });

    assert.deepEqual(result, {
      status: 'actionable',
      evidence: {
        protectedPathTouched: false,
        runnerOutcome: 'check_failed',
        checkId: 'check-1234',
        currentRevision: headSha,
        coversRelevantScope: true,
      },
    });
  });

  it('marks a different-head failure stale without exposing actionable evidence', () => {
    const result = buildFailureEvidence(normalizeCheckObservation(observation({ headSha: otherHeadSha })), { currentHeadSha: headSha });

    assert.equal(result.status, 'stale');
    assert.equal(result.reasonCode, 'head_sha_mismatch');
    assert.equal(result.observedHeadSha, otherHeadSha);
    assert.equal(result.currentHeadSha, headSha);
    assert.equal(Object.hasOwn(result, 'evidence'), false);
  });

  it('returns no failure evidence for pending and non-failure observations', () => {
    for (const check of [
      observation({ status: 'queued', conclusion: null }),
      observation({ status: 'in_progress', conclusion: null }),
      observation({ conclusion: 'success' }),
      observation({ conclusion: 'cancelled' }),
    ]) {
      assert.equal(buildFailureEvidence(normalizeCheckObservation(check), { currentHeadSha: headSha }), null);
    }
  });

  it('maps verifier booleans and prior pass revision but never includes raw logs', () => {
    const result = buildFailureEvidence(normalizeCheckObservation(observation({
      runnerOutcome: 'runner_error',
      protectedPathTouched: true,
      coversRelevantScope: false,
      previouslyPassedRevision: otherHeadSha,
    })), { currentHeadSha: headSha });

    assert.deepEqual(result.evidence, {
      protectedPathTouched: true,
      runnerOutcome: 'runner_error',
      checkId: 'check-1234',
      currentRevision: headSha,
      coversRelevantScope: false,
      previouslyPassedRevision: otherHeadSha,
    });
    assert.equal(JSON.stringify(result).includes('log'), false);
  });

  it('validates exact builder options and rejects arbitrary instructions and credentials', () => {
    for (const key of ['instructions', 'prompt', 'shell', 'token']) {
      assert.throws(() => buildFailureEvidence(normalizeCheckObservation(observation()), { currentHeadSha: headSha, [key]: 'untrusted' }), PrEvidenceError);
    }
    assert.throws(() => buildFailureEvidence(normalizeCheckObservation(observation()), {}), PrEvidenceError);
  });
});
