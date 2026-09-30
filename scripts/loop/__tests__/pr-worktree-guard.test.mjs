import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { afterEach, before, describe, it } from 'node:test';
import { mkdir, mkdtemp, rename, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createGitHubAuthProvider } from '../github-auth-provider.mjs';
import { loadLoopPolicy } from '../policy.mjs';
import { createLoopState, saveLoopState } from '../state.mjs';
import { createPrBabysitterState, savePrBabysitterState } from '../pr-state.mjs';
import { readGitWorkspaceFingerprint } from '../verify.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const temporaryRoots = new Set();
const taskId = 'loop-task-42';
const repositoryId = 1234;
const allowedPaths = ['src/app.mjs'];
let policy;

before(async () => {
  policy = await loadLoopPolicy(repoRoot);
});

afterEach(async () => {
  for (const root of temporaryRoots) await rm(root, { recursive: true, force: true });
  temporaryRoots.clear();
});

async function getGuard(t) {
  let module;
  try {
    module = await import('../pr-worktree-guard.mjs');
  } catch (error) {
    if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  }
  assert.ok(module, 'pr-worktree-guard.mjs must export the planned guard');
  return module;
}

function runGit(root, args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', windowsHide: true }).trim();
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function createApprovalProvider(configuredRepositoryId = repositoryId) {
  let now = Date.parse('2026-09-29T04:00:00.000Z');
  const prompt = async () => true;
  Object.defineProperty(prompt, 'isTTY', { value: true });

  const fetchImpl = async (input) => {
    const url = new URL(input);
    if (url.href === 'https://github.com/login/device/code') {
      return jsonResponse({
        device_code: 'device-code',
        user_code: 'ABCD-EFGH',
        verification_uri: 'https://github.com/login/device',
        expires_in: 900,
        interval: 1,
      });
    }
    if (url.href === 'https://github.com/login/oauth/access_token') {
      return jsonResponse({ access_token: 'short-lived-user-token', token_type: 'bearer' });
    }
    if (url.href === 'https://api.github.com/user') {
      return jsonResponse({ id: 1001, login: 'trusted-maintainer' });
    }
    if (url.href === 'https://api.github.com/repositories/' + configuredRepositoryId) {
      return jsonResponse({
        id: configuredRepositoryId,
        full_name: 'owner/repo',
        permissions: { pull: true, push: true, admin: false },
      });
    }
    return jsonResponse({ message: 'not found' }, 404);
  };

  const provider = createGitHubAuthProvider({
    appId: 1,
    appClientId: 'test-client',
    installationId: 2,
    repositoryId: configuredRepositoryId,
    getAppPrivateKey: async () => 'unused-in-this-test',
    trustedApproverIds: [1001],
    fetchImpl,
    prompt,
    clock: {
      now: () => now,
      sleep: async (milliseconds) => { now += milliseconds; },
    },
  });

  return {
    provider,
    expire() { now += 15 * 60 * 1000; },
  };
}

async function createFixture(options = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'digital-e-pr-worktree-'));
  temporaryRoots.add(root);
  execFileSync('git', ['-C', root, 'init', '--quiet'], { windowsHide: true, stdio: 'ignore' });
  runGit(root, ['config', 'user.name', 'Digital-E Test']);
  runGit(root, ['config', 'user.email', 'digital-e-test@example.invalid']);
  await writeFile(path.join(root, '.gitignore'), '.loop/\n', 'utf8');
  await mkdir(path.join(root, 'src'), { recursive: true });
  await writeFile(path.join(root, 'src', 'app.mjs'), 'export const state = "base";\n', 'utf8');
  runGit(root, ['add', '--', '.gitignore', 'src/app.mjs']);
  runGit(root, ['commit', '--quiet', '--allow-empty', '-m', 'base fixture']);
  runGit(root, ['branch', '-M', 'main']);
  const baseSha = runGit(root, ['rev-parse', '--verify', 'HEAD']).toLowerCase();

  const branch = options.branch ?? 'feature/pr-repair';
  if (branch !== 'main') {
    runGit(root, ['switch', '--quiet', '-c', branch]);
    await writeFile(path.join(root, 'src', 'app.mjs'), 'export const state = "head";\n', 'utf8');
    runGit(root, ['add', '--', 'src/app.mjs']);
    runGit(root, ['commit', '--quiet', '-m', 'feature fixture']);
  }
  const headSha = runGit(root, ['rev-parse', '--verify', 'HEAD']).toLowerCase();
  const number = options.number ?? 42;
  const snapshot = {
    repository: 'owner/repo',
    repositoryId,
    number,
    state: 'open',
    draft: false,
    baseRef: 'main',
    baseSha,
    headRef: branch,
    headSha,
    mergeSha: 'c'.repeat(40),
    headRepository: 'owner/repo',
    updatedAt: '2026-09-29T04:00:00.000Z',
    ...options.snapshotOverrides,
  };
  const stateSnapshot = { ...snapshot };
  delete stateSnapshot.repositoryId;
  const prState = createPrBabysitterState({
    ...stateSnapshot,
    ...options.prStateOverrides,
    engineeringTaskId: options.prTaskId ?? taskId,
  });
  await savePrBabysitterState(root, prState);

  const loopTaskId = options.loopTaskId ?? taskId;
  const loopState = createLoopState({
    taskId: loopTaskId,
    branch,
    baseSha,
    headSha,
    risk: 'low',
    acceptanceCriteria: ['unit-tests'],
    policy,
    ...options.loopStateOverrides,
  });
  await saveLoopState(root, loopState);

  const approval = createApprovalProvider(options.providerRepositoryId ?? repositoryId);
  let currentSnapshot = snapshot;
  const hostContext = {
    prState,
    loopState,
    taskId: options.contextTaskId ?? taskId,
    taskWorktreeId: options.taskWorktreeId ?? taskId,
    allowedPaths: options.allowedPaths ?? allowedPaths,
    approvalProvider: approval.provider,
    refreshPrSnapshot: async () => currentSnapshot,
    ...(Object.hasOwn(options, 'persistedWorkspaceFingerprint')
      ? { persistedWorkspaceFingerprint: options.persistedWorkspaceFingerprint }
      : {}),
  };

  return {
    root,
    branch,
    snapshot,
    prState,
    loopState,
    approvalProvider: approval.provider,
    hostContext,
    setCurrentSnapshot(value) { currentSnapshot = value; },
    createApproval: async (overrides = {}, provider = approval.provider) => {
      await provider.authenticateApprover();
      return provider.requestApproval({
        repositoryId: options.providerRepositoryId ?? repositoryId,
        prNumber: number,
        baseSha: snapshot.baseSha,
        headSha: snapshot.headSha,
        mergeSha: snapshot.mergeSha,
        capability: 'repair:workspace',
        paths: allowedPaths,
        ...overrides,
      });
    },
    expireApproval: approval.expire,
  };
}

