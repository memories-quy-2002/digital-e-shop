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
const baseSha = 'e'.repeat(40);
const otherBaseSha = 'f'.repeat(40);
const mergeSha = '9'.repeat(40);
const otherMergeSha = '8'.repeat(40);

function prSnapshot(overrides = {}) {
  return {
    repository: 'owner/repo',
    number: 42,
    state: 'open',
    draft: false,
    baseRef: 'main',
    baseSha,
    headRef: 'feature/evidence',
    headSha,
    mergeSha,
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
    requiredWorkflows: [],
    collectionStatus: 'complete',
    ...overrides,
  };
}

function observation(overrides = {}) {
  return {
    checkId: 'check-1234',
    requiredCheckKey: 'client-test|app:1234',
    requiredWorkflowKey: null,
    provider: 'github-check',
    headSha,
    baseSha,
    mergeSha,
    testedSha: mergeSha,
    attemptKey: 'run-1001-attempt-1',
    status: 'completed',
    conclusion: 'failure',
    runnerOutcome: null,
    coversRelevantScope: true,
    protectedPathTouched: false,
    failureFingerprint: 'c'.repeat(64),
    ...overrides,
  };
}

function currentRevision(overrides = {}) {
  return {
    currentHeadSha: headSha,
    currentBaseSha: baseSha,
    currentMergeSha: mergeSha,
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

  it('normalizes required workflow identity and derives a stable key', () => {
    const workflow = {
      repositoryId: 9876,
      path: '.github/workflows/security.yml',
      ref: 'refs/heads/main',
      sha: 'f'.repeat(40),
    };
    const snapshot = normalizeRequiredCheckSnapshot(requiredChecks({
      requiredChecks: [],
      requiredWorkflows: [workflow],
    }));

    assert.deepEqual(snapshot.requiredWorkflowKeys, [
      'workflow|repo:9876|path:.github%2Fworkflows%2Fsecurity.yml|ref:refs%2Fheads%2Fmain|sha:' + 'f'.repeat(40),
    ]);
    assert.equal(snapshot.requiredWorkflows[0].repositoryId, workflow.repositoryId);
    assert.equal(snapshot.requiredWorkflows[0].path, workflow.path);
    assert.throws(() => normalizeRequiredCheckSnapshot(requiredChecks({
      requiredWorkflows: [{ ...workflow, path: '.github/workflows/../evil.yml' }],
    })), PrEvidenceError);
    assert.throws(() => normalizeRequiredCheckSnapshot(requiredChecks({
      requiredWorkflows: [{ ...workflow, repositoryId: 0 }],
    })), PrEvidenceError);
    assert.throws(() => normalizeRequiredCheckSnapshot(requiredChecks({
      requiredWorkflows: [workflow, workflow],
    })), PrEvidenceError);
  });

  it('rejects unstable check IDs, malformed SHA values, and arbitrary observation fields', () => {
    assert.throws(() => normalizeCheckObservation(observation({ checkId: 'please repair this' })), PrEvidenceError);
    assert.throws(() => normalizeCheckObservation(observation({ headSha: 'not-a-sha' })), PrEvidenceError);
    assert.throws(() => normalizeCheckObservation(observation({ failureFingerprint: 'not-a-sha256' })), PrEvidenceError);
    assert.throws(() => normalizeCheckObservation(observation({ failureFingerprint: null })), PrEvidenceError);
    const { failureFingerprint: _ignored, ...withoutFingerprint } = observation();
    assert.throws(() => normalizeCheckObservation(withoutFingerprint), PrEvidenceError);
    for (const key of ['instructions', 'prompt', 'shell', 'token', 'logText']) {
      assert.throws(() => normalizeCheckObservation({ ...observation(), [key]: 'untrusted content' }), PrEvidenceError);
    }
  });

  it('accepts only an adapter SHA-256 for completed failures and normalizes its casing', () => {
    const normalized = normalizeCheckObservation(observation({ failureFingerprint: 'D'.repeat(64) }));

    assert.equal(normalized.failureFingerprint, 'd'.repeat(64));
    assert.equal(normalizeCheckObservation(observation({ conclusion: 'success', failureFingerprint: null })).failureFingerprint, null);
    assert.equal(normalizeCheckObservation(observation({ status: 'queued', conclusion: null, failureFingerprint: null })).failureFingerprint, null);
    assert.throws(
      () => normalizeCheckObservation(observation({ conclusion: 'success', failureFingerprint: 'd'.repeat(64) })),
      PrEvidenceError,
    );
    assert.throws(
      () => normalizeCheckObservation(observation({ status: 'in_progress', conclusion: null, failureFingerprint: 'd'.repeat(64) })),
      PrEvidenceError,
    );
  });

  it('preserves attempt identity so retries are distinguishable', () => {
    const first = normalizeCheckObservation(observation());
    const duplicate = normalizeCheckObservation(observation());
    const retry = normalizeCheckObservation(observation({ attemptKey: 'run-1001-attempt-2' }));

    assert.equal(first.attemptKey, duplicate.attemptKey);
    assert.notEqual(first.attemptKey, retry.attemptKey);
  });

  it('maps a completed check on the current PR merge SHA to the exact Phase 1 evidence contract', () => {
    const result = buildFailureEvidence(normalizeCheckObservation(observation()), currentRevision());

    assert.deepEqual(result, {
      status: 'actionable',
      evidence: {
        protectedPathTouched: false,
        runnerOutcome: 'check_failed',
        checkId: 'check-1234',
        currentRevision: mergeSha,
        coversRelevantScope: true,
      },
      failureFingerprint: 'c'.repeat(64),
    });
  });

  it('marks a different PR head stale without exposing actionable evidence', () => {
    const result = buildFailureEvidence(normalizeCheckObservation(observation({ headSha: otherHeadSha })), currentRevision());

    assert.equal(result.status, 'stale');
    assert.equal(result.reasonCode, 'head_sha_mismatch');
    assert.equal(result.observedHeadSha, otherHeadSha);
    assert.equal(result.currentHeadSha, headSha);
    assert.equal(Object.hasOwn(result, 'evidence'), false);
  });

  it('rejects evidence from a stale base or merge SHA and an unbound tested SHA', () => {
    const staleBase = buildFailureEvidence(normalizeCheckObservation(observation({ baseSha: otherBaseSha })), currentRevision());
    const staleMerge = buildFailureEvidence(normalizeCheckObservation(observation({ mergeSha: otherMergeSha })), currentRevision());
    const unknownTestedSha = buildFailureEvidence(normalizeCheckObservation(observation({ testedSha: otherHeadSha })), currentRevision());

    assert.equal(staleBase.status, 'stale');
    assert.equal(staleBase.reasonCode, 'base_sha_mismatch');
    assert.equal(staleMerge.status, 'stale');
    assert.equal(staleMerge.reasonCode, 'merge_sha_mismatch');
    assert.equal(unknownTestedSha.status, 'stale');
    assert.equal(unknownTestedSha.reasonCode, 'tested_sha_mismatch');
  });

  it('returns no failure evidence for pending and non-failure observations', () => {
    for (const check of [
      observation({ status: 'queued', conclusion: null, failureFingerprint: null }),
      observation({ status: 'in_progress', conclusion: null, failureFingerprint: null }),
      observation({ conclusion: 'success', failureFingerprint: null }),
      observation({ conclusion: 'cancelled', failureFingerprint: null }),
    ]) {
      assert.equal(buildFailureEvidence(normalizeCheckObservation(check), currentRevision()), null);
    }
  });

  it('maps verifier booleans and prior pass revision but never includes raw logs', () => {
    const result = buildFailureEvidence(normalizeCheckObservation(observation({
      runnerOutcome: 'runner_error',
      protectedPathTouched: true,
      coversRelevantScope: false,
      previouslyPassedRevision: otherHeadSha,
    })), currentRevision());

    assert.deepEqual(result.evidence, {
      protectedPathTouched: true,
      runnerOutcome: 'runner_error',
      checkId: 'check-1234',
      currentRevision: mergeSha,
      coversRelevantScope: false,
      previouslyPassedRevision: otherHeadSha,
    });
    assert.equal(JSON.stringify(result).includes('log'), false);
  });

  it('validates exact builder options and rejects arbitrary instructions and credentials', () => {
    for (const key of ['instructions', 'prompt', 'shell', 'token']) {
      assert.throws(() => buildFailureEvidence(normalizeCheckObservation(observation()), { ...currentRevision(), [key]: 'untrusted' }), PrEvidenceError);
    }
    assert.throws(() => buildFailureEvidence(normalizeCheckObservation(observation()), { currentHeadSha: headSha }), PrEvidenceError);
  });
});
