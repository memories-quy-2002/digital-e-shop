import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { promisify } from 'node:util';
import { it } from 'node:test';

import { assertCheckoutMatchesPr, assertEligiblePullRequest } from '../pr-babysitter-host.mjs';
import { loadLoopPolicy } from '../policy.mjs';
import { createLoopState, createLoopStateInRepository, loadLoopState, saveLoopState } from '../state.mjs';

import {
  assertStage1Command,
  createPrBabysitterStage1Host,
  createStage1WorkflowSourceVerifier,
  initializeStage1Budget,
  readStage1BudgetSession,
  runPrBabysitterStage1,
  STAGE1_TRUST_STATUS,
} from '../pr-babysitter-stage1-host.mjs';

const repository = 'memories-quy-2002/digital-e-shop';
const inspectArgs = (command = 'inspect', repo = repository) => [command, '--repo', repo, '--pr', '7'];
const execFileAsync = promisify(execFile);

function errorWithCode(code) {
  return (error) => error?.code === code;
}

it('uses a dedicated read-only source-attestation installation capability', async () => {
  let providerOptions;
  const verifier = createStage1WorkflowSourceVerifier({
    getObserveToken: async (capability) => {
      assert.equal(capability, 'source-attestation:read');
      return 'observe-token';
    },
    providerFactory: (options) => {
      providerOptions = options;
      return { inspectWorkflowSourceAttestation: async () => null };
    },
  });

  assert.equal(typeof verifier, 'function');
  assert.equal(await providerOptions.getToken('observe'), 'observe-token');
  await assert.rejects(providerOptions.getToken('actions:write'), (error) => error?.reasonCode === 'stage1_read_only');
});

it('allows inspect, initialize-budget, and rerun-flaky for the fixed same-repository entrypoint', () => {
  assert.equal(assertStage1Command({ command: 'inspect', repository, dryRun: false }, false), true);
  assert.equal(assertStage1Command({ command: 'initialize-budget', repository, dryRun: false }, true), true);
  assert.equal(assertStage1Command({ command: 'rerun-flaky', repository, dryRun: false }, true), true);

  for (const command of ['decide', 'escalation', 'begin-repair', 'validate-repair', 'push', 'merge', 'unknown']) {
    assert.throws(() => assertStage1Command({ command, repository, dryRun: false }, true),
      errorWithCode('stage1_command_refused'));
  }
});

it('creates one budget session for the observed PR tuple only after exact TTY confirmation', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'digital-e-stage1-budget-'));
  const checkoutRoot = path.join(root, 'checkout');
  const userHome = path.join(root, 'user-home');
  await Promise.all([mkdir(checkoutRoot), mkdir(userHome)]);
  const originalUserInfo = os.userInfo;
  os.userInfo = () => ({ homedir: userHome });
  t.after(async () => {
    os.userInfo = originalUserInfo;
    await rm(root, { recursive: true, force: true });
  });
  const snapshot = {
    repository, number: 7, state: 'open', draft: false, baseRef: 'main',
    headRef: 'feature/stage1-pilot', baseSha: 'a'.repeat(40), headSha: 'b'.repeat(40), mergeSha: null,
  };
  const policy = await loadLoopPolicy();
  const taskId = 'stage1-pr-7-aaaaaaaaaaaa-bbbbbbbbbbbb';
  const checkoutBudget = createLoopState({ taskId, branch: snapshot.headRef,
    baseSha: snapshot.baseSha, headSha: snapshot.headSha, risk: 'high',
    acceptanceCriteria: ['stage1-trusted-dispatch', 'stage1-required-check-green'], policy });
  await createLoopStateInRepository(checkoutRoot, checkoutBudget);
  const host = {
    config: { repoRoot: checkoutRoot, policy },
    adapters: { pr: { refresh: async (prNumber) => { assert.equal(prNumber, 7); return snapshot; } } },
  };
  let output = '';
  const result = await initializeStage1Budget({ host, prNumber: 7,
    input: Readable.from(['INITIALIZE 7\n']), output: { write(value) { output += value; } } });

  assert.equal(result.exitCode, 0);
  assert.equal(result.taskId, taskId);
  assert.match(output, /"baseSha":"a{40}"/);
  assert.match(output, /"headSha":"b{40}"/);
  const state = await loadLoopState(userHome, result.taskId);
  assert.equal(state.branch, snapshot.headRef);
  assert.equal(state.baseSha, snapshot.baseSha);
  assert.equal(state.headSha, snapshot.headSha);
  assert.equal(state.budgets.ciRunLimit, host.config.policy.stopConditions.ciRunLimit);
  assert.equal((await loadLoopState(checkoutRoot, result.taskId)).budgets.ciRuns, 0);

  await saveLoopState(userHome, { ...state, budgets: { ...state.budgets, ciRuns: 1 } });
  assert.equal((await loadLoopState(checkoutRoot, result.taskId)).budgets.ciRuns, 0);
  assert.equal((await readStage1BudgetSession(7, snapshot, policy)).budgets.ciRuns, 1,
    'a checkout-local forged session cannot reset the user-local CI counter');

  const duplicate = await initializeStage1Budget({ host, prNumber: 7,
    input: Readable.from(['INITIALIZE 7\n']), output: { write() {} } });
  assert.equal(duplicate.exitCode, 3);
  assert.equal(duplicate.reasonCode, 'ci_run_budget_session_exists');
});