describe('PR worktree ownership guard', () => {
  it('accepts the same-repository feature worktree and captures a bounded workspace fingerprint', async (t) => {
    const guard = await getGuard(t);
    const fixture = await createFixture();
    const result = await guard.inspectPrWorktree(fixture.root, fixture.snapshot, fixture.hostContext);

    assert.equal(result.branch, fixture.branch);
    assert.equal(result.headSha, fixture.snapshot.headSha);
    assert.equal(result.baseSha, fixture.snapshot.baseSha);
    assert.equal(result.mergeSha, fixture.snapshot.mergeSha);
    assert.equal(result.taskId, taskId);
    assert.equal(result.taskWorktreeId, taskId);
    assert.equal(result.dirty, false);
    assert.match(result.workspaceFingerprint, /^[a-f0-9]{64}$/);
  });

  it('rejects a repository root that is not a real Git checkout', async (t) => {
    const guard = await getGuard(t);
    const root = await mkdtemp(path.join(os.tmpdir(), 'digital-e-not-git-'));
    temporaryRoots.add(root);
    const fixture = await createFixture();

    await assert.rejects(
      guard.inspectPrWorktree(root, fixture.snapshot, fixture.hostContext),
      /git|checkout|repository/i,
    );
  });

  it('rejects detached HEAD instead of guessing the PR branch', async (t) => {
    const guard = await getGuard(t);
    const fixture = await createFixture();
    runGit(fixture.root, ['checkout', '--quiet', '--detach', 'HEAD']);

    await assert.rejects(
      guard.inspectPrWorktree(fixture.root, fixture.snapshot, fixture.hostContext),
      /branch|detached/i,
    );
  });

  it('rejects a local main branch even when the PR snapshot claims main', async (t) => {
    const guard = await getGuard(t);
    const fixture = await createFixture({ branch: 'main' });

    await assert.rejects(
      guard.inspectPrWorktree(fixture.root, fixture.snapshot, fixture.hostContext),
      /main|protected/i,
    );
  });

  it('rejects a branch that does not match the observed PR head ref', async (t) => {
    const guard = await getGuard(t);
    const fixture = await createFixture({ snapshotOverrides: { headRef: 'feature/other' } });

    await assert.rejects(
      guard.inspectPrWorktree(fixture.root, fixture.snapshot, fixture.hostContext),
      /branch|head ref|worktree/i,
    );
  });

  it('rejects fork PRs even when the local branch name and SHA match', async (t) => {
    const guard = await getGuard(t);
    const fixture = await createFixture({ snapshotOverrides: { headRepository: 'contributor/fork' } });

    await assert.rejects(
      guard.inspectPrWorktree(fixture.root, fixture.snapshot, fixture.hostContext),
      /fork|repository|same-repo/i,
    );
  });

  it('rejects a local HEAD that is stale or advanced from the PR head SHA', async (t) => {
    const guard = await getGuard(t);
    const fixture = await createFixture();
    await writeFile(path.join(fixture.root, 'src', 'app.mjs'), 'export const state = "advanced";\n', 'utf8');
    runGit(fixture.root, ['add', '--', 'src/app.mjs']);
    runGit(fixture.root, ['commit', '--quiet', '-m', 'unexpected local advance']);

    await assert.rejects(
      guard.inspectPrWorktree(fixture.root, fixture.snapshot, fixture.hostContext),
      /head|revision|stale/i,
    );
  });

  it('rejects PR state whose saved base/head/merge tuple differs from the fresh snapshot', async (t) => {
    const guard = await getGuard(t);
    const fixture = await createFixture({ prStateOverrides: { mergeSha: 'd'.repeat(40) } });

    await assert.rejects(
      guard.inspectPrWorktree(fixture.root, fixture.snapshot, fixture.hostContext),
      /state|tuple|merge/i,
    );
  });

  it('rejects an advanced base SHA before consuming a workspace approval', async (t) => {
    const guard = await getGuard(t);
    const fixture = await createFixture();
    const result = await guard.inspectPrWorktree(fixture.root, fixture.snapshot, fixture.hostContext);
    const approval = await fixture.createApproval();
    fixture.setCurrentSnapshot({ ...fixture.snapshot, baseSha: 'd'.repeat(40) });

    await assert.rejects(guard.assertRepairWorkspace(result, approval), /stale|tuple|snapshot/i);

    fixture.setCurrentSnapshot(fixture.snapshot);
    await guard.assertRepairWorkspace(result, approval);
  });

  it('rechecks changed head and merge SHAs through the trusted snapshot refresher', async (t) => {
    const guard = await getGuard(t);
    for (const field of ['headSha', 'mergeSha']) {
      const fixture = await createFixture();
      const result = await guard.inspectPrWorktree(fixture.root, fixture.snapshot, fixture.hostContext);
      fixture.setCurrentSnapshot({ ...fixture.snapshot, [field]: 'f'.repeat(40) });

      await assert.rejects(guard.assertCurrentPrTuple(result), /stale|tuple|snapshot/i);
    }
  });

  it('rejects state for another task or a LoopState at another branch revision', async (t) => {
    const guard = await getGuard(t);
    const wrongTask = await createFixture({ loopTaskId: 'other-task' });
    await assert.rejects(
      guard.inspectPrWorktree(wrongTask.root, wrongTask.snapshot, wrongTask.hostContext),
      /task|state/i,
    );

    const staleLoopState = await createFixture({ loopStateOverrides: { headSha: 'f'.repeat(40) } });
    await assert.rejects(
      guard.inspectPrWorktree(staleLoopState.root, staleLoopState.snapshot, staleLoopState.hostContext),
      /head|revision|state/i,
    );
  });

  it('rejects a symlinked PR state directory that escapes the repository', async (t) => {
    const guard = await getGuard(t);
    const fixture = await createFixture();
    const stateDirectory = path.join(fixture.root, '.loop', 'pr');
    const escapedDirectory = await mkdtemp(path.join(os.tmpdir(), 'digital-e-pr-state-escape-'));
    temporaryRoots.add(escapedDirectory);
    const savedDirectory = path.join(escapedDirectory, 'saved-pr-state');
    await rename(stateDirectory, savedDirectory);
    await symlink(savedDirectory, stateDirectory, process.platform === 'win32' ? 'junction' : 'dir');

    await assert.rejects(
      guard.inspectPrWorktree(fixture.root, fixture.snapshot, fixture.hostContext),
      /symlink|escape|state path|directory/i,
    );
  });

  it('blocks arbitrary dirty files and allows only a task-bound persisted workspace fingerprint', async (t) => {
    const guard = await getGuard(t);
    const unapproved = await createFixture();
    await writeFile(path.join(unapproved.root, 'unexpected.txt'), 'unapproved\n', 'utf8');
    await assert.rejects(
      guard.inspectPrWorktree(unapproved.root, unapproved.snapshot, unapproved.hostContext),
      /dirty|fingerprint|worktree/i,
    );

    const authorized = await createFixture();
    await writeFile(path.join(authorized.root, 'expected-task-change.txt'), 'task change\n', 'utf8');
    authorized.hostContext.persistedWorkspaceFingerprint = await readGitWorkspaceFingerprint(authorized.root);
    const result = await guard.inspectPrWorktree(authorized.root, authorized.snapshot, authorized.hostContext);
    assert.equal(result.dirty, true);
    assert.equal(result.workspaceFingerprint, authorized.hostContext.persistedWorkspaceFingerprint);

    const stale = await createFixture({ persistedWorkspaceFingerprint: '0'.repeat(64) });
    await writeFile(path.join(stale.root, 'unexpected.txt'), 'unapproved\n', 'utf8');
    await assert.rejects(
      guard.inspectPrWorktree(stale.root, stale.snapshot, stale.hostContext),
      /dirty|fingerprint|worktree/i,
    );

    const wrongTask = await createFixture({ taskWorktreeId: 'another-task' });
    await assert.rejects(
      guard.inspectPrWorktree(wrongTask.root, wrongTask.snapshot, wrongTask.hostContext),
      /task|worktree/i,
    );
  });

  it('does not create approval and consumes only a provider-issued exact-scope approval after refreshing the tuple', async (t) => {
    const guard = await getGuard(t);
    const fixture = await createFixture();
    const result = await guard.inspectPrWorktree(fixture.root, fixture.snapshot, fixture.hostContext);
    await assert.rejects(guard.assertRepairWorkspace(result, {}), /approval|invalid/i);

    const approval = await fixture.createApproval();
    await guard.assertRepairWorkspace(result, approval);
    await assert.rejects(guard.assertRepairWorkspace(result, approval), /replay|consum/i);
  });

  it('rejects reconstructed worktree results and approvals from another PR', async (t) => {
    const guard = await getGuard(t);
    const first = await createFixture();
    const second = await createFixture({ number: 43, providerRepositoryId: repositoryId });
    second.hostContext.approvalProvider = first.approvalProvider;
    const result = await guard.inspectPrWorktree(second.root, second.snapshot, second.hostContext);
    const approval = await first.createApproval();

    await assert.rejects(
      guard.assertRepairWorkspace({ ...result }, approval),
      /result|guard|approval/i,
    );
    await assert.rejects(guard.assertRepairWorkspace(result, approval), /scope|approval|PR/i);
  });

  it('rejects an approval provider configured for another repository', async (t) => {
    const guard = await getGuard(t);
    const fixture = await createFixture({ providerRepositoryId: 9999 });
    const result = await guard.inspectPrWorktree(fixture.root, fixture.snapshot, fixture.hostContext);
    const approval = await fixture.createApproval();

    await assert.rejects(guard.assertRepairWorkspace(result, approval), /scope|repository|approval/i);
  });

  it('rejects approvals bound to a different SHA tuple, capability, expiry, or path scope', async (t) => {
    const guard = await getGuard(t);
    const cases = [
      ['base SHA', { baseSha: 'e'.repeat(40) }],
      ['head SHA', { headSha: 'f'.repeat(40) }],
      ['merge SHA', { mergeSha: 'e'.repeat(40) }],
      ['capability', { capability: 'contents:write' }],
      ['path scope', { paths: ['src/other.mjs'] }],
    ];
    for (const [label, overrides] of cases) {
      const fixture = await createFixture();
      const result = await guard.inspectPrWorktree(fixture.root, fixture.snapshot, fixture.hostContext);
      const approval = await fixture.createApproval(overrides);
      await assert.rejects(guard.assertRepairWorkspace(result, approval), /scope|approval/i, label);
    }

    const expired = await createFixture();
    const expiredResult = await guard.inspectPrWorktree(expired.root, expired.snapshot, expired.hostContext);
    const expiredApproval = await expired.createApproval();
    expired.expireApproval();
    await assert.rejects(guard.assertRepairWorkspace(expiredResult, expiredApproval), /expir|approval/i);
  });
});
