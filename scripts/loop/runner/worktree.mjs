import { execFile } from 'node:child_process';
import { lstat, mkdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const SHA_PATTERN = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i;
const TASK_ID_PATTERN = /^repo-[1-9][0-9]*-issue-[1-9][0-9]*-g[1-9][0-9]*$/;

export class TaskWorktreeError extends Error {
  constructor(code, options = {}) {
    super(code, options);
    this.name = new.target.name;
    this.code = code;
  }
}

function fail(code, cause) {
  throw new TaskWorktreeError(code, cause ? { cause } : undefined);
}

function runnerGitEnvironment() {
  const env = {
    PATH: process.env.PATH ?? '',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_TERMINAL_PROMPT: '0',
    GCM_INTERACTIVE: 'Never',
  };
  for (const key of ['SystemRoot', 'WINDIR']) if (process.env[key]) env[key] = process.env[key];
  return env;
}

async function git(repositoryRoot, args) {
  try {
    const result = await execFileAsync('git', ['-C', repositoryRoot, ...args], {
      encoding: 'utf8', env: runnerGitEnvironment(), windowsHide: true, timeout: 10_000, maxBuffer: 64 * 1024,
    });
    return result.stdout.trim();
  } catch (error) {
    throw new TaskWorktreeError('git_operation_failed', { cause: error });
  }
}

function inside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/** Create a fresh detached worktree below an operator-owned runner root, never inside the source checkout. */
export async function createTaskWorktree(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
      || Object.keys(input).sort().join('|') !== ['repositoryRoot', 'runnerRoot', 'sourceRevision', 'taskId'].sort().join('|')
      || typeof input.repositoryRoot !== 'string' || typeof input.runnerRoot !== 'string'
      || typeof input.taskId !== 'string' || !TASK_ID_PATTERN.test(input.taskId)
      || typeof input.sourceRevision !== 'string' || !SHA_PATTERN.test(input.sourceRevision)) {
    fail('worktree_input_invalid');
  }
  let repositoryRoot;
  try { repositoryRoot = await realpath(input.repositoryRoot); }
  catch (error) { throw new TaskWorktreeError('repository_unavailable', { cause: error }); }
  const repositoryTop = await git(repositoryRoot, ['rev-parse', '--show-toplevel']);
  if (path.resolve(repositoryTop).toLowerCase() !== repositoryRoot.toLowerCase()) fail('repository_root_mismatch');

  const requestedRunnerRoot = path.resolve(input.runnerRoot);
  if (!inside(path.dirname(repositoryRoot), requestedRunnerRoot) || inside(repositoryRoot, requestedRunnerRoot)) {
    fail('runner_root_invalid');
  }
  await mkdir(requestedRunnerRoot, { recursive: true });
  const runnerRoot = await realpath(requestedRunnerRoot);
  if (!inside(path.dirname(repositoryRoot), runnerRoot) || inside(repositoryRoot, runnerRoot)) {
    fail('runner_root_invalid');
  }
  const targetPath = path.join(runnerRoot, input.taskId);
  if (!inside(runnerRoot, targetPath)) fail('worktree_path_invalid');
  try {
    await lstat(targetPath);
    fail('worktree_already_exists');
  } catch (error) {
    if (error instanceof TaskWorktreeError) throw error;
    if (error?.code !== 'ENOENT') throw new TaskWorktreeError('worktree_path_unavailable', { cause: error });
  }

  const actualRevision = await git(repositoryRoot, ['rev-parse', '--verify', `${input.sourceRevision}^{commit}`]);
  if (actualRevision.toLowerCase() !== input.sourceRevision.toLowerCase()) fail('source_revision_mismatch');
  await git(repositoryRoot, ['worktree', 'add', '--detach', targetPath, actualRevision]);
  let resolvedTarget;
  try { resolvedTarget = await realpath(targetPath); }
  catch (error) { throw new TaskWorktreeError('worktree_verification_failed', { cause: error }); }
  if (!inside(runnerRoot, resolvedTarget) || path.resolve(resolvedTarget).toLowerCase() !== targetPath.toLowerCase()) {
    fail('worktree_path_escape');
  }
  const checkedOutRevision = await git(resolvedTarget, ['rev-parse', '--verify', 'HEAD']);
  if (checkedOutRevision.toLowerCase() !== actualRevision.toLowerCase()) fail('worktree_revision_mismatch');
  const status = await git(resolvedTarget, ['status', '--porcelain=v1', '--untracked-files=all']);
  if (status.length > 0) fail('worktree_not_clean');
  return Object.freeze({ taskId: input.taskId, path: resolvedTarget, baseRevision: actualRevision.toLowerCase() });
}
