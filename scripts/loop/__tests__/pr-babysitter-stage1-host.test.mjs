import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { it } from 'node:test';

import { assertCheckoutMatchesPr, assertEligiblePullRequest } from '../pr-babysitter-host.mjs';

import {
  assertStage1Command,
  createPrBabysitterStage1Host,
  createStage1WorkflowSourceVerifier,
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

it('allows only inspect and rerun-flaky for the fixed same-repository entrypoint', () => {
  assert.equal(assertStage1Command({ command: 'inspect', repository, dryRun: false }, false), true);
  assert.equal(assertStage1Command({ command: 'rerun-flaky', repository, dryRun: false }, true), true);

  for (const command of ['decide', 'escalation', 'begin-repair', 'validate-repair', 'push', 'merge', 'unknown']) {
    assert.throws(() => assertStage1Command({ command, repository, dryRun: false }, true),
      errorWithCode('stage1_command_refused'));
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

it('keeps Stage 1 disabled when trust configuration and a host budget session are unavailable', async (t) => {
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
  assert.match(stderr, /stage1_prerequisites_unavailable/);
  assert.ok(result.blockers.includes('ci_run_budget_session_unavailable'));
  assert.ok(result.blockers.includes('stage1_dispatch_runtime_unavailable'));
  assert.ok(result.blockers.includes('stage1_host_observer_unavailable'));
  assert.ok(result.blockers.includes('trusted_job_graph_unavailable'));
  assert.equal(fetchCalls, 0);
  assert.deepEqual(STAGE1_TRUST_STATUS, {
    sourceAttestationProvider: 'configured',
    workflowAllowlistEntries: 0,
    trustedApproverIds: 0,
    ciRunBudgetSession: 'unavailable',
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