it('refuses a budget session when the operating-system home cannot be resolved', async () => {
  const originalUserInfo = os.userInfo;
  os.userInfo = () => { throw new Error('home lookup failed'); };
  try {
    await assert.rejects(readStage1BudgetSession(7, {
      baseSha: 'a'.repeat(40), headSha: 'b'.repeat(40), headRef: 'feature/stage1-pilot',
    }, await loadLoopPolicy()), { reasonCode: 'ci_run_budget_session_unavailable' });
  } finally {
    os.userInfo = originalUserInfo;
  }
});

it('refuses budget state when its OS-home path is inside the canonical PR checkout', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'digital-e-stage1-budget-overlap-'));
  const originalUserInfo = os.userInfo;
  const policy = await loadLoopPolicy();
  const snapshot = {
    repository, number: 7, state: 'open', draft: false, baseRef: 'main',
    headRef: 'feature/stage1-pilot', baseSha: 'a'.repeat(40), headSha: 'b'.repeat(40), mergeSha: null,
  };
  const taskId = 'stage1-pr-7-aaaaaaaaaaaa-bbbbbbbbbbbb';
  t.after(async () => {
    os.userInfo = originalUserInfo;
    await rm(root, { recursive: true, force: true });
  });

  for (const layout of ['checkout-is-home', 'checkout-contains-home']) {
    const checkoutRoot = path.join(root, layout);
    const userHome = layout === 'checkout-is-home' ? checkoutRoot : path.join(checkoutRoot, 'profile');
    await mkdir(userHome, { recursive: true });
    os.userInfo = () => ({ homedir: userHome });

    const forged = createLoopState({ taskId, branch: snapshot.headRef,
      baseSha: snapshot.baseSha, headSha: snapshot.headSha, risk: 'high',
      acceptanceCriteria: ['stage1-trusted-dispatch', 'stage1-required-check-green'], policy });
    await createLoopStateInRepository(userHome, forged);

    await assert.rejects(readStage1BudgetSession(7, snapshot, policy, { repoRoot: checkoutRoot }),
      { reasonCode: 'ci_run_budget_session_unavailable' }, layout);

    const host = {
      config: { repoRoot: checkoutRoot, policy },
      adapters: { pr: { refresh: async () => snapshot } },
    };
    await assert.rejects(initializeStage1Budget({ host, prNumber: 7,
      input: Readable.from(['INITIALIZE 7\n']), output: { write() {} } }),
    { reasonCode: 'ci_run_budget_session_unavailable' }, layout);
    assert.equal((await loadLoopState(userHome, taskId)).budgets.ciRuns, 0,
      `${layout}: the forged session remains untouched`);
  }
});

