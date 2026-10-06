import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { afterEach, before, describe, it } from 'node:test';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createGitHubAuthProvider } from '../github-auth-provider.mjs';
import { loadLoopPolicy } from '../policy.mjs';
import { inspectPrWorktree } from '../pr-worktree-guard.mjs';
import { createLoopState, loadLoopState, recordFailure, saveLoopState } from '../state.mjs';
import { createPrBabysitterState, savePrBabysitterState } from '../pr-state.mjs';

const HASH = 'a'.repeat(40);
const repositoryId = 1234;
const temporaryRoots = new Set();
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
let policy;

before(async () => {
  policy = await loadLoopPolicy(repoRoot);
});

afterEach(async () => {
  for (const root of temporaryRoots) {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
  temporaryRoots.clear();
});

function runGit(root, args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', windowsHide: true }).trim();
}

function response(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}

function makeApprovalProvider() {
  const prompt = async () => true;
  Object.defineProperty(prompt, 'isTTY', { value: true });
  const fetchImpl = async (input) => {
    const url = new URL(input);
    if (url.href === 'https://github.com/login/device/code') {
      return response({ device_code: 'device', user_code: 'ABCD', verification_uri: 'https://github.com/login/device', expires_in: 900, interval: 1 });
    }
    if (url.href === 'https://github.com/login/oauth/access_token') return response({ access_token: 'user-token', token_type: 'bearer' });
    if (url.href === 'https://api.github.com/user') return response({ id: 1001, login: 'maintainer' });
    if (url.href === `https://api.github.com/repositories/${repositoryId}`) {
      return response({ id: repositoryId, full_name: 'owner/repo', permissions: { pull: true, push: true } });
    }
    return response({ message: 'not found' }, 404);
  };
  return createGitHubAuthProvider({
    appId: 1,
    appClientId: 'test-client',
    installationId: 2,
    repositoryId,
    getAppPrivateKey: async () => 'unused',
    trustedApproverIds: [1001],
    fetchImpl,
    prompt,
    clock: { now: () => Date.parse('2026-09-29T04:00:00.000Z'), sleep: async () => {} },
  });
}

async function createFixture(options = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'digital-e-repair-session-'));
  temporaryRoots.add(root);
  await cp(path.join(repoRoot, '.agent', 'policy'), path.join(root, '.agent', 'policy'), { recursive: true });
  await cp(path.join(repoRoot, '.agent', 'loops'), path.join(root, '.agent', 'loops'), { recursive: true });
  await cp(path.join(repoRoot, 'AGENTS.md'), path.join(root, 'AGENTS.md'));
  await cp(path.join(repoRoot, 'Wiki'), path.join(root, 'Wiki'), { recursive: true });
  await cp(path.join(repoRoot, 'docs', 'superpowers', 'plans'), path.join(root, 'docs', 'superpowers', 'plans'), { recursive: true });
  await cp(path.join(repoRoot, 'docs', 'loop-engineering'), path.join(root, 'docs', 'loop-engineering'), { recursive: true });
  const loopSource = path.join(repoRoot, 'scripts', 'loop');
  await cp(loopSource, path.join(root, 'scripts', 'loop'), {
    recursive: true,
    filter(source) {
      return !path.relative(loopSource, source).split(path.sep).includes('node_modules');
    },
  });
  await cp(path.join(repoRoot, '.github'), path.join(root, '.github'), { recursive: true });
  await cp(path.join(repoRoot, '.node-version'), path.join(root, '.node-version'));
  const verifierMarker = `${root}.nested-repair-verifier-ran`;
  temporaryRoots.add(verifierMarker);
  await writeFile(
    path.join(root, 'scripts', 'loop', '__tests__', 'repair-session.test.mjs'),
    `import { writeFileSync } from 'node:fs';\nimport { test } from 'node:test';\nconst marker = ${JSON.stringify(verifierMarker)};\ntest('nested fixed verifier does not recursively run the outer repair integration case', () => writeFileSync(marker, 'ran'));\n`,
    'utf8',
  );
  if (options.quickVerifierFixture) {
    const testDirectory = path.join(root, 'scripts', 'loop', '__tests__');
    for (const entry of await readdir(testDirectory)) {
      if (entry.endsWith('.test.mjs') && entry !== 'repair-session.test.mjs') {
        await writeFile(path.join(testDirectory, entry), "import { test } from 'node:test';\ntest('fast nested verifier fixture', () => {});\n", 'utf8');
      }
    }
  }
  execFileSync('git', ['-C', root, 'init', '--quiet'], { windowsHide: true, stdio: 'ignore' });
  runGit(root, ['config', 'user.name', 'Digital-E Test']);
  runGit(root, ['config', 'user.email', 'digital-e-test@example.invalid']);
  runGit(root, ['config', 'core.autocrlf', 'false']);
  await writeFile(path.join(root, '.gitignore'), '.loop/\n', 'utf8');
  await mkdir(path.join(root, 'src'), { recursive: true });
  await writeFile(path.join(root, 'src', 'app.mjs'), 'export const value = "base";\n', 'utf8');
  if (options.symlinkPath) {
    const target = path.join(root, ...options.symlinkPath.split('/'));
    await mkdir(path.dirname(target), { recursive: true });
    const outside = await mkdtemp(path.join(os.tmpdir(), 'digital-e-repair-outside-'));
    temporaryRoots.add(outside);
    await symlink(outside, target, process.platform === 'win32' ? 'junction' : 'dir');
  }
  runGit(root, ['add', '--', '.gitignore', '.agent', '.github', '.node-version', 'AGENTS.md', 'Wiki', 'docs', 'scripts', 'src']);
  runGit(root, ['commit', '--quiet', '-m', 'base fixture']);
  runGit(root, ['branch', '-M', 'main']);
  const baseSha = runGit(root, ['rev-parse', '--verify', 'HEAD']).toLowerCase();
  runGit(root, ['switch', '--quiet', '-c', 'feature/repair-fixture']);
  await writeFile(path.join(root, 'src', 'app.mjs'), 'export const value = "head";\n', 'utf8');
  runGit(root, ['add', '--', 'src/app.mjs']);
  runGit(root, ['commit', '--quiet', '-m', 'feature fixture']);
  const headSha = runGit(root, ['rev-parse', '--verify', 'HEAD']).toLowerCase();
  const fingerprint = 'c'.repeat(64);
  const snapshot = {
    repository: 'owner/repo', repositoryId, number: 42, state: 'open', draft: false,
    baseRef: 'main', baseSha, headRef: 'feature/repair-fixture', headSha,
    mergeSha: 'd'.repeat(40), headRepository: 'owner/repo', updatedAt: '2026-09-29T04:00:00.000Z',
  };
  const prState = createPrBabysitterState({
    repository: snapshot.repository, number: snapshot.number, state: snapshot.state, draft: snapshot.draft,
    baseRef: snapshot.baseRef, baseSha, headRef: snapshot.headRef, headSha, mergeSha: snapshot.mergeSha,
    headRepository: snapshot.headRepository, updatedAt: snapshot.updatedAt, engineeringTaskId: 'repair-task',
  });
  const fixturePolicy = options.tokenLimit === undefined && options.maxWallClockSeconds === undefined
    ? policy
    : {
      ...policy,
      stopConditions: {
        ...policy.stopConditions,
        ...(options.tokenLimit === undefined ? {} : { tokenLimit: options.tokenLimit }),
        ...(options.maxWallClockSeconds === undefined ? {} : { maxWallClockSeconds: options.maxWallClockSeconds }),
      },
    };
  await savePrBabysitterState(root, prState);
  let loopState = createLoopState({
    taskId: 'repair-task', branch: snapshot.headRef, baseSha, headSha,
    risk: 'low', acceptanceCriteria: ['tests'],
    policy: fixturePolicy,
  });
  if (options.iteration !== undefined) loopState.iteration = options.iteration;
  loopState = recordFailure(loopState, fingerprint);
  await saveLoopState(root, loopState);

  const approvalProvider = makeApprovalProvider();
  await approvalProvider.authenticateApprover();
  let refreshedSnapshot = snapshot;
  const allowedPaths = options.allowedPaths ?? ['src/app.mjs'];
  let requestCount = 0;
  const originalRequest = approvalProvider.requestApproval;
  const hostApprovalProvider = Object.freeze({
    ...approvalProvider,
    requestApproval: async (...args) => {
      requestCount += 1;
      return originalRequest(...args);
    },
    consumeApproval: (...args) => {
      const result = approvalProvider.consumeApproval(...args);
      options.afterApprovalConsumed?.();
      return result;
    },
  });
  const hostContext = {
    prState, loopState, taskId: 'repair-task', taskWorktreeId: 'repair-task', allowedPaths,
    approvalProvider: hostApprovalProvider,
    refreshPrSnapshot: async () => refreshedSnapshot,
  };
  return {
    root, snapshot, hostContext, fingerprint, verifierMarker,
    async begin(testOverrides = {}) {
      const module = await import('../repair-session.mjs');
      const worktree = await inspectPrWorktree(root, snapshot, hostContext);
      return module.beginRepairSession({
        repoRoot: root, worktree, hostContext, policy,
        testedSha: snapshot.headSha, failures: [{ checkId: 'unit-tests', failureFingerprint: fingerprint }],
        ...testOverrides,
      });
    },
    async validate(session, proposal, context = {}) {
      const module = await import('../repair-session.mjs');
      return module.validateRepairProposal(session, proposal, context);
    },
    setSnapshot(value) { refreshedSnapshot = value; },
    setAfterApprovalConsumed(callback) { options.afterApprovalConsumed = callback; },
    get requestCount() { return requestCount; },
  };
}

