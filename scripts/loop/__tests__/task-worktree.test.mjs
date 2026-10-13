import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, it } from 'node:test';

import { createTaskWorktree, TaskWorktreeError } from '../runner/worktree.mjs';

const execFileAsync = promisify(execFile);
const temporaryRoots = new Set();

async function git(root, args) {
  return (await execFileAsync('git', ['-C', root, ...args], { encoding: 'utf8', windowsHide: true })).stdout.trim();
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'loop-task-runner-'));
  temporaryRoots.add(root);
  const repositoryRoot = path.join(root, 'repository');
  await mkdir(repositoryRoot);
  await git(repositoryRoot, ['init']);
  await git(repositoryRoot, ['config', 'user.name', 'Loop Test']);
  await git(repositoryRoot, ['config', 'user.email', 'loop-test@example.invalid']);
  await writeFile(path.join(repositoryRoot, 'README.md'), 'task runner fixture\n');
  await git(repositoryRoot, ['add', 'README.md']);
  await git(repositoryRoot, ['commit', '-m', 'test: initialize task runner fixture']);
  const sourceRevision = await git(repositoryRoot, ['rev-parse', 'HEAD']);
  return { root, repositoryRoot, runnerRoot: path.join(root, 'runner-worktrees'), sourceRevision };
}

function worktreeInput(input, taskId, overrides = {}) {
  return {
    repositoryRoot: input.repositoryRoot,
    runnerRoot: input.runnerRoot,
    sourceRevision: input.sourceRevision,
    taskId,
    ...overrides,
  };
}

afterEach(async () => {
  for (const root of temporaryRoots) await rm(root, { recursive: true, force: true });
  temporaryRoots.clear();
});

describe('isolated task worktrees', () => {
  it('checks out only the requested immutable revision into a clean sibling worktree', async () => {
    const input = await fixture();
    const worktree = await createTaskWorktree(worktreeInput(input, 'repo-1234-issue-42-g1'));
    assert.equal(worktree.taskId, 'repo-1234-issue-42-g1');
    assert.equal(worktree.baseRevision, input.sourceRevision);
    assert.equal(await git(worktree.path, ['rev-parse', 'HEAD']), input.sourceRevision);
    assert.equal(await git(worktree.path, ['rev-parse', '--abbrev-ref', 'HEAD']), 'HEAD');
    assert.equal(await git(worktree.path, ['status', '--porcelain=v1', '--untracked-files=all']), '');
    assert.equal(await readFile(path.join(worktree.path, 'README.md'), 'utf8'), 'task runner fixture\n');
    assert.notEqual(worktree.path.toLowerCase(), input.repositoryRoot.toLowerCase());
  });

  it('rejects reused task paths, a runner root inside the checkout, and revision drift', async () => {
    const input = await fixture();
    const first = await createTaskWorktree(worktreeInput(input, 'repo-1234-issue-42-g1'));
    await assert.rejects(createTaskWorktree(worktreeInput(input, 'repo-1234-issue-42-g1')), { code: 'worktree_already_exists' });
    await assert.rejects(createTaskWorktree(worktreeInput(input, 'repo-1234-issue-43-g1', { runnerRoot: path.join(input.repositoryRoot, '.loop-task-root') })), { code: 'runner_root_invalid' });
    await assert.rejects(createTaskWorktree(worktreeInput(input, 'repo-1234-issue-44-g1', { sourceRevision: 'f'.repeat(40) })), { code: 'git_operation_failed' });
    assert.equal(await git(first.path, ['rev-parse', 'HEAD']), input.sourceRevision);
  });

  it('rejects malformed task IDs and parent traversal before creating a worktree', async () => {
    const input = await fixture();
    await assert.rejects(createTaskWorktree(worktreeInput(input, '../outside')), { code: 'worktree_input_invalid' });
  });
});