it('rejects a different repository and non-TTY reruns before host construction', () => {
  assert.throws(() => assertStage1Command({ command: 'inspect', repository: 'other/repo', dryRun: false }, true),
    errorWithCode('repository_not_allowlisted'));
  assert.throws(() => assertStage1Command({ command: 'rerun-flaky', repository, dryRun: false }, false),
    errorWithCode('interactive_tty_required'));
  assert.equal(assertStage1Command({ command: 'rerun-flaky', repository, dryRun: true }, false), true);
});

it('shares Stage 0 PR eligibility checks and rejects closed, forked, and main-head PRs', () => {
  const eligible = {
    repository,
    repositoryId: 743050379,
    baseRepositoryId: 743050379,
    headRepositoryId: 743050379,
    defaultBranch: 'main',
    state: 'open',
    draft: false,
    baseRef: 'main',
    baseSha: 'a'.repeat(40),
    headRef: 'feature/stage1-pilot',
    headSha: 'b'.repeat(40),
    mergeSha: null,
    headRepository: repository,
    updatedAt: '2026-10-05T00:00:00.000Z',
  };

  assert.doesNotThrow(() => assertEligiblePullRequest(eligible));
  for (const snapshot of [
    { ...eligible, state: 'closed' },
    { ...eligible, headRepositoryId: 743050380, headRepository: 'fork/digital-e-shop' },
    { ...eligible, headRef: 'main' },
    { ...eligible, repository: 'other/repo' },
  ]) {
    assert.throws(() => assertEligiblePullRequest(snapshot), (error) => error?.reasonCode === 'pr_not_eligible');
  }
});

it('rejects a checkout whose HEAD does not match the inspected PR', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'digital-e-stage1-checkout-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const git = async (...args) => execFileAsync('git', ['-C', root, ...args], {
    encoding: 'utf8', timeout: 10_000, windowsHide: true,
  });
  await git('init', '--initial-branch=feature/stage1-pilot');
  await git('config', 'user.name', 'Stage 1 host test');
  await git('config', 'user.email', 'stage1-host@example.invalid');
  await writeFile(path.join(root, 'fixture.txt'), 'fixture\n', 'utf8');
  await git('add', 'fixture.txt');
  await git('commit', '-m', 'test: stage1 checkout fixture');
  const actualHead = (await git('rev-parse', 'HEAD')).stdout.trim();
  const snapshot = {
    baseSha: 'a'.repeat(40),
    headSha: 'b'.repeat(40),
    headRef: 'feature/stage1-pilot',
  };
  assert.notEqual(actualHead, snapshot.headSha);
  await assert.rejects(assertCheckoutMatchesPr(root, snapshot),
    (error) => error?.reasonCode === 'checkout_head_does_not_match_pr');
});

it('does not construct an inspection host outside a validated GitHub checkout', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'digital-e-stage1-untrusted-root-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await assert.rejects(createPrBabysitterStage1Host({ prNumber: 7, repoRoot: root, env: {} }),
    (error) => error?.reasonCode === 'checkout_validation_failed');
});

it('refuses repair, push, merge, and unknown commands before reading credentials or contacting GitHub', async (t) => {
  let fetchCalls = 0;
  t.mock.method(globalThis, 'fetch', async () => { fetchCalls += 1; throw new Error('unexpected network'); });
  const env = new Proxy({}, { get() { throw new Error('credentials must not be read'); } });

  for (const command of ['begin-repair', 'validate-repair', 'push', 'merge', 'unknown']) {
    let stderr = '';
    const result = await runPrBabysitterStage1({
      argv: inspectArgs(command), env,
      io: { stdout: { write() {} }, stderr: { write(value) { stderr += value; } }, isTTY: true },
    });
    assert.equal(result.exitCode, 3);
    assert.match(stderr, /stage1_command_refused|invalid_arguments/);
  }
  assert.equal(fetchCalls, 0);
});

