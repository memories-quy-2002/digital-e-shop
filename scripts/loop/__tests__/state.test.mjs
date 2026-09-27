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
  loadLoopState,
  recordCIRun,
  recordFailure,
  recordTokenUsage,
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

    assert.equal(state.schemaVersion, 1);
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
});