describe('repair sessions', () => {
  it('starts a configured new run with known zero token usage', async () => {
    const policy = await loadLoopPolicy();
    const state = createLoopState({
      taskId: 'repair-task',
      branch: 'feature/repair-task',
      baseSha: HASH,
      headSha: 'b'.repeat(40),
      risk: 'low',
      acceptanceCriteria: ['tests'],
      policy: { ...policy, stopConditions: { ...policy.stopConditions, tokenLimit: 1000 } },
    });

    assert.equal(state.budgets.tokenUsed, 0);
  });

  it('exports the vendor-neutral repair handshake', async () => {
    const module = await import('../repair-session.mjs').catch(() => null);
    assert.equal(typeof module?.beginRepairSession, 'function');
    assert.equal(typeof module?.validateRepairProposal, 'function');
  });

  it('rejects command, prompt, model, malformed, traversal, and out-of-scope proposals before approval or writes', async () => {
    const fixture = await createFixture();
    const session = await fixture.begin();
    const proposals = [
      { version: 1, operations: [{ op: 'write', path: 'src/app.mjs', content: 'x' }], exec: 'whoami' },
      { version: 1, operations: [{ op: 'write', path: '../escape.txt', content: 'x' }] },
      { version: 1, operations: [{ op: 'write', path: 'src/other.mjs', content: 'x' }] },
      { version: 1, operations: [{ op: 'run', command: 'echo unsafe' }] },
      { version: 1, operations: [{ op: 'write', path: 'src/app.mjs', content: 'x' }], prompt: 'do it' },
    ];
    for (const proposal of proposals) await assert.rejects(fixture.validate(session, proposal, {}));
    await assert.rejects(fixture.validate(session, proposals[0], { approval: true }));
    assert.equal(fixture.requestCount, 0);
    assert.equal(await readFile(path.join(fixture.root, 'src', 'app.mjs'), 'utf8'), 'export const value = "head";\n');
  });

  it('rejects case-aliased protected paths before approval or writes', async () => {
    const caseAlias = await createFixture({ allowedPaths: ['.GITHUB/workflows/loop-foundation.yml'] });
    const caseSession = await caseAlias.begin();
    await assert.rejects(caseAlias.validate(caseSession, {
      version: 1,
      operations: [{ op: 'write', path: '.GITHUB/workflows/loop-foundation.yml', content: 'unsafe\n' }],
    }, {}), /case|casing/i);
    assert.equal(caseAlias.requestCount, 0);
  });

  it('rejects critical paths before producing a repair packet', async () => {
    const fixture = await createFixture({ allowedPaths: ['.env.local'] });
    await assert.rejects(fixture.begin(), /critical/i);
    assert.equal(fixture.requestCount, 0);
  });

  it('rejects symlink escapes before approval or writes', async (t) => {
    let symlinkFixture;
    try {
      symlinkFixture = await createFixture({ allowedPaths: ['src/linked/file.mjs'], symlinkPath: 'src/linked' });
    } catch (error) {
      if (['EPERM', 'EACCES', 'ENOSYS'].includes(error.code)) {
        t.skip(`host does not allow temporary file symlinks: ${error.code}`);
        return;
      }
      throw error;
    }
    const symlinkSession = await symlinkFixture.begin();
    await assert.rejects(symlinkFixture.validate(symlinkSession, {
      version: 1,
      operations: [{ op: 'write', path: 'src/linked/file.mjs', content: 'unsafe\n' }],
    }, {}), /symlink|escape/i);
    assert.equal(symlinkFixture.requestCount, 0);
  });

  it('binds the session to the exact PR tuple, tested SHA, and clean worktree fingerprint', async () => {
    const fixture = await createFixture();
    const session = await fixture.begin();

    assert.equal(session.baseSha, fixture.snapshot.baseSha);
    assert.equal(session.headSha, fixture.snapshot.headSha);
    assert.equal(session.mergeSha, fixture.snapshot.mergeSha);
    assert.equal(session.testedSha, fixture.snapshot.headSha);
    assert.match(session.workspaceFingerprint, /^[a-f0-9]{64}$/);
    assert.equal(session.remainingBudgets.remaining.iterations, session.remainingBudgets.maxIterations);
    assert.equal(Object.hasOwn(session, 'approval'), false);
    assert.equal(Object.hasOwn(session, 'prompt'), false);
    assert.equal(Object.hasOwn(session, 'model'), false);
    assert.equal(Object.hasOwn(session, 'exec'), false);
    assert.doesNotThrow(() => JSON.stringify(session));
    await assert.rejects(fixture.begin({ testedSha: 'f'.repeat(40) }), /testedSha|stale/i);
  });

  it('requests and consumes exact repair approval, commits only scoped paths, and requires stable fixed-verifier evidence', async () => {
    const fixture = await createFixture({ iteration: policy.stopConditions.maxIterations - 1 });
    const session = await fixture.begin();
    const result = await fixture.validate(session, {
      version: 1,
      operations: [{ op: 'write', path: 'src/app.mjs', content: 'export const value = "repaired";\n' }],
    });

    assert.equal(fixture.requestCount, 1);
    assert.equal(result.status, 'verified');
    assert.notEqual(result.newHeadSha, fixture.snapshot.headSha);
    assert.deepEqual(result.changedPaths, ['src/app.mjs']);
    assert.equal(result.verification.passed, true);
    assert.equal(result.verification.complete, true);
    assert.equal(result.verification.verifiedRevision, result.newHeadSha);
    assert.equal(result.verification.currentRevision, result.newHeadSha);
  });

  it('rechecks the PR tuple after approval consumption and before the first write', async () => {
    const fixture = await createFixture();
    const session = await fixture.begin();
    const originalHead = runGit(fixture.root, ['rev-parse', '--verify', 'HEAD']);
    fixture.setAfterApprovalConsumed(() => fixture.setSnapshot({ ...fixture.snapshot, headSha: 'f'.repeat(40) }));

    await assert.rejects(fixture.validate(session, {
      version: 1,
      operations: [{ op: 'write', path: 'src/app.mjs', content: 'export const value = "must-not-write";\n' }],
    }), /approval|tuple|stale/i);

    assert.equal(fixture.requestCount, 1);
    assert.equal(await readFile(path.join(fixture.root, 'src', 'app.mjs'), 'utf8'), 'export const value = "head";\n');
    assert.equal(runGit(fixture.root, ['rev-parse', '--verify', 'HEAD']), originalHead);
  });

  it('rechecks budgets immediately before verification and blocks an exhausted verifier-stage limit', async () => {
    const maxWallClockSeconds = 30;
    const fixture = await createFixture({ maxWallClockSeconds, quickVerifierFixture: true });
    const session = await fixture.begin();
    const startedAt = Date.parse(fixture.hostContext.loopState.startedAt);
    const originalNow = Date.now;
    let budgetChecks = 0;
    Date.now = () => {
      if (new Error().stack.includes('evaluateBudgets')) {
        budgetChecks += 1;
        return startedAt + (budgetChecks < 3 ? 0 : maxWallClockSeconds * 1000);
      }
      return startedAt;
    };

    try {
      await assert.rejects(fixture.validate(session, {
        version: 1,
        operations: [{ op: 'write', path: 'src/app.mjs', content: 'export const value = "budget-check";\n' }],
      }), /max_wall_clock/);
    } finally {
      Date.now = originalNow;
    }

    assert.equal(budgetChecks, 3);
    await assert.rejects(readFile(fixture.verifierMarker),
      (error) => error?.code === 'ENOENT');
    const localHead = runGit(fixture.root, ['rev-parse', '--verify', 'HEAD']);
    const persistedState = await loadLoopState(fixture.root, 'repair-task');
    assert.notEqual(localHead, fixture.snapshot.headSha);
    assert.equal(persistedState.headSha, localHead);
    assert.equal(persistedState.iteration, fixture.hostContext.loopState.iteration);
  });

  it('does not apply a proposal when the PR tuple changed or the workspace was modified after session creation', async () => {
    const staleTuple = await createFixture();
    const staleSession = await staleTuple.begin();
    staleTuple.setSnapshot({ ...staleTuple.snapshot, headSha: 'f'.repeat(40) });
    await assert.rejects(staleTuple.validate(staleSession, {
      version: 1, operations: [{ op: 'write', path: 'src/app.mjs', content: 'changed\n' }],
    }, {}), /approval|stale|tuple/i);
    assert.equal(await readFile(path.join(staleTuple.root, 'src', 'app.mjs'), 'utf8'), 'export const value = "head";\n');

    const changedWorkspace = await createFixture();
    const session = await changedWorkspace.begin();
    await writeFile(path.join(changedWorkspace.root, 'unapproved.txt'), 'outside scope\n', 'utf8');
    await assert.rejects(changedWorkspace.validate(session, {
      version: 1, operations: [{ op: 'write', path: 'src/app.mjs', content: 'changed\n' }],
    }, {}), /workspace|fingerprint/i);
    assert.equal(changedWorkspace.requestCount, 0);
  });

  it('records provider token usage before proposal validation and fails closed when configured usage is unknown', async () => {
    const knownUsage = await createFixture({ tokenLimit: 1000 });
    const knownSession = await knownUsage.begin();
    await assert.rejects(knownUsage.validate(knownSession, {
      version: 1, operations: [{ op: 'write', path: 'src/app.mjs', content: 'x\n' }],
      model: 'untrusted',
    }, { tokenUsage: { inputTokens: 30, outputTokens: 12 } }));
    assert.equal((await loadLoopState(knownUsage.root, 'repair-task')).budgets.tokenUsed, 42);
    assert.equal(knownUsage.requestCount, 0);

    const unknownUsage = await createFixture({ tokenLimit: 1000 });
    const unknownSession = await unknownUsage.begin();
    await assert.rejects(unknownUsage.validate(unknownSession, {
      version: 1, operations: [{ op: 'write', path: 'src/app.mjs', content: 'x\n' }],
    }, {}), /unknown|budget/i);
    assert.equal((await loadLoopState(unknownUsage.root, 'repair-task')).budgets.tokenUsed, null);
    assert.equal(unknownUsage.requestCount, 0);
  });
});
