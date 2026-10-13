import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { loadLoopPolicy } from '../policy.mjs';
import { createLoopState } from '../state.mjs';
import { readGitHeadRevision, readGitWorkspaceFingerprint } from '../verify.mjs';
import { createIssueTaskRuntimeForTests } from '../tasks/runtime.mjs';

const repositoryId = 4321;
const issueNumber = 67;
const taskId = `repo-${repositoryId}-issue-${issueNumber}-g1`;
const leaseOwner = 'fixture-owner';
const now = Date.parse('2026-10-13T12:00:00.000Z');
const issueBody = 'Please update a small docs page.';
const requestDigest = createHash('sha256').update(issueBody).digest('hex');

function git(root, ...args) { return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', windowsHide: true }).trim(); }

function autonomyPolicy(revision, enabled = true) {
  return Object.freeze({ schemaVersion: 1, enabled, autoMergeEnabled: false,
    ownerActorIds: Object.freeze([17]), eligibleActors: Object.freeze([17]), optInLabel: 'autonomous:run',
    eligibleCategories: Object.freeze(['documentation']), eligiblePaths: Object.freeze(['docs/**']),
    eligibleRisks: Object.freeze(['low']), capabilities: Object.freeze(['observe', 'open_draft_pr']),
    runner: Object.freeze({ provider: 'openai', model: 'GPT-6-Luna' }),
    budgets: Object.freeze({ maxModelCalls: 8, maxDeliveryGenerations: 2, taskConcurrency: 1, maxHostedWorkflowRuns: 3 }),
    trustedRevision: revision });
}

function taskRecord(revision, state = 'delivering', overrides = {}) {
  return { schemaVersion: 2, key: { repositoryId, issueNumber, generation: 1 }, taskId,
    requestDigest, acceptanceIds: [], sourceRevision: revision, policyRevision: revision, state, version: 1,
    attempt: 0, epoch: 0, deadline: '2026-10-14T12:00:00.000Z',
    budgets: { modelCalls: 0, repairs: 0, deliveries: 0, lastModelTokenUsed: null },
    links: { loopStateTaskId: taskId, pr: null }, outcomeReason: null, confirmedMergeSha: null, ...overrides };
}

async function fixture(t, { state = 'delivering', enabled = true, issue: issueNo = issueNumber, delivery: deliverImpl, observeRunner } = {}) {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'digital-e-task-runtime-'));
  const root = path.join(temp, 'repo');
  await mkdir(root, { recursive: true });
  await mkdir(path.join(root, 'docs'), { recursive: true });
  await writeFile(path.join(root, 'docs', 'guide.md'), '# Fixture\n', 'utf8');
  git(root, 'init'); git(root, 'config', 'user.name', 'Fixture'); git(root, 'config', 'user.email', 'fixture@example.invalid');
  git(root, 'add', '--', '.'); git(root, 'commit', '--no-gpg-sign', '-m', 'fixture'); git(root, 'branch', '-M', 'main');
  const revision = await readGitHeadRevision(root);
  const localTaskId = `repo-${repositoryId}-issue-${issueNo}-g1`;
  const loopPolicy = await loadLoopPolicy(path.resolve('.'));
  const initialLoopState = createLoopState({ taskId: localTaskId, branch: `codex/issue-${issueNo}-g1`, baseSha: revision, headSha: revision,
    risk: 'low', acceptanceCriteria: [], policy: loopPolicy, now: '2026-10-13T12:00:00.000Z' });
  let record = taskRecord(revision, state, { taskId: localTaskId,
    key: { repositoryId, issueNumber: issueNo, generation: 1 }, links: { loopStateTaskId: localTaskId, pr: null } });
  let lease = { owner: leaseOwner, taskVersion: record.version, leaseUntil: now + 10 * 60_000 };
  const counters = { pipeline: 0, delivery: 0, issue: 0, overlap: 0, active: 0 };
  const taskStore = {
    async loadTaskRecord(id) { assert.equal(id, localTaskId); return structuredClone(record); },
    async loadTaskLease(id) { assert.equal(id, localTaskId); return lease && { ...lease }; },
    async assertTaskLease(id, owner, timestamp, version) {
      return id === localTaskId && lease?.owner === owner && lease.taskVersion === version && lease.leaseUntil > timestamp;
    },
    async compareAndSaveTaskRecordUnderLease(next, expectedVersion, owner) {
      if (!lease || lease.owner !== owner || record.version !== expectedVersion) return 'stale';
      record = structuredClone(next); lease.taskVersion = next.version; return 'saved';
    },
    async releaseTaskLease(id, owner) {
      if (id !== localTaskId || lease?.owner !== owner) return false;
      lease = null; return true;
    },
  };
  const policy = autonomyPolicy(revision, enabled);
  const workspaceFingerprint = await readGitWorkspaceFingerprint(root);
  const baseVerification = verification(revision, workspaceFingerprint);
  const options = {
    repositoryId, repoRoot: root, runnerRoot: path.join(temp, 'worktrees'), trustedPolicyRoot: root,
    repository: { id: repositoryId, owner: 'fixture-owner', name: 'fixture-repo' }, taskStore,
    authProvider: {}, now: () => now, invokeModelCall: async () => { throw new Error('test broker must not run'); },
    authenticate: async () => ({ authenticated: true, subject: 'fixture-gateway' }),
    loadCanonicalContext: async (fresh) => ({ policy, loopPolicy: Object.freeze({ schemaVersion: 1, stopConditions: loopPolicy.stopConditions }), loopState: initialLoopState,
      ...(fresh.state === 'monitoring' ? { prSnapshot: { repositoryId, number: 88, baseSha: revision, headSha: revision, mergeSha: null } } : {}) }),
    observeIssue: async () => { counters.issue += 1; return { action: 'opened', actorId: 17, body: issueBody, issueNumber: issueNo, isPullRequest: false,
      labels: ['autonomous:run'], title: 'Fixture issue' }; },
    observePullRequest: async () => ({ repositoryId, number: 88, state: 'open', baseSha: revision, headSha: revision, mergeSha: null }),
    observeCi: async () => null,
    inspectRunner: observeRunner ?? (async ({ taskId: id, leaseOwner: owner, expectedVersion }) => ({ status: 'stopped', taskId: id, leaseOwner: owner, expectedVersion })),
  };
  const adapters = {
    pipeline: async ({ session, assertIssueCurrent }) => {
      counters.pipeline += 1;
      counters.active += 1;
      if (counters.active > 1) counters.overlap += 1;
      await assertIssueCurrent?.();
      for (const event of ['start', 'execute', 'verify', 'deliver']) await session.advance(event);
      counters.active -= 1;
      return { status: 'ready_for_delivery', taskId: localTaskId, durableYield: true };
    },
    delivery: async ({ issue, assertIssueCurrent }) => {
      counters.delivery += 1;
      if (issue) assert.equal(issue.body, issueBody);
      await assertIssueCurrent?.();
      const custom = deliverImpl ?? (async () => ({ status: 'delivered', taskId: localTaskId,
        headSha: revision,
        workspaceFingerprint, pullRequest: { number: 88, baseSha: revision, headSha: revision },
        verification: { postCommit: verification(revision) } }));
      return { ...await custom(), taskId: localTaskId };
    },
    verifyDelivery: async () => baseVerification,
    verifyMonitoring: async () => baseVerification,
  };
  t.after(() => rm(temp, { recursive: true, force: true }));
  return { root, revision, issueNumber: issueNo, taskId: localTaskId, options, adapters, taskStore, counters,
    get record() { return record; }, get lease() { return lease; } };
}

