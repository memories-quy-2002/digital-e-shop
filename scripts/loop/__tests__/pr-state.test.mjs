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
  recordCheckObservation,
  recordFlakyRetry,
  recordRepairRequest,
  savePrBabysitterState,
} from '../pr-state.mjs';

const temporaryRoots = new Set();
const headSha = 'a'.repeat(40);
const nextHeadSha = 'b'.repeat(40);

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
    headRef: 'feature/babysitter',
    headSha,
    headRepository: 'Owner/Repo',
    updatedAt: '2026-09-28T03:04:05.000Z',
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

afterEach(async () => {
  for (const root of temporaryRoots) await rm(root, { recursive: true, force: true });
  temporaryRoots.clear();
});

describe('PR babysitter state persistence', () => {
  it('creates compact versioned state from a normalized PR snapshot and rejects prompt fields', () => {
    const state = createPrBabysitterState(snapshot());

    assert.equal(state.schemaVersion, 1);
    assert.equal(state.repository, 'owner/repo');
    assert.equal(state.prNumber, 42);
    assert.equal(state.branch, 'feature/babysitter');
    assert.equal(state.baseRef, 'main');
    assert.equal(state.headSha, headSha);
    assert.equal(state.phase, 'observe');
    assert.deepEqual(state.observedAttemptKeys, []);
    assert.deepEqual(state.flakyRetryCounts, {});
    assert.equal(state.repairRequestCount, 0);
    assert.equal(Object.hasOwn(state, 'prompt'), false);
    assert.throws(
      () => createPrBabysitterState({ ...snapshot(), prompt: 'untrusted task body' }),
      PrBabysitterStateValidationError,
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

  it('rolls revision-scoped observations and retries on a new head while preserving aggregate counters', () => {
    let state = createPrBabysitterState(snapshot());
    state = recordCheckObservation(state, observation());
    state = recordFlakyRetry(state, 'check-1234');
    state = recordRepairRequest(state, {
      reasonCode: 'deterministic_failure',
      failureFingerprint: 'c'.repeat(64),
      escalationReason: 'repair_budget_exhausted',
    });
    const countersBeforeRollover = state.telemetry;
    const repairBudgetBeforeRollover = state.repairRequestCount;

    const next = recordCheckObservation(state, observation({ headSha: nextHeadSha, attemptKey: 'run-2002-attempt-1' }));

    assert.equal(next.headSha, nextHeadSha);
    assert.equal(next.phase, 'observe');
    assert.deepEqual(next.observedAttemptKeys, ['run-2002-attempt-1']);
    assert.deepEqual(next.flakyRetryCounts, {});
    assert.equal(next.lastActionableFailureFingerprint, null);
    assert.equal(next.lastDecisionReasonCode, null);
    assert.equal(next.escalationReason, null);
    assert.equal(next.repairRequestCount, repairBudgetBeforeRollover);
    assert.equal(next.telemetry.observationsRecorded, countersBeforeRollover.observationsRecorded + 1);
    assert.equal(next.telemetry.flakyRetriesRecorded, countersBeforeRollover.flakyRetriesRecorded);
    assert.equal(next.telemetry.repairRequestsRecorded, countersBeforeRollover.repairRequestsRecorded);
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
