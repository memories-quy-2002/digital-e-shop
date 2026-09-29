import assert from 'node:assert/strict';
import { afterEach, before, describe, it } from 'node:test';
import { mkdtemp, mkdir, realpath, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { loadLoopPolicy } from '../policy.mjs';
import {
  LoopStateCorruptError,
  LoopStateNotFoundError,
  LoopStatePathError,
  LoopStateValidationError,
  createLoopState,
  evaluateBudgets,
  finishCIRunAttempt,
  finishCIRunAttemptInRepository,
  loadLoopState,
  recordCIRun,
  recordFailure,
  recordTokenUsage,
  reserveCIRunAttempt,
  reserveCIRunAttemptInRepository,
  saveLoopState,
} from '../state.mjs';

const temporaryRoots = new Set();
let policy;

before(async () => {
  policy = await loadLoopPolicy();
});

async function createRepoFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'digital-e-state-'));
  temporaryRoots.add(root);
  return root;
}

function createState(overrides = {}) {
  return createLoopState({
    taskId: 'github-issue-241',
    branch: 'codex/loop-foundation',
    baseSha: 'a'.repeat(40),
    headSha: 'b'.repeat(40),
    risk: 'low',
    acceptanceCriteria: ['types', 'tests'],
    policy,
    ...overrides,
  });
}

function withStopConditions(overrides) {
  return {
    ...policy,
    stopConditions: { ...policy.stopConditions, ...overrides },
  };
}

afterEach(async () => {
  const roots = [...temporaryRoots];
  temporaryRoots.clear();
  const tempDirectory = await realpath(os.tmpdir());

  for (const root of roots) {
    const resolved = await realpath(root);
    assert.equal(path.dirname(resolved), tempDirectory);
    await rm(resolved, { recursive: true, force: true });
  }
});

describe('loop state persistence', () => {
  it('creates a compact versioned state with IDs only and a valid timestamp', () => {
    const state = createState();

    assert.equal(state.schemaVersion, 2);
    assert.equal(state.phase, 'inspect');
    assert.equal(state.iteration, 0);
    assert.deepEqual(state.failureCounts, {});
    assert.deepEqual(state.acceptanceCriteria, [
      { id: 'types', status: 'pending' },
      { id: 'tests', status: 'pending' },
    ]);
    assert.equal(state.budgets.tokenLimit, null);
    assert.equal(state.budgets.tokenUsed, null);
    assert.equal(state.budgets.ciRuns, 0);
    assert.deepEqual(state.ciRunAttempts, []);
    assert.equal(Object.hasOwn(state, 'taskText'), false);
    assert.ok(Number.isFinite(Date.parse(state.startedAt)));
    assert.equal(state.startedAt, state.updatedAt);
  });

  it('rejects unsafe identifiers and unexpected prompt-bearing input keys', () => {
    for (const taskId of ['../escape', 'folder/task', 'folder\\task', '..', 'C:outside']) {
      assert.throws(() => createState({ taskId }), LoopStateValidationError);
    }
    assert.throws(() => createState({ prompt: 'secret prompt text' }), LoopStateValidationError);
    assert.throws(() => createState({ taskText: 'secret task text' }), LoopStateValidationError);
    assert.throws(() => createState({ branch: 'feature branch with prompt text' }), LoopStateValidationError);
  });

  it('saves atomically under the safe task ID and round-trips the validated state', async () => {
    const root = await createRepoFixture();
    const state = createState();

    await saveLoopState(root, state);
    const updatedState = recordTokenUsage(state, { inputTokens: 1 });
    await saveLoopState(root, updatedState);

    const savedDirectory = path.join(root, '.loop', 'state');
    assert.deepEqual(await readdir(savedDirectory), ['github-issue-241.json']);
    assert.deepEqual(await loadLoopState(root, state.taskId), updatedState);
  });

  it('fails closed for missing or malformed state instead of resetting progress', async () => {
    const root = await createRepoFixture();

    await assert.rejects(loadLoopState(root, 'github-issue-241'), LoopStateNotFoundError);
    const stateDirectory = path.join(root, '.loop', 'state');
    await mkdir(stateDirectory, { recursive: true });
    await writeFile(path.join(stateDirectory, 'github-issue-241.json'), '{ broken json', 'utf8');

    await assert.rejects(loadLoopState(root, 'github-issue-241'), LoopStateCorruptError);
  });

  it('rejects malformed state shapes, negative counters, and mismatched task IDs', async () => {
    const root = await createRepoFixture();
    const state = createState();
    await saveLoopState(root, state);

    const filePath = path.join(root, '.loop', 'state', `${state.taskId}.json`);
    const malformed = { ...state, unexpected: 'raw user data' };
    await writeFile(filePath, JSON.stringify(malformed), 'utf8');
    await assert.rejects(loadLoopState(root, state.taskId), LoopStateCorruptError);

    const negativeCounter = { ...state, iteration: -1 };
    await assert.rejects(saveLoopState(root, negativeCounter), LoopStateValidationError);
    const unsafePath = { ...state, protectedPathsTouched: ['../.env'] };
    await assert.rejects(saveLoopState(root, unsafePath), LoopStateValidationError);
    await assert.rejects(loadLoopState(root, 'different-task-id'), LoopStateNotFoundError);
  });

  it('rejects numeric base and head revisions instead of coercing them to strings', async () => {
    const root = await createRepoFixture();
    const state = createState();

    for (const revisionField of ['baseSha', 'headSha']) {
      await assert.rejects(
        saveLoopState(root, { ...state, [revisionField]: 1234567 }),
        LoopStateValidationError,
      );
    }
  });

  it('rejects state-directory symlink escapes where the host permits directory links', async (t) => {
    const root = await createRepoFixture();
    const outside = await createRepoFixture();
    await mkdir(path.join(root, '.loop'), { recursive: true });

    try {
      await symlink(outside, path.join(root, '.loop', 'state'), 'junction');
    } catch (error) {
      if (['EPERM', 'EACCES', 'ENOSYS'].includes(error.code)) {
        t.skip(`host does not allow temporary directory links: ${error.code}`);
        return;
      }
      throw error;
    }

    await assert.rejects(saveLoopState(root, createState()), LoopStatePathError);
  });
});