function verification(revision, fingerprint = 'b'.repeat(64)) {
  return { mode: 'full', passed: true, complete: false, revisionStable: true, workspaceStable: true,
    verifiedRevision: revision, currentRevision: revision, verifiedWorkspaceFingerprint: fingerprint,
    currentWorkspaceFingerprint: fingerprint, requiredExternalChecks: ['github-ci'],
    commands: [{ id: 'lint', exitCode: 0, signal: null, spawnErrorCode: null }] };
}

function packet(data, overrides = {}) {
  return { kind: 'issue_task', deliveryId: 'fixture-delivery-1', repositoryId, issueNumber: data.issueNumber, generation: 1,
    taskId: data.taskId, sourceRevision: data.revision, policyRevision: data.revision, expectedVersion: data.record.version,
    leaseOwner, leaseUntil: data.lease.leaseUntil, ...overrides };
}

function post(runtime, data, body = packet(data)) {
  return runtime.fetch(new Request('http://runner.internal/v1/tasks', { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
}

test('queued work uses the Issue digest transiently, transitions once, and yields a released lease', async (t) => {
  const data = await fixture(t, { state: 'queued' });
  const runtime = createIssueTaskRuntimeForTests(data.options, data.adapters);
  const accepted = await post(runtime, data);
  assert.equal(accepted.status, 202);
  await runtime.waitForIdle(data.taskId);
  assert.equal(data.record.state, 'monitoring');
  assert.equal(data.counters.pipeline, 1);
  assert.equal(data.counters.delivery, 1);
  assert.equal(data.counters.overlap, 0);
  assert.equal(data.lease, null);
  const persisted = JSON.stringify(data.record);
  assert.equal(persisted.includes(issueBody), false);
});

test('duplicate packet during execution is accepted idempotently and does not start a second executor', async (t) => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const data = await fixture(t, { state: 'queued' });
  let signalStarted;
  const started = new Promise((resolve) => { signalStarted = resolve; });
  const adapters = { ...data.adapters, pipeline: async ({ session }) => {
    data.counters.pipeline += 1;
    await session.advance('start');
    signalStarted();
    await gate;
    for (const event of ['execute', 'verify', 'deliver']) await session.advance(event);
    return { status: 'ready_for_delivery', taskId: data.taskId, durableYield: true };
  } };
  const runtime = createIssueTaskRuntimeForTests(data.options, adapters);
  const originalPacket = packet(data);
  const first = await post(runtime, data, originalPacket);
  await started;
  const duplicate = await post(runtime, data, originalPacket);
  assert.equal(first.status, 202); assert.equal(duplicate.status, 202);
  assert.equal(data.counters.pipeline, 1);
  release(); await runtime.waitForIdle(data.taskId);
  assert.equal(data.record.state, 'monitoring');
});

test('disabled policy refuses dispatch before Issue observation or pipeline execution', async (t) => {
  const data = await fixture(t, { state: 'queued', enabled: false });
  const runtime = createIssueTaskRuntimeForTests(data.options, data.adapters);
  const result = await post(runtime, data);
  assert.equal(result.status, 403);
  assert.equal(data.counters.issue, 0); assert.equal(data.counters.pipeline, 0);
  assert.equal(data.record.state, 'queued');
});

test('approval loss preserves delivering state and releases only after the worker has stopped', async (t) => {
  const data = await fixture(t, { state: 'delivering', delivery: async () => { throw Object.assign(new Error('approval'), { code: 'approval_required' }); } });
  const runtime = createIssueTaskRuntimeForTests(data.options, data.adapters);
  assert.equal((await post(runtime, data)).status, 202);
  await runtime.waitForIdle(data.taskId);
  assert.equal(data.record.state, 'delivering');
  assert.equal(data.lease, null);
  assert.equal(data.counters.pipeline, 0);
});

test('GET reports stopped only after the trusted supervisor confirms exact owner and version', async (t) => {
  let observations = 0;
  const data = await fixture(t, { state: 'delivering', observeRunner: async ({ taskId: id, leaseOwner: owner, expectedVersion }) => ({
    status: 'stopped', taskId: id, leaseOwner: owner, expectedVersion,
  }) });
  data.options.inspectRunner = async ({ taskId: id, leaseOwner: owner, expectedVersion }) => {
    observations += 1; return { status: 'stopped', taskId: id, leaseOwner: owner, expectedVersion };
  };
  const runtime = createIssueTaskRuntimeForTests(data.options, data.adapters);
  const result = await runtime.fetch(new Request(`http://runner.internal/v1/tasks/${data.taskId}`));
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { status: 'stopped', taskId: data.taskId, leaseOwner, expectedVersion: 1 });
  data.options.inspectRunner = async () => ({ status: 'stopped', taskId: data.taskId, leaseOwner: 'wrong-owner', expectedVersion: 1 });
  const unknown = await runtime.fetch(new Request(`http://runner.internal/v1/tasks/${data.taskId}`));
  assert.equal(unknown.status, 503);
  await data.taskStore.releaseTaskLease(data.taskId, leaseOwner);
  const noOwner = await runtime.fetch(new Request(`http://runner.internal/v1/tasks/${data.taskId}`));
  assert.equal(noOwner.status, 503);
  assert.equal(observations, 1);
});

test('confirmed durable yield releases the one-task slot before another task may run', async (t) => {
  const data = await fixture(t, { state: 'queued' });
  const runtime = createIssueTaskRuntimeForTests(data.options, data.adapters);
  const packet1 = packet(data);
  assert.equal((await post(runtime, data, packet1)).status, 202);
  await runtime.waitForIdle(data.taskId);
  assert.equal(data.lease, null);
  assert.equal(runtime.inspectLocal(data.taskId).status, 'stopped');
  assert.equal(data.counters.active, 0);
  assert.equal(data.counters.overlap, 0);
  const next = await fixture(t, { state: 'queued', issue: 68 });
  const nextRuntime = createIssueTaskRuntimeForTests(next.options, next.adapters);
  assert.equal((await post(nextRuntime, next)).status, 202);
  await nextRuntime.waitForIdle(next.taskId);
  assert.equal(next.record.state, 'monitoring');
  assert.equal(next.lease, null);
});
