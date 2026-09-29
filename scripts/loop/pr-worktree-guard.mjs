import { execFile } from 'node:child_process';
import { isDeepStrictEqual, promisify } from 'node:util';
import { realpath } from 'node:fs/promises';
import path from 'node:path';

import { normalizeRepoPath } from './classify-risk.mjs';
import { normalizePrSnapshot, PrEvidenceError } from './pr-evidence.mjs';
import { loadPrBabysitterState, PrBabysitterStatePathError, validatePrBabysitterState } from './pr-state.mjs';
import { loadLoopState, LoopStatePathError, validateLoopState } from './state.mjs';
import { readGitHeadRevision, readGitWorkspaceFingerprint } from './verify.mjs';

const execFileAsync = promisify(execFile);
const SHA_PATTERN = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i;
const FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/i;
const HOST_CONTEXT_KEYS = Object.freeze([
  'prState',
  'loopState',
  'taskId',
  'taskWorktreeId',
  'allowedPaths',
  'approvalProvider',
  'refreshPrSnapshot',
  'persistedWorkspaceFingerprint',
]);
const REQUIRED_HOST_CONTEXT_KEYS = Object.freeze(HOST_CONTEXT_KEYS.filter((key) => key !== 'persistedWorkspaceFingerprint'));
const SNAPSHOT_KEYS = Object.freeze([
  'repository',
  'repositoryId',
  'baseRepositoryId',
  'headRepositoryId',
  'number',
  'state',
  'draft',
  'baseRef',
  'baseSha',
  'headRef',
  'headSha',
  'mergeSha',
  'headRepository',
  'updatedAt',
  'mergeability',
  'defaultBranch',
]);
const worktreeContexts = new WeakMap();

export class PrWorktreeGuardError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = new.target.name;
    this.code = code;
  }
}