it('rejects a different repository before credentials or network access', async (t) => {
  let fetchCalls = 0;
  t.mock.method(globalThis, 'fetch', async () => { fetchCalls += 1; throw new Error('unexpected network'); });
  const env = new Proxy({}, { get() { throw new Error('credentials must not be read'); } });
  let stderr = '';
  const result = await runPrBabysitterStage1({
    argv: inspectArgs('inspect', 'other/repo'), env,
    io: { stdout: { write() {} }, stderr: { write(value) { stderr += value; } }, isTTY: true },
  });
  assert.equal(result.exitCode, 3);
  assert.match(stderr, /repository_not_allowlisted/);
  assert.equal(fetchCalls, 0);
});

it('requires a real TTY before the rerun path can construct a host', async (t) => {
  let fetchCalls = 0;
  t.mock.method(globalThis, 'fetch', async () => { fetchCalls += 1; throw new Error('unexpected network'); });
  const env = new Proxy({}, { get() { throw new Error('credentials must not be read'); } });
  let stderr = '';
  const result = await runPrBabysitterStage1({
    argv: inspectArgs('rerun-flaky'), env,
    io: { stdout: { write() {} }, stderr: { write(value) { stderr += value; } }, isTTY: false },
  });
  assert.equal(result.exitCode, 3);
  assert.match(stderr, /interactive_tty_required/);
  assert.equal(fetchCalls, 0);
});

it('ignores trust environment overrides and fails closed when the user-local trust file is absent', async (t) => {
  const taskHome = await mkdtemp(path.join(os.tmpdir(), 'digital-e-stage1-absent-trust-'));
  t.mock.method(os, 'userInfo', () => ({ homedir: taskHome }));
  t.after(() => rm(taskHome, { recursive: true, force: true }));
  let fetchCalls = 0;
  t.mock.method(globalThis, 'fetch', async () => { fetchCalls += 1; throw new Error('unexpected network'); });
  const env = {
    LOOP_STAGE1_TRUSTED_APPROVER_IDS: '1001',
    LOOP_STAGE1_WORKFLOW_ALLOWLIST: '[{"workflowId":1}]',
    LOOP_GITHUB_APP_ID: '12345',
    LOOP_GITHUB_APP_CLIENT_ID: 'Iv1.untrusted-test-value',
    LOOP_GITHUB_APP_INSTALLATION_ID: '67890',
    LOOP_GITHUB_APP_PRIVATE_KEY_FILE: 'must-not-be-read.pem',
  };
  let stderr = '';
  const result = await runPrBabysitterStage1({
    argv: inspectArgs('rerun-flaky'), env,
    io: { stdout: { write() {} }, stderr: { write(value) { stderr += value; } }, isTTY: true },
  });

  assert.equal(result.exitCode, 3);
  assert.match(stderr, /stage1_trust_configuration_unavailable/);
  assert.equal(result.reasonCode, 'stage1_trust_configuration_unavailable');
  assert.equal(fetchCalls, 0);
  assert.deepEqual(STAGE1_TRUST_STATUS, {
    sourceAttestationProvider: 'configured',
    workflowAllowlistEntries: 1,
    trustedApproverIds: 'user-local-config',
    ciRunBudgetSession: 'explicit-per-pr',
  });
  assert.equal(JSON.stringify(result).includes('must-not-be-read.pem'), false);
});

it('keeps dry-run syntax-only and makes no eligibility claim or external request', async (t) => {
  let fetchCalls = 0;
  t.mock.method(globalThis, 'fetch', async () => { fetchCalls += 1; throw new Error('unexpected network'); });
  let stdout = '';
  let stderr = '';
  const result = await runPrBabysitterStage1({
    argv: [...inspectArgs('rerun-flaky'), '--dry-run'],
    env: {},
    io: { stdout: { write(value) { stdout += value; } }, stderr: { write(value) { stderr += value; } }, isTTY: false },
  });
  assert.equal(result.exitCode, 0, stderr);
  assert.match(stdout, /"status":"dry-run"/);
  assert.doesNotMatch(stdout, /eligible|approved|token|workflow_source_sha/);
  assert.equal(fetchCalls, 0);
});