describe('loop budgets', () => {
  it('stops when the same failure reaches its configured maximum', () => {
    const initial = createState();
    const fingerprint = 'c'.repeat(64);
    const twice = recordFailure(recordFailure(initial, fingerprint), fingerprint);

    assert.equal(initial.failureCounts[fingerprint], undefined);
    assert.equal(twice.failureCounts[fingerprint], 2);
    assert.deepEqual(evaluateBudgets(twice, policy), { stop: true, reason: 'max_same_failure' });
  });

  it('enforces iteration, flaky retry, wall-clock, and token budgets independently', () => {
    const initial = createState();
    const iterationLimit = { ...initial, iteration: policy.stopConditions.maxIterations };
    const retryLimit = { ...initial, ciRetryCount: policy.stopConditions.maxFlakyRetries };
    const wallClockExpired = {
      ...initial,
      startedAt: new Date(Date.now() - (policy.stopConditions.maxWallClockSeconds + 1) * 1000).toISOString(),
    };
    const tokenPolicy = withStopConditions({ tokenLimit: 50 });
    const tokenLimit = recordTokenUsage(createState({ policy: tokenPolicy }), { inputTokens: 50 });

    assert.deepEqual(evaluateBudgets(iterationLimit, policy), { stop: true, reason: 'max_iterations' });
    assert.deepEqual(evaluateBudgets(retryLimit, policy), { stop: true, reason: 'max_flaky_retries' });
    assert.deepEqual(evaluateBudgets(wallClockExpired, policy), { stop: true, reason: 'max_wall_clock' });
    assert.deepEqual(evaluateBudgets(tokenLimit, tokenPolicy), { stop: true, reason: 'token_limit' });
  });

  it('enforces changed-file and changed-line limits without stopping at the inclusive maximum', () => {
    const state = createState();

    assert.deepEqual(evaluateBudgets(state, policy, { changedFiles: 25, additions: 500, deletions: 500 }), {
      stop: false,
      reason: null,
    });
    assert.deepEqual(evaluateBudgets(state, policy, { changedFiles: 26, additions: 0, deletions: 0 }), {
      stop: true,
      reason: 'max_changed_files',
    });
    assert.deepEqual(evaluateBudgets(state, policy, { changedFiles: 1, additions: 1001, deletions: 0 }), {
      stop: true,
      reason: 'max_changed_lines',
    });
  });

  it('tracks tokens and CI runs when their limits are unset and enforces configured CI-run limits', () => {
    const initial = createState();
    const withUsage = recordTokenUsage(initial, { inputTokens: 12, outputTokens: 8 });
    const withCiRun = recordCIRun(recordCIRun(withUsage));
    const ciPolicy = withStopConditions({ ciRunLimit: 2 });
    const ciLimitedState = createState({ policy: ciPolicy });
    const ciLimitedTwice = recordCIRun(recordCIRun(ciLimitedState));

    assert.equal(withUsage.budgets.tokenUsed, 20);
    assert.equal(withCiRun.budgets.ciRuns, 2);
    assert.deepEqual(evaluateBudgets(withCiRun, policy), { stop: false, reason: null });
    assert.equal(ciLimitedTwice.budgets.ciRuns, 2);
    assert.deepEqual(evaluateBudgets(ciLimitedTwice, ciPolicy), { stop: true, reason: 'ci_run_limit' });
  });

  it('fails closed when a token limit is configured but usage telemetry is unknown', () => {
    const tokenPolicy = withStopConditions({ tokenLimit: 100 });
    const state = createState({ policy: tokenPolicy });

    assert.equal(state.budgets.tokenUsed, null);
    assert.deepEqual(evaluateBudgets(state, tokenPolicy), { stop: true, reason: 'token_usage_unknown' });
  });

  it('reserves a stable CI attempt once and never replays it after an uncertain outcome', () => {
    const finitePolicy = withStopConditions({ ciRunLimit: 2, maxFlakyRetries: 3 });
    const initial = createState({ policy: finitePolicy });
    const actionAttemptKey = 'd'.repeat(64);

    const first = reserveCIRunAttempt(initial, actionAttemptKey, finitePolicy);
    assert.equal(first.status, 'reserved');
    assert.equal(first.state.ciRetryCount, 1);
    assert.equal(first.state.budgets.ciRuns, 1);
    assert.deepEqual(first.state.ciRunAttempts.map(({ actionAttemptKey: key, status }) => ({ key, status })), [
      { key: actionAttemptKey, status: 'reserved' },
    ]);

    const uncertain = finishCIRunAttempt(first.state, actionAttemptKey, 'uncertain');
    assert.equal(uncertain.ciRunAttempts[0].status, 'uncertain');
    const repeated = reserveCIRunAttempt(uncertain, actionAttemptKey, finitePolicy);
    assert.equal(repeated.status, 'duplicate');
    assert.equal(repeated.state.budgets.ciRuns, 1);
    assert.equal(repeated.state.ciRetryCount, 1);
  });

  it('requires a finite CI-run limit and respects the inclusive final CI and flaky retry budgets', () => {
    const unboundedPolicy = withStopConditions({ ciRunLimit: null, maxFlakyRetries: 3 });
    const unbounded = reserveCIRunAttempt(createState({ policy: unboundedPolicy }), 'e'.repeat(64), unboundedPolicy);
    assert.deepEqual({ status: unbounded.status, reason: unbounded.reason }, {
      status: 'refused', reason: 'ci_run_limit_unconfigured',
    });

    const oneRunPolicy = withStopConditions({ ciRunLimit: 1, maxFlakyRetries: 3 });
    const oneRunState = createState({ policy: oneRunPolicy });
    const finalAllowed = reserveCIRunAttempt(oneRunState, 'f'.repeat(64), oneRunPolicy);
    assert.equal(finalAllowed.status, 'reserved');
    const beyondCi = reserveCIRunAttempt(finalAllowed.state, '1'.repeat(64), oneRunPolicy);
    assert.deepEqual({ status: beyondCi.status, reason: beyondCi.reason }, {
      status: 'refused', reason: 'ci_run_limit',
    });

    const oneRetryPolicy = withStopConditions({ ciRunLimit: 3, maxFlakyRetries: 1 });
    const oneRetryState = createState({ policy: oneRetryPolicy });
    const firstRetry = reserveCIRunAttempt(oneRetryState, '2'.repeat(64), oneRetryPolicy);
    const beyondRetry = reserveCIRunAttempt(firstRetry.state, '3'.repeat(64), oneRetryPolicy);
    assert.deepEqual({ status: beyondRetry.status, reason: beyondRetry.reason }, {
      status: 'refused', reason: 'max_flaky_retries',
    });
  });

  it('rejects malformed attempt keys, invalid finish transitions, and legacy LoopState v1', async () => {
    const finitePolicy = withStopConditions({ ciRunLimit: 2 });
    const state = createState({ policy: finitePolicy });
    assert.throws(() => reserveCIRunAttempt(state, 'not-a-sha256', finitePolicy), LoopStateValidationError);
    assert.throws(() => finishCIRunAttempt(state, '4'.repeat(64), 'submitted'), LoopStateValidationError);
    assert.throws(() => finishCIRunAttempt(state, '4'.repeat(64), 'failed'), LoopStateValidationError);

    const root = await createRepoFixture();
    await saveLoopState(root, state);
    const source = path.join(root, '.loop', 'state', `${state.taskId}.json`);
    const legacy = { ...state, schemaVersion: 1 };
    delete legacy.ciRunAttempts;
    await writeFile(source, JSON.stringify(legacy), 'utf8');
    await assert.rejects(loadLoopState(root, state.taskId), LoopStateCorruptError);
  });

  it('serializes concurrent reservations in repository state and persists completion status', async () => {
    const root = await createRepoFixture();
    const finitePolicy = withStopConditions({ ciRunLimit: 2, maxFlakyRetries: 3 });
    const initial = createState({ policy: finitePolicy });
    const actionAttemptKey = '5'.repeat(64);
    await saveLoopState(root, initial);

    const results = await Promise.all([
      reserveCIRunAttemptInRepository(root, initial.taskId, actionAttemptKey, finitePolicy),
      reserveCIRunAttemptInRepository(root, initial.taskId, actionAttemptKey, finitePolicy),
    ]);
    assert.deepEqual(results.map((result) => result.status).sort(), ['duplicate', 'reserved']);
    const reserved = await loadLoopState(root, initial.taskId);
    assert.equal(reserved.budgets.ciRuns, 1);
    assert.equal(reserved.ciRetryCount, 1);
    assert.equal(reserved.ciRunAttempts.length, 1);

    await finishCIRunAttemptInRepository(root, initial.taskId, actionAttemptKey, 'submitted');
    const finished = await loadLoopState(root, initial.taskId);
    assert.equal(finished.ciRunAttempts[0].status, 'submitted');
  });
});