function fail(code, message, cause) {
  throw new PrWorktreeGuardError(code, message, cause ? { cause } : undefined);
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertExactKeys(value, keys, requiredKeys, label) {
  if (!isPlainObject(value)) fail('invalid_input', label + ' must be a plain object');
  if (Object.keys(value).some((key) => !keys.includes(key))) {
    fail('invalid_input', label + ' contains unsupported fields');
  }
  if (requiredKeys.some((key) => !Object.hasOwn(value, key))) {
    fail('invalid_input', label + ' is missing required fields');
  }
}

function safeGitEnvironment() {
  const env = { PATH: process.env.PATH ?? '' };
  for (const key of ['SystemRoot', 'WINDIR']) {
    if (process.env[key]) env[key] = process.env[key];
  }
  return env;
}

async function runGit(repoRoot, args, { binary = false } = {}) {
  try {
    const result = await execFileAsync('git', ['-C', repoRoot, ...args], {
      encoding: binary ? null : 'utf8',
      env: safeGitEnvironment(),
      maxBuffer: 1024 * 1024,
      timeout: 5000,
      windowsHide: true,
    });
    return result.stdout;
  } catch (error) {
    throw new PrWorktreeGuardError('git_inspection_failed', 'could not safely inspect the repository worktree', { cause: error });
  }
}

function samePath(left, right) {
  const a = path.resolve(left);
  const b = path.resolve(right);
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function assertFingerprint(value, label) {
  if (typeof value !== 'string' || !FINGERPRINT_PATTERN.test(value)) {
    fail('invalid_workspace_fingerprint', label + ' must be a SHA-256 hex digest');
  }
  return value.toLowerCase();
}

function normalizeSnapshot(input) {
  assertExactKeys(input, SNAPSHOT_KEYS, [
    'repository',
    'number',
    'state',
    'draft',
    'baseRef',
    'baseSha',
    'headRef',
    'headSha',
    'mergeSha',
    'headRepository',
    'updatedAt',
  ], 'PR snapshot');
  let snapshot;
  try {
    snapshot = normalizePrSnapshot({
      repository: input.repository,
      number: input.number,
      state: input.state,
      draft: input.draft,
      baseRef: input.baseRef,
      baseSha: input.baseSha,
      headRef: input.headRef,
      headSha: input.headSha,
      mergeSha: input.mergeSha,
      headRepository: input.headRepository,
      updatedAt: input.updatedAt,
    });
  } catch (error) {
    if (error instanceof PrEvidenceError) fail('invalid_pr_snapshot', 'PR snapshot is invalid', error);
    throw error;
  }
  const repositoryId = input.repositoryId ?? input.baseRepositoryId;
  if (!Number.isSafeInteger(repositoryId) || repositoryId < 1) {
    fail('invalid_pr_snapshot', 'PR snapshot must include the base repository ID');
  }
  if (input.baseRepositoryId !== undefined && input.baseRepositoryId !== repositoryId) {
    fail('repository_mismatch', 'PR snapshot base repository IDs do not match');
  }
  if (input.headRepositoryId !== undefined && input.headRepositoryId !== null
      && input.headRepositoryId !== repositoryId) {
    fail('fork_pr_unsupported', 'fork pull requests cannot enter the repair worktree');
  }
  if (snapshot.headRepository.toLowerCase() !== snapshot.repository.toLowerCase()) {
    fail('fork_pr_unsupported', 'fork pull requests cannot enter the repair worktree');
  }
  if (snapshot.baseRef !== 'main') {
    fail('unsupported_pr_base', 'repair worktrees must target main');
  }
  if (snapshot.headRef.toLowerCase() === 'main') {
    fail('protected_head_branch', 'the main branch cannot be used as a PR repair branch');
  }
  if (snapshot.state !== 'open') fail('closed_pr', 'only an open pull request can be repaired');
  if (!SHA_PATTERN.test(snapshot.baseSha) || !SHA_PATTERN.test(snapshot.headSha)
      || (snapshot.mergeSha !== null && !SHA_PATTERN.test(snapshot.mergeSha))) {
    fail('invalid_pr_snapshot', 'PR snapshot contains an invalid revision');
  }
  return Object.freeze({ ...snapshot, repositoryId, baseSha: snapshot.baseSha.toLowerCase(), headSha: snapshot.headSha.toLowerCase(), mergeSha: snapshot.mergeSha?.toLowerCase() ?? null });
}

function sameTuple(left, right) {
  return left.baseSha === right.baseSha
    && left.headSha === right.headSha
    && left.mergeSha === right.mergeSha;
}

function samePrIdentity(left, right) {
  return left.repository === right.repository
    && left.repositoryId === right.repositoryId
    && left.number === right.number
    && left.baseRef === right.baseRef
    && left.headRef === right.headRef
    && left.headRepository === right.headRepository;
}

function normalizePathScope(paths) {
  if (!Array.isArray(paths) || paths.length < 1 || paths.length > 100) {
    fail('invalid_path_scope', 'repair path scope must contain 1 to 100 repository paths');
  }
  let normalized;
  try {
    normalized = paths.map((value) => normalizeRepoPath(value)).sort();
  } catch (error) {
    fail('invalid_path_scope', 'repair path scope contains an unsafe repository path', error);
  }
  if (new Set(normalized).size !== normalized.length) {
    fail('invalid_path_scope', 'repair path scope must not contain duplicate paths');
  }
  return Object.freeze(normalized);
}

function assertHostContext(context) {
  assertExactKeys(context, HOST_CONTEXT_KEYS, REQUIRED_HOST_CONTEXT_KEYS, 'host context');
  if (typeof context.taskId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(context.taskId)) {
    fail('invalid_task_identity', 'host context taskId must be a safe task identifier');
  }
  if (context.taskWorktreeId !== context.taskId) {
    fail('task_worktree_mismatch', 'the host task-worktree identity must match the persisted task ID');
  }
  if (!context.approvalProvider || typeof context.approvalProvider.consumeApproval !== 'function') {
    fail('approval_provider_unavailable', 'a trusted GitHub approval provider is required');
  }
  if (typeof context.refreshPrSnapshot !== 'function') {
    fail('snapshot_refresh_unavailable', 'a trusted PR snapshot refresher is required');
  }
  if (Object.hasOwn(context, 'persistedWorkspaceFingerprint')) {
    assertFingerprint(context.persistedWorkspaceFingerprint, 'persistedWorkspaceFingerprint');
  }
  return Object.freeze({
    ...context,
    allowedPaths: normalizePathScope(context.allowedPaths),
    persistedWorkspaceFingerprint: context.persistedWorkspaceFingerprint?.toLowerCase() ?? null,
  });
}

async function resolveRepositoryRoot(repoRoot) {
  if (typeof repoRoot !== 'string' || repoRoot.length === 0) {
    fail('invalid_repository_root', 'repoRoot must be a non-empty path');
  }
  let realRoot;
  try {
    realRoot = await realpath(path.resolve(repoRoot));
  } catch (error) {
    fail('invalid_repository_root', 'repository root could not be resolved', error);
  }
  if (!samePath(path.resolve(repoRoot), realRoot)) {
    fail('repository_root_symlink', 'repository root must not resolve through a symlink or junction');
  }

  const gitRootText = await runGit(realRoot, ['rev-parse', '--show-toplevel']);
  let gitRoot;
  try {
    gitRoot = await realpath(String(gitRootText).trim());
  } catch (error) {
    fail('not_git_checkout', 'repository root is not a Git checkout', error);
  }
  if (!samePath(realRoot, gitRoot)) {
    fail('repository_root_mismatch', 'repoRoot must identify the top-level Git worktree');
  }
  return realRoot;
}

async function readCurrentBranch(repoRoot) {
  const output = await runGit(repoRoot, ['symbolic-ref', '--quiet', '--short', 'HEAD']).catch((error) => {
    if (error instanceof PrWorktreeGuardError) fail('detached_head', 'detached HEAD cannot be repaired');
    throw error;
  });
  const branch = String(output).trim();
  if (!branch || /[\u0000-\u001f\u007f]/.test(branch)) fail('invalid_branch', 'current Git branch is invalid');
  return branch;
}

async function readWorktreeStatus(repoRoot) {
  const output = await runGit(repoRoot, [
    '-c', 'core.fsmonitor=false',
    '-c', 'core.untrackedCache=false',
    'status', '--porcelain=v1', '-z', '--untracked-files=all', '--no-renames', '--ignore-submodules=none',
  ], { binary: true });
  if (!Buffer.isBuffer(output)) fail('git_inspection_failed', 'Git worktree status was not a byte buffer');
  return output;
}

async function loadAndValidateStates(repoRoot, snapshot, context) {
  try {
    validatePrBabysitterState(context.prState);
    validateLoopState(context.loopState);
    const [savedPrState, savedLoopState] = await Promise.all([
      loadPrBabysitterState(repoRoot, snapshot.repository, snapshot.number),
      loadLoopState(repoRoot, context.taskId),
    ]);
    if (!isDeepStrictEqual(context.prState, savedPrState)
        || !isDeepStrictEqual(context.loopState, savedLoopState)) {
      fail('stale_host_state', 'caller state differs from the canonical persisted PR or LoopState');
    }
    const prState = savedPrState;
    const loopState = savedLoopState;
    if (prState.repository !== snapshot.repository || prState.prNumber !== snapshot.number
        || prState.branch !== snapshot.headRef || prState.baseRef !== snapshot.baseRef
        || prState.baseSha !== snapshot.baseSha || prState.headSha !== snapshot.headSha
        || prState.mergeSha !== snapshot.mergeSha) {
      fail('stale_pr_state', 'saved PR state does not match the current branch and SHA tuple');
    }
    if (prState.engineeringTaskId !== context.taskId
        || loopState.taskId !== context.taskId
        || loopState.branch !== snapshot.headRef
        || loopState.baseSha !== snapshot.baseSha
        || loopState.headSha !== snapshot.headSha) {
      fail('task_state_mismatch', 'LoopState and PR state must match the current task, branch, and head revision');
    }
    return { prState, loopState };
  } catch (error) {
    if (error instanceof PrWorktreeGuardError) throw error;
    if (error instanceof PrBabysitterStatePathError || error instanceof LoopStatePathError) {
      fail('unsafe_state_path', 'PR or LoopState path is unsafe: ' + error.message, error);
    }
    fail('state_unavailable', 'validated PR and LoopState files could not be loaded', error);
  }
}

async function captureStableWorktree(repoRoot, expectedHeadSha) {
  const firstHead = await readGitHeadRevision(repoRoot).catch((error) => {
    fail('git_inspection_failed', 'could not read local HEAD', error);
  });
  if (firstHead !== expectedHeadSha) fail('stale_local_head', 'local HEAD does not equal the observed PR head SHA');
  const statusBefore = await readWorktreeStatus(repoRoot);
  const fingerprint = await readGitWorkspaceFingerprint(repoRoot).catch((error) => {
    fail('workspace_fingerprint_failed', 'could not capture a repository-contained workspace fingerprint', error);
  });
  const statusAfter = await readWorktreeStatus(repoRoot);
  const fingerprintAfter = await readGitWorkspaceFingerprint(repoRoot).catch((error) => {
    fail('workspace_fingerprint_failed', 'could not confirm a stable workspace fingerprint', error);
  });
  const finalHead = await readGitHeadRevision(repoRoot).catch((error) => {
    fail('git_inspection_failed', 'could not confirm local HEAD', error);
  });
  if (firstHead !== finalHead || !statusBefore.equals(statusAfter) || fingerprint !== fingerprintAfter) {
    fail('workspace_changed_during_inspection', 'Git HEAD or workspace snapshot changed during inspection');
  }
  return {
    headSha: firstHead,
    dirty: statusBefore.length > 0,
    workspaceFingerprint: fingerprint,
  };
}

function getResultContext(result) {
  const context = result && typeof result === 'object' ? worktreeContexts.get(result) : undefined;
  if (!context) fail('invalid_guard_result', 'worktree guard result was not created by inspectPrWorktree');
  return context;
}

async function refreshAndCompare(context) {
  let rawSnapshot;
  try {
    rawSnapshot = await context.refreshPrSnapshot();
  } catch (error) {
    fail('pr_snapshot_unavailable', 'could not refresh the PR snapshot before a repair action', error);
  }
  const fresh = normalizeSnapshot(rawSnapshot);
  if (!samePrIdentity(fresh, context.snapshot) || !sameTuple(fresh, context.snapshot)) {
    fail('stale_pr_tuple', 'the current PR identity or base/head/merge SHA tuple changed');
  }
  return fresh;
}

export async function inspectPrWorktree(repoRoot, prSnapshot, hostContext) {
  const context = assertHostContext(hostContext);
  const snapshot = normalizeSnapshot(prSnapshot);
  const realRoot = await resolveRepositoryRoot(repoRoot);
  const { prState, loopState } = await loadAndValidateStates(realRoot, snapshot, context);
  const branch = await readCurrentBranch(realRoot);
  if (branch.toLowerCase() === 'main') fail('protected_head_branch', 'the main branch cannot be used as a PR repair branch');
  if (branch !== snapshot.headRef) fail('branch_mismatch', 'current Git branch does not match the PR head ref');

  const captured = await captureStableWorktree(realRoot, snapshot.headSha);
  if (context.persistedWorkspaceFingerprint !== null
      && context.persistedWorkspaceFingerprint !== captured.workspaceFingerprint) {
    fail('workspace_fingerprint_mismatch', 'current workspace differs from the host-persisted task fingerprint');
  }
  if (captured.dirty && context.persistedWorkspaceFingerprint === null) {
    fail('dirty_worktree', 'dirty worktrees require an identified task worktree and a persisted matching fingerprint');
  }

  const result = Object.freeze({
    repository: snapshot.repository,
    repositoryId: snapshot.repositoryId,
    prNumber: snapshot.number,
    branch,
    baseSha: snapshot.baseSha,
    headSha: snapshot.headSha,
    mergeSha: snapshot.mergeSha,
    taskId: loopState.taskId,
    taskWorktreeId: context.taskWorktreeId,
    dirty: captured.dirty,
    workspaceFingerprint: captured.workspaceFingerprint,
  });
  worktreeContexts.set(result, {
    repoRoot: realRoot,
    snapshot,
    taskId: loopState.taskId,
    taskWorktreeId: context.taskWorktreeId,
    allowedPaths: context.allowedPaths,
    approvalProvider: context.approvalProvider,
    refreshPrSnapshot: context.refreshPrSnapshot,
    workspaceFingerprint: captured.workspaceFingerprint,
    prState,
    loopState,
  });
  return result;
}

export async function assertCurrentPrTuple(result) {
  const context = getResultContext(result);
  await resolveRepositoryRoot(context.repoRoot);
  const branch = await readCurrentBranch(context.repoRoot);
  if (branch !== context.snapshot.headRef) fail('branch_mismatch', 'current Git branch no longer matches the PR head ref');
  return refreshAndCompare(context);
}

export async function assertRepairWorkspace(result, verifiedApproval) {
  const context = getResultContext(result);
  await assertCurrentPrTuple(result);
  const localHead = await readGitHeadRevision(context.repoRoot).catch((error) => {
    fail('git_inspection_failed', 'could not verify local HEAD before consuming repair approval', error);
  });
  if (localHead !== context.snapshot.headSha) fail('stale_local_head', 'local HEAD changed before repair approval consumption');
  const fingerprint = await readGitWorkspaceFingerprint(context.repoRoot).catch((error) => {
    fail('workspace_fingerprint_failed', 'could not verify the pre-repair workspace fingerprint', error);
  });
  if (fingerprint !== context.workspaceFingerprint) {
    fail('workspace_changed_before_repair', 'workspace changed after inspection and before repair approval consumption');
  }
  await refreshAndCompare(context);
  try {
    context.approvalProvider.consumeApproval(verifiedApproval, {
      repositoryId: context.snapshot.repositoryId,
      prNumber: context.snapshot.number,
      baseSha: context.snapshot.baseSha,
      headSha: context.snapshot.headSha,
      mergeSha: context.snapshot.mergeSha,
      capability: 'repair:workspace',
      paths: [...context.allowedPaths],
    });
  } catch (error) {
    fail('approval_rejected', 'GitHub approval is invalid, expired, replayed, or outside the exact repair scope', error);
  }
}
