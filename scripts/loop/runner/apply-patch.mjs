import { execFileSync } from 'node:child_process';
import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';

import { readGitHeadRevision, readGitWorkspaceFingerprint } from '../verify.mjs';
import { createPolicyPatchAuthorizer } from './docker-adapter.mjs';
import { validateRunnerRequest, validateRunnerResult } from './protocol.mjs';

const MAX_PATCH_BYTES = 1024 * 1024;

export class RunnerPatchApplyError extends Error {
  constructor(code, options = {}) {
    super(code, options);
    this.name = new.target.name;
    this.code = code;
  }
}

function fail(code, cause) { throw new RunnerPatchApplyError(code, cause ? { cause } : undefined); }

function gitEnv() {
  const env = { PATH: process.env.PATH ?? '', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' };
  for (const key of ['SystemRoot', 'WINDIR']) if (process.env[key]) env[key] = process.env[key];
  return env;
}

function git(repoRoot, args, patch) {
  try {
    return execFileSync('git', ['-C', repoRoot, ...args], {
      encoding: 'buffer', env: gitEnv(), windowsHide: true, timeout: 10_000,
      maxBuffer: MAX_PATCH_BYTES + 64 * 1024, input: patch,
    });
  } catch (error) {
    if (error?.code === 'ETIMEDOUT') fail('runner_patch_git_timeout', error);
    const stderr = Buffer.isBuffer(error?.stderr) ? error.stderr.toString('utf8') : '';
    const code = /binary/i.test(stderr) ? 'runner_patch_binary_rejected'
      : /mode|symlink|submodule/i.test(stderr) ? 'runner_patch_mode_or_symlink_rejected'
        : 'runner_patch_git_rejected';
    fail(code, error);
  }
}

function parseNumstat(buffer) {
  if (!Buffer.isBuffer(buffer)) fail('runner_patch_git_metadata_invalid');
  const records = [];
  let start = 0;
  while (start < buffer.length) {
    const end = buffer.indexOf(0, start);
    if (end < 0) fail('runner_patch_git_metadata_invalid');
    const record = buffer.subarray(start, end);
    start = end + 1;
    const first = record.indexOf(0x09);
    const second = first < 0 ? -1 : record.indexOf(0x09, first + 1);
    if (first < 1 || second < 0) fail('runner_patch_rename_or_binary_rejected');
    const added = record.subarray(0, first).toString('ascii');
    const deleted = record.subarray(first + 1, second).toString('ascii');
    const rawPath = record.subarray(second + 1);
    if (!/^\d+$/.test(added) || !/^\d+$/.test(deleted) || rawPath.length === 0) fail('runner_patch_binary_rejected');
    const displayPath = rawPath.toString('utf8');
    if (!Buffer.from(displayPath, 'utf8').equals(rawPath)) fail('runner_patch_path_invalid');
    records.push(displayPath);
  }
  if (records.length === 0) fail('runner_patch_empty');
  return records;
}

function assertPatchModes(summary) {
  const text = summary.toString('utf8');
  if (!text) return;
  for (const line of text.split(/\r?\n/).filter(Boolean)) {
    const match = /^(create|delete) mode (100644|100755) (.+)$/.exec(line);
    if (!match) fail('runner_patch_mode_or_rename_rejected');
  }
}

async function assertNoLinks(repoRoot, paths) {
  for (const repoPath of paths) {
    const candidate = path.resolve(repoRoot, ...repoPath.split('/'));
    const relative = path.relative(repoRoot, candidate);
    if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) fail('runner_patch_path_invalid');
    let current = repoRoot;
    const segments = repoPath.split('/');
    for (let index = 0; index < segments.length; index += 1) {
      current = path.join(current, segments[index]);
      try {
        const info = await lstat(current);
        if (info.isSymbolicLink() || (index < segments.length - 1 && !info.isDirectory())) fail('runner_patch_symlink_rejected');
      } catch (error) {
        if (error instanceof RunnerPatchApplyError) throw error;
        if (error?.code === 'ENOENT') break;
        fail('runner_patch_path_unavailable', error);
      }
    }
  }
}

/** Apply a transient isolated patch only after rechecking the exact clean base snapshot and policy scope. */
export async function applyAuthorizedRunnerPatch({
  repoRoot,
  request: rawRequest,
  result: rawResult,
  policy,
  loopPolicy,
  expectedWorkspaceFingerprint,
  assertLease,
} = {}) {
  if (typeof repoRoot !== 'string' || !path.isAbsolute(repoRoot)
      || typeof expectedWorkspaceFingerprint !== 'string' || !/^[a-f0-9]{64}$/i.test(expectedWorkspaceFingerprint)
      || typeof assertLease !== 'function') {
    fail('runner_patch_apply_input_invalid');
  }
  const request = validateRunnerRequest(rawRequest);
  if (!rawResult || typeof rawResult !== 'object' || typeof rawResult.patch !== 'string') fail('runner_patch_missing');
  const result = validateRunnerResult(rawResult, request);
  if (result.status !== 'completed' || Buffer.byteLength(result.patch, 'utf8') > Math.min(MAX_PATCH_BYTES, request.limits.maxPatchBytes)) fail('runner_patch_invalid');
  const authorized = createPolicyPatchAuthorizer(loopPolicy, policy);
  const root = await realpath(repoRoot).catch((error) => fail('runner_repository_unavailable', error));
  const head = await readGitHeadRevision(root);
  if (head !== request.workspace.baseRevision) fail('runner_patch_stale_revision');
  const beforeFingerprint = await readGitWorkspaceFingerprint(root);
  if (beforeFingerprint !== expectedWorkspaceFingerprint.toLowerCase()) fail('runner_patch_stale_workspace');
  await assertNoLinks(root, result.changedPaths);

  const numstat = git(root, ['apply', '--numstat', '-z', '--'], Buffer.from(result.patch, 'utf8'));
  const paths = parseNumstat(numstat);
  if (new Set(paths.map((value) => value.toLowerCase())).size !== paths.length
      || [...paths].sort().join('\0') !== [...result.changedPaths].sort().join('\0')) fail('runner_patch_path_mismatch');
  const allowed = request.workspace.allowedPaths.map((value) => value.toLowerCase());
  if (paths.some((value) => !allowed.includes(value.toLowerCase())) || !authorized({ paths })) fail('runner_patch_not_authorized');
  const summary = git(root, ['apply', '--summary', '--'], Buffer.from(result.patch, 'utf8'));
  assertPatchModes(summary);
  await assertNoLinks(root, paths);
  git(root, ['apply', '--check', '--whitespace=nowarn', '--'], Buffer.from(result.patch, 'utf8'));
  // Recheck immediately before the only host write boundary.
  if (await readGitHeadRevision(root) !== head || await readGitWorkspaceFingerprint(root) !== beforeFingerprint) fail('runner_patch_stale_workspace');
  try { await assertLease(); } catch (error) { fail('runner_patch_lease_lost', error); }
  git(root, ['apply', '--whitespace=nowarn', '--'], Buffer.from(result.patch, 'utf8'));
  const appliedFingerprint = await readGitWorkspaceFingerprint(root);
  return Object.freeze({
    status: 'applied', taskId: request.task.taskId, baseRevision: head,
    workspaceFingerprint: appliedFingerprint, changedPaths: Object.freeze(paths),
  });
}
