import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { mkdtemp, mkdir, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  PrBabysitterStateCorruptError,
  PrBabysitterStateNotFoundError,
  PrBabysitterStatePathError,
  PrBabysitterStateValidationError,
  createPrBabysitterState,
  loadPrBabysitterState,
  reconcilePrBabysitterState,
  recordActionableFailure,
  recordCheckObservation,
  recordFlakyRetry,
  recordRepairRequest,
  savePrBabysitterState,
} from '../pr-state.mjs';

const temporaryRoots = new Set();
const headSha = 'a'.repeat(40);
const nextHeadSha = 'b'.repeat(40);
const baseSha = 'd'.repeat(40);
const mergeSha = 'e'.repeat(40);
const nextBaseSha = 'f'.repeat(40);
const nextMergeSha = '1'.repeat(40);

async function createRepoFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'digital-e-pr-state-'));
  temporaryRoots.add(root);
  return root;
}

function snapshot(overrides = {}) {
  return {
    repository: 'Owner/Repo',
    number: 42,
    state: 'open',
    draft: false,
    baseRef: 'main',
    baseSha,
    headRef: 'feature/babysitter',
    headSha,
    mergeSha,
    headRepository: 'Owner/Repo',
    updatedAt: '2026-09-28T03:04:05.000Z',
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

afterEach(async () => {
  for (const root of temporaryRoots) await rm(root, { recursive: true, force: true });
  temporaryRoots.clear();
});

describe('PR babysitter state persistence', () => {
  it('creates compact versioned state from a normalized PR snapshot and rejects prompt fields', () => {
    const state = createPrBabysitterState(snapshot());

    assert.equal(state.schemaVersion, 3);
    assert.equal(state.repository, 'owner/repo');
    assert.equal(state.prNumber, 42);
    assert.equal(state.branch, 'feature/babysitter');
    assert.equal(state.baseRef, 'main');
    assert.equal(state.baseSha, baseSha);
    assert.equal(state.headSha, headSha);
    assert.equal(state.mergeSha, mergeSha);
    assert.equal(state.phase, 'observe');
    assert.deepEqual(state.observedAttemptKeys, []);
    assert.deepEqual(state.flakyRetryCounts, {});
    assert.deepEqual(state.actionableFailureCounts, {});
    assert.deepEqual(state.actionableFailureAttemptFingerprints, {});
    assert.equal(state.repairRequestCount, 0);
    assert.equal(Object.hasOwn(state, 'prompt'), false);
    assert.throws(
      () => createPrBabysitterState({ ...snapshot(), prompt: 'untrusted task body' }),
      PrBabysitterStateValidationError,
    );
  });

  it('exposes the bounded state schema through a portable contract module', async () => {
    const contract = await import('../pr-state-contract.mjs');
    const state = contract.createPrBabysitterState(snapshot());

    assert.equal(contract.validatePrBabysitterState(state), state);
    assert.equal(state.schemaVersion, 3);
    assert.throws(
      () => contract.validatePrBabysitterState({ ...state, prompt: 'untrusted task body' }),
      contract.PrBabysitterStateValidationError,
    );
  });

  it('atomically round-trips state at a repository and PR-derived path', async () => {
    const root = await createRepoFixture();
    const state = createPrBabysitterState(snapshot());

    await savePrBabysitterState(root, state);

    const directory = path.join(root, '.loop', 'pr');
    assert.deepEqual(await readdir(directory), ['owner-repo-42.json']);
    assert.deepEqual(await loadPrBabysitterState(root, 'owner/repo', 42), state);
  });

  it('rejects unsafe repository names and PR numbers before deriving a state path', async () => {
    const root = await createRepoFixture();

    await assert.rejects(loadPrBabysitterState(root, '../escape/repo', 42), PrBabysitterStateValidationError);
    await assert.rejects(loadPrBabysitterState(root, 'owner/repo', 0), PrBabysitterStateValidationError);
  });

  it('records an observed attempt once and treats duplicate observations idempotently', () => {
    const initial = createPrBabysitterState(snapshot());
    const first = recordCheckObservation(initial, observation());
    const duplicate = recordCheckObservation(first, observation());

    assert.deepEqual(first.observedAttemptKeys, ['run-1001-attempt-1']);
    assert.deepEqual(duplicate.observedAttemptKeys, first.observedAttemptKeys);
    assert.equal(duplicate.telemetry.observationsRecorded, 1);
    assert.deepEqual(duplicate, first);
    assert.deepEqual(initial.observedAttemptKeys, []);
  });

  it('counts failures per fingerprint, increments only for a new attempt, and deduplicates repeat delivery', () => {
    let state = createPrBabysitterState(snapshot());
    state = recordCheckObservation(state, observation());
    const firstFailure = {
      headSha,
      baseSha,
      mergeSha,
      attemptKey: 'run-1001-attempt-1',
      failureFingerprint: 'c'.repeat(64),
    };
    const first = recordActionableFailure(state, firstFailure);
    const duplicate = recordActionableFailure(first, firstFailure);

    assert.deepEqual(first.actionableFailureCounts, { ['c'.repeat(64)]: 1 });
    assert.deepEqual(first.actionableFailureAttemptFingerprints, { 'run-1001-attempt-1': 'c'.repeat(64) });
    assert.deepEqual(duplicate, first);

    state = recordCheckObservation(first, observation({ attemptKey: 'run-1001-attempt-2' }));
    state = recordActionableFailure(state, { ...firstFailure, attemptKey: 'run-1001-attempt-2' });
    assert.equal(state.actionableFailureCounts['c'.repeat(64)], 2);

    state = recordCheckObservation(state, observation({ attemptKey: 'run-1001-attempt-3', failureFingerprint: 'd'.repeat(64) }));
    state = recordActionableFailure(state, {
      headSha,
      baseSha,
      mergeSha,
      attemptKey: 'run-1001-attempt-3',
      failureFingerprint: 'd'.repeat(64),
    });
    assert.deepEqual(state.actionableFailureCounts, { ['c'.repeat(64)]: 2, ['d'.repeat(64)]: 1 });
  });

  it('rejects unobserved, stale, malformed, and conflicting actionable failure records', () => {
    let state = createPrBabysitterState(snapshot());
    state = recordCheckObservation(state, observation());
    const firstFailure = {
      headSha,
      baseSha,
      mergeSha,
      attemptKey: 'run-1001-attempt-1',
      failureFingerprint: 'c'.repeat(64),
    };
    state = recordActionableFailure(state, firstFailure);

    assert.throws(
      () => recordActionableFailure(state, { ...firstFailure, failureFingerprint: 'd'.repeat(64) }),
      PrBabysitterStateValidationError,
    );
    assert.throws(
      () => recordActionableFailure(state, { ...firstFailure, attemptKey: 'unobserved-attempt' }),
      PrBabysitterStateValidationError,
    );
    assert.throws(
      () => recordActionableFailure(state, { ...firstFailure, headSha: nextHeadSha }),
      PrBabysitterStateValidationError,
    );
    assert.throws(
      () => recordActionableFailure(state, { ...firstFailure, baseSha: nextBaseSha }),
      PrBabysitterStateValidationError,
    );
    assert.throws(
      () => recordActionableFailure(state, { ...firstFailure, mergeSha: nextMergeSha }),
      PrBabysitterStateValidationError,
    );
    assert.throws(
      () => recordActionableFailure(state, { ...firstFailure, failureFingerprint: 'invalid' }),
      PrBabysitterStateValidationError,
    );
  });

  it('rolls revision-scoped observations and retries on a new head while preserving aggregate counters', () => {
    let state = createPrBabysitterState(snapshot());
    state = recordCheckObservation(state, observation());
    state = recordActionableFailure(state, {
      headSha,
      baseSha,
      mergeSha,
      attemptKey: 'run-1001-attempt-1',
      failureFingerprint: 'c'.repeat(64),
    });
    state = recordFlakyRetry(state, 'check-1234');
    state = recordRepairRequest(state, {
      reasonCode: 'deterministic_failure',
      failureFingerprint: 'c'.repeat(64),
      escalationReason: 'repair_budget_exhausted',
    });
    const countersBeforeRollover = state.telemetry;
    const repairBudgetBeforeRollover = state.repairRequestCount;

    const rolledState = reconcilePrBabysitterState(state, snapshot({
      headSha: nextHeadSha,
      mergeSha: nextMergeSha,
    }));
    const next = recordCheckObservation(rolledState, observation({
      headSha: nextHeadSha,
      mergeSha: nextMergeSha,
      testedSha: nextMergeSha,
      attemptKey: 'run-2002-attempt-1',
    }));

    assert.equal(next.headSha, nextHeadSha);
    assert.equal(next.baseSha, baseSha);
    assert.equal(next.mergeSha, nextMergeSha);
    assert.equal(next.phase, 'observe');
    assert.deepEqual(next.observedAttemptKeys, ['run-2002-attempt-1']);
    assert.deepEqual(next.flakyRetryCounts, {});
    assert.deepEqual(next.actionableFailureCounts, {});
    assert.deepEqual(next.actionableFailureAttemptFingerprints, {});
    assert.equal(next.lastActionableFailureFingerprint, null);
    assert.equal(next.lastDecisionReasonCode, null);
    assert.equal(next.escalationReason, null);
    assert.equal(next.repairRequestCount, repairBudgetBeforeRollover);
    assert.equal(next.telemetry.observationsRecorded, countersBeforeRollover.observationsRecorded + 1);
    assert.equal(next.telemetry.flakyRetriesRecorded, countersBeforeRollover.flakyRetriesRecorded);
    assert.equal(next.telemetry.repairRequestsRecorded, countersBeforeRollover.repairRequestsRecorded);
  });

  it('rolls revision-scoped state when the base or merge SHA changes without a head change', () => {
    let state = createPrBabysitterState(snapshot());
    state = recordCheckObservation(state, observation());
    state = recordFlakyRetry(state, 'check-1234');

    const rolledState = reconcilePrBabysitterState(state, snapshot({
      baseSha: nextBaseSha,
      mergeSha: nextMergeSha,
    }));
    const next = recordCheckObservation(rolledState, observation({
      baseSha: nextBaseSha,
      mergeSha: nextMergeSha,
      testedSha: nextMergeSha,
      attemptKey: 'run-2002-attempt-1',
    }));

    assert.equal(next.headSha, headSha);
    assert.equal(next.baseSha, nextBaseSha);
    assert.equal(next.mergeSha, nextMergeSha);
    assert.deepEqual(next.observedAttemptKeys, ['run-2002-attempt-1']);
    assert.deepEqual(next.flakyRetryCounts, {});
    assert.equal(next.telemetry.flakyRetriesRecorded, 1);
  });

  it('rejects stale check observations instead of letting them roll state back or reset counters', () => {
    let state = createPrBabysitterState(snapshot({
      headSha: nextHeadSha,
      mergeSha: nextMergeSha,
    }));
    const currentObservation = observation({
      headSha: nextHeadSha,
      mergeSha: nextMergeSha,
      testedSha: nextMergeSha,
      attemptKey: 'run-2002-attempt-1',
    });
    state = recordCheckObservation(state, currentObservation);
    state = recordActionableFailure(state, {
      headSha: nextHeadSha,
      baseSha,
      mergeSha: nextMergeSha,
      attemptKey: currentObservation.attemptKey,
      failureFingerprint: currentObservation.failureFingerprint,
    });
    const countsBeforeStaleObservation = state.actionableFailureCounts;

    assert.throws(
      () => recordCheckObservation(state, observation()),
      /does not match the current PR state/i,
    );
    assert.equal(state.headSha, nextHeadSha);
    assert.deepEqual(state.actionableFailureCounts, countsBeforeStaleObservation);
    assert.deepEqual(state.observedAttemptKeys, [currentObservation.attemptKey]);
  });

  it('reconciliation requires the same PR identity before rolling tuple-scoped state', () => {
    const state = createPrBabysitterState(snapshot());

    assert.throws(
      () => reconcilePrBabysitterState(state, snapshot({ number: 43, headSha: nextHeadSha })),
      /repository\/PR identity/i,
    );
  });

  it('tracks flaky retries per check and validates IDs', () => {
    const initial = createPrBabysitterState(snapshot());
    const once = recordFlakyRetry(initial, 'check-1234');
    const twice = recordFlakyRetry(once, 'check-1234');

    assert.deepEqual(once.flakyRetryCounts, { 'check-1234': 1 });
    assert.deepEqual(twice.flakyRetryCounts, { 'check-1234': 2 });
    assert.equal(twice.telemetry.flakyRetriesRecorded, 2);
    assert.equal(recordFlakyRetry(initial, 'constructor').flakyRetryCounts.constructor, 1);
    assert.throws(() => recordFlakyRetry(initial, '../prompt'), PrBabysitterStateValidationError);
  });

  it('records a bounded repair request without persisting prompt-bearing fields', () => {
    const initial = createPrBabysitterState(snapshot());
    const updated = recordRepairRequest(initial, {
      reasonCode: 'deterministic_failure',
      failureFingerprint: 'c'.repeat(64),
      engineeringTaskId: 'github-issue-241',
    });

    assert.equal(updated.repairRequestCount, 1);
    assert.equal(updated.lastActionableFailureFingerprint, 'c'.repeat(64));
    assert.equal(updated.lastDecisionReasonCode, 'deterministic_failure');
    assert.equal(updated.engineeringTaskId, 'github-issue-241');
    assert.equal(updated.telemetry.repairRequestsRecorded, 1);
    assert.throws(
      () => recordRepairRequest(initial, { reasonCode: 'deterministic_failure', prompt: 'raw prompt' }),
      PrBabysitterStateValidationError,
    );
  });

  it('fails closed on missing and corrupt state without creating a replacement', async () => {
    const root = await createRepoFixture();

    await assert.rejects(loadPrBabysitterState(root, 'owner/repo', 42), PrBabysitterStateNotFoundError);
    const directory = path.join(root, '.loop', 'pr');
    await mkdir(directory, { recursive: true });
    const file = path.join(directory, 'owner-repo-42.json');
    await writeFile(file, '{ malformed', 'utf8');
    await assert.rejects(loadPrBabysitterState(root, 'owner/repo', 42), PrBabysitterStateCorruptError);
    assert.equal(await import('node:fs/promises').then(({ readFile }) => readFile(file, 'utf8')), '{ malformed');

    const legacyState = createPrBabysitterState(snapshot());
    legacyState.schemaVersion = 2;
    const legacySerialized = JSON.stringify(legacyState);
    await writeFile(file, legacySerialized, 'utf8');
    await assert.rejects(loadPrBabysitterState(root, 'owner/repo', 42), PrBabysitterStateCorruptError);
    assert.equal(await import('node:fs/promises').then(({ readFile }) => readFile(file, 'utf8')), legacySerialized);
  });

  it('rejects a PR state directory symlink escape', async (t) => {
    const root = await createRepoFixture();
    const outside = await createRepoFixture();
    await mkdir(path.join(root, '.loop'), { recursive: true });

    try {
      await symlink(outside, path.join(root, '.loop', 'pr'), 'junction');
    } catch (error) {
      if (['EPERM', 'EACCES', 'ENOSYS'].includes(error.code)) {
        t.skip(`host does not allow temporary directory links: ${error.code}`);
        return;
      }
      throw error;
    }

    await assert.rejects(
      savePrBabysitterState(root, createPrBabysitterState(snapshot())),
      PrBabysitterStatePathError,
    );
  });
});
