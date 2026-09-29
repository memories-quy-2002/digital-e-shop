import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parsePrBabysitterArguments, runPrBabysitterCli } from '../pr-babysitter-cli.mjs';
import { createPrBabysitterState } from '../pr-state.mjs';
import { normalizeRequiredCheckSnapshot } from '../pr-evidence.mjs';

const sha = 'a'.repeat(40);
const policy = { schemaVersion: 1, protectedPaths: { high: [], critical: [] },
  riskRules: { low: [], medium: [], high: [], criticalActions: [] },
  stopConditions: { maxIterations: 2, maxSameFailure: 2, maxFlakyRetries: 2, maxChangedFiles: 10,
    maxChangedLines: 500, maxWallClockSeconds: 300, tokenLimit: null, ciRunLimit: 2 } };
function makeHost(overrides = {}) {
  const snapshot = { repository: 'owner/repo', number: 2, state: 'open', draft: false, baseRef: 'main', baseSha: 'b'.repeat(40),
    headRef: 'feature/test', headSha: sha, mergeSha: null, headRepository: 'owner/repo', updatedAt: '2026-09-29T00:00:00.000Z' };
  const stateValue = createPrBabysitterState(snapshot);
  const collection = { prSnapshot: snapshot,
    requiredCheckSnapshot: normalizeRequiredCheckSnapshot({ baseRef: 'main', policyFingerprint: 'c'.repeat(64), requiredChecks: [], requiredWorkflows: [], collectionStatus: 'complete' }),
    checkObservations: [], checkCollectionComplete: true };
  const noOp = async () => {};
  return { config: { repository: 'owner/repo', repositoryId: 9, repoRoot: 'C:/repo', taskId: 'task-2', policy },
    adapters: { pr: { collect: async () => collection, refresh: async () => snapshot },
      state: { load: async () => stateValue, save: noOp },
      auth: { authenticateApprover: async () => { throw Error('TTY gate failed'); } }, repair: {}, writer: {},
      budget: async () => ({ stop: false }), telemetry: noOp, ...overrides } };
}

describe('PR Babysitter CLI', () => {
  it('parses a strict repository and PR number', () => {
    assert.deepEqual(parsePrBabysitterArguments(['inspect', '--repo', 'owner/repo', '--pr', '12']), {
      command: 'inspect', repository: 'owner/repo', prNumber: 12, dryRun: false,
    });
    for (const argv of [
      ['inspect', '--repo', 'owner/repo/extra', '--pr', '12'],
      ['inspect', '--repo', 'owner/repo', '--pr', '0'],
      ['inspect', '--repo', 'owner/repo', '--pr', '01'],
      ['inspect', '--repo', 'owner/repo', '--pr', '1x'],
    ]) assert.throws(() => parsePrBabysitterArguments(argv));
  });

  it('fails closed without trusted host and performs no adapter I/O', async () => {
    let called = false;
    const result = await runPrBabysitterCli({ argv: ['inspect', '--repo', 'owner/repo', '--pr', '2'], trustedHost: null,
      io: { stdout: { write() {} }, stderr: { write() {} }, isTTY: false } });
    assert.equal(result.exitCode, 4);
    assert.equal(called, false);
  });

  it('dry-run does not contact adapters or mutate state', async () => {
    let calls = 0;
    const trustedHost = new Proxy({}, { get() { calls += 1; throw Error('must not call'); } });
    const result = await runPrBabysitterCli({ argv: ['decide', '--repo', 'owner/repo', '--pr', '2', '--dry-run'], trustedHost,
      io: { stdout: { write() {} }, stderr: { write() {} }, isTTY: false } });
    assert.equal(result.exitCode, 0);
    assert.equal(calls, 0);
  });

  it('keeps environment variables from granting write authority', async () => {
    const result = await runPrBabysitterCli({ argv: ['rerun-flaky', '--repo', 'owner/repo', '--pr', '2'], trustedHost: null,
      env: { APPROVED: 'true', GITHUB_TOKEN: 'never-print-this' },
      io: { stdout: { write() {} }, stderr: { write() {} }, isTTY: true } });
    assert.equal(result.exitCode, 4);
    assert.equal(JSON.stringify(result).includes('never-print-this'), false);
  });

  it('requires TTY before device flow or approval adapters run', async () => {
    let authCalls = 0;
    const trustedHost = makeHost();
    trustedHost.adapters.auth.authenticateApprover = async () => { authCalls += 1; };
    const result = await runPrBabysitterCli({ argv: ['rerun-flaky', '--repo', 'owner/repo', '--pr', '2'], trustedHost,
      io: { stdout: { write() {} }, stderr: { write() {} }, isTTY: false } });
    assert.equal(result.exitCode, 3);
    assert.equal(authCalls, 0);
  });

  it('redacts adapter errors from stderr', async () => {
    const trustedHost = makeHost();
    trustedHost.adapters.pr.collect = async () => { throw Error('GITHUB_TOKEN=super-secret-value'); };
    let stderr = '';
    const result = await runPrBabysitterCli({ argv: ['inspect', '--repo', 'owner/repo', '--pr', '2'], trustedHost,
      io: { stdout: { write() {} }, stderr: { write(value) { stderr += value; } }, isTTY: false } });
    assert.equal(result.exitCode, 4);
    assert.equal(stderr.includes('super-secret-value'), false);
  });

  it('has distinct status exit codes', async () => {
    assert.deepEqual((await import('../pr-babysitter-cli.mjs')).PR_BABYSITTER_EXIT_CODES,
      { ready: 0, wait: 1, escalated: 2, refused: 3, infrastructure: 4 });
  });
});
