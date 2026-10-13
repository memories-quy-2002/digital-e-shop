import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, before, it } from 'node:test';

import { loadLoopPolicy } from '../policy.mjs';
import { readGitHeadRevision, readGitWorkspaceFingerprint } from '../verify.mjs';
import { applyAuthorizedRunnerPatch } from '../runner/apply-patch.mjs';

const issueBody = 'Replace the sample documentation wording.';
const taskId = 'repo-1234-issue-42-g1';
const roots = new Set();
let loopPolicy;
before(async () => { loopPolicy = await loadLoopPolicy(); });
afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.clear();
});

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'runner-patch-test-'));
  roots.add(root);
  execFileSync('git', ['init', '--quiet', root]);
  execFileSync('git', ['-C', root, 'config', 'user.name', 'Test']);
  execFileSync('git', ['-C', root, 'config', 'user.email', 'test@example.invalid']);
  mkdirSync(path.join(root, 'docs'), { recursive: true });
  writeFileSync(path.join(root, 'docs/API.md'), 'old API text\n');
  writeFileSync(path.join(root, 'docs/TESTING.md'), 'old testing text\n');
  execFileSync('git', ['-C', root, 'add', '--all']);
  execFileSync('git', ['-C', root, 'commit', '--quiet', '-m', 'fixture']);
  return root;
}

function requestFor(root, sourceRevision) {
  return {
    schemaVersion: 1,
    task: {
      taskId, repositoryId: 1234, issueNumber: 42, generation: 1,
      requestDigest: createHash('sha256').update(issueBody).digest('hex'), sourceRevision, policyRevision: sourceRevision,
    },
    untrustedContext: { issueTitle: 'Docs wording', issueBody },
    workspace: { path: root, baseRevision: sourceRevision, allowedPaths: ['docs/API.md'] },
    limits: { wallClockSeconds: 30, maxOutputBytes: 16 * 1024, maxPatchBytes: 4096 },
    capabilities: ['read_checkout', 'write_worktree'],
  };
}

function result(request, patch, changedPaths = ['docs/API.md']) {
  return {
    schemaVersion: 1, taskId, status: 'completed', baseRevision: request.workspace.baseRevision,
    resultRevision: 'b'.repeat(40), workspaceFingerprint: 'c'.repeat(64),
    changedPaths, patchBytes: Buffer.byteLength(patch), exitReason: null, patch,
  };
}

const safePatch = 'diff --git a/docs/API.md b/docs/API.md\nindex 1111111..2222222 100644\n--- a/docs/API.md\n+++ b/docs/API.md\n@@ -1 +1 @@\n-old API text\n+new API text\n';
const autonomyPolicy = Object.freeze({
  enabled: true, autoMergeEnabled: false,
  eligiblePaths: ['docs/API.md'], eligibleRisks: ['low', 'medium'],
});

it('applies a transient patch only at the exact base fingerprint and returns a host-observed fingerprint', async () => {
  const repoRoot = fixture();
  const base = await readGitHeadRevision(repoRoot);
  const request = requestFor(repoRoot, base);
  const before = await readGitWorkspaceFingerprint(repoRoot);
  const applied = await applyAuthorizedRunnerPatch({
    repoRoot, request, result: result(request, safePatch), policy: autonomyPolicy, loopPolicy,
    expectedWorkspaceFingerprint: before,
    assertLease: async () => {},
  });
  assert.equal(applied.status, 'applied');
  assert.equal(applied.baseRevision, base);
  assert.deepEqual(applied.changedPaths, ['docs/API.md']);
  assert.equal(applied.workspaceFingerprint, await readGitWorkspaceFingerprint(repoRoot));
  assert.notEqual(applied.workspaceFingerprint, before);
});

it('refuses a stale host fingerprint before writing', async () => {
  const repoRoot = fixture();
  const base = await readGitHeadRevision(repoRoot);
  const request = requestFor(repoRoot, base);
  await assert.rejects(applyAuthorizedRunnerPatch({
    repoRoot, request, result: result(request, safePatch), policy: autonomyPolicy, loopPolicy,
    expectedWorkspaceFingerprint: 'f'.repeat(64),
    assertLease: async () => {},
  }), { code: 'runner_patch_stale_workspace' });
});

it('uses Git parsed affected paths rather than trusting diff headers or result metadata', async () => {
  const repoRoot = fixture();
  const base = await readGitHeadRevision(repoRoot);
  const request = requestFor(repoRoot, base);
  const mismatched = safePatch.replace('--- a/docs/API.md\n+++ b/docs/API.md', '--- a/docs/TESTING.md\n+++ b/docs/TESTING.md');
  const before = await readGitWorkspaceFingerprint(repoRoot);
  await assert.rejects(applyAuthorizedRunnerPatch({
    repoRoot, request, result: result(request, mismatched), policy: autonomyPolicy, loopPolicy,
    expectedWorkspaceFingerprint: before,
    assertLease: async () => {},
  }), { code: 'runner_patch_path_mismatch' });
  assert.equal(await readGitWorkspaceFingerprint(repoRoot), before);
});

it('rejects symlink mode patches even if Git reports an allowed path', async () => {
  const repoRoot = fixture();
  const base = await readGitHeadRevision(repoRoot);
  const request = requestFor(repoRoot, base);
  const symlinkPatch = safePatch.replace('index 1111111..2222222 100644\n', 'old mode 100644\nnew mode 120000\nindex 1111111..2222222\n');
  const before = await readGitWorkspaceFingerprint(repoRoot);
  await assert.rejects(applyAuthorizedRunnerPatch({
    repoRoot, request, result: result(request, symlinkPatch), policy: autonomyPolicy, loopPolicy,
    expectedWorkspaceFingerprint: before,
    assertLease: async () => {},
  }));
  assert.equal(await readGitWorkspaceFingerprint(repoRoot), before);
});
