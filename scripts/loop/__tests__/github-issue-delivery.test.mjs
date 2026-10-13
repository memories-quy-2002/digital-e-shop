import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile, cp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { loadLoopPolicy } from '../policy.mjs';
import { readGitHeadRevision, readGitWorkspaceFingerprint } from '../verify.mjs';
import { createLoopState, saveLoopState } from '../state.mjs';
import { createIssueDeliveryHost, IssueDeliveryError } from '../tasks/github-issue-delivery.mjs';

const repositoryId = 1234;
const repository = { id: repositoryId, owner: 'memories-quy-2002', name: 'digital-e-shop' };
const issueNumber = 42;
const taskId = `repo-${repositoryId}-issue-${issueNumber}-g1`;
const now = '2026-10-13T00:00:00.000Z';

function git(root, ...args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', windowsHide: true }).trim();
}

function autonomyPolicy(revision) {
  return Object.freeze({
    schemaVersion: 1,
    enabled: true,
    autoMergeEnabled: false,
    ownerActorIds: Object.freeze([1]),
    eligibleActors: Object.freeze([1]),
    optInLabel: 'autonomous:run',
    eligibleCategories: Object.freeze(['documentation', 'frontend']),
    eligiblePaths: Object.freeze(['docs/**', 'client/src/**']),
    eligibleRisks: Object.freeze(['low', 'medium']),
    runner: Object.freeze({ provider: 'openai', model: 'GPT-6-Luna' }),
    capabilities: Object.freeze(['observe', 'propose_patch', 'run_fixed_verifier', 'open_draft_pr']),
    budgets: Object.freeze({ maxModelCalls: 8, maxDeliveryGenerations: 2, taskConcurrency: 1, maxHostedWorkflowRuns: 3 }),
    trustedRevision: revision,
  });
}

function taskRecord(revision, overrides = {}) {
  return {
    schemaVersion: 2,
    key: { repositoryId, issueNumber, generation: 1 },
    taskId,
    requestDigest: 'a'.repeat(64),
    acceptanceIds: [],
    sourceRevision: revision,
    policyRevision: revision,
    state: 'delivering',
    version: 1,
    attempt: 0,
    epoch: 0,
    deadline: '2026-10-14T00:00:00.000Z',
    budgets: { modelCalls: 0, repairs: 0, deliveries: 0, lastModelTokenUsed: null },
    links: { loopStateTaskId: taskId, pr: null },
    outcomeReason: null,
    confirmedMergeSha: null,
    ...overrides,
  };
}

async function fixture(t, {
  loseCreateResponse = false,
  staleBranch = false,
  staleBase = false,
  changedPath = 'docs/API.md',
  verificationMutator = (result) => result,
  leaseLossAt = null,
} = {}) {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'digital-e-issue-delivery-'));
  const root = path.join(parent, 'repo');
  const remote = path.join(parent, 'remote.git');
  await mkdir(root, { recursive: true });
  await mkdir(path.join(root, '.agent'), { recursive: true });
  await cp(path.resolve('.agent/policy'), path.join(root, '.agent/policy'), { recursive: true });
  await writeFile(path.join(root, '.gitignore'), '.loop/state/\n', 'utf8');
  await mkdir(path.dirname(path.join(root, changedPath)), { recursive: true });
  await writeFile(path.join(root, changedPath), '# Fixture\n', 'utf8');
  git(root, 'init');
  git(root, 'config', 'user.name', 'Fixture');
  git(root, 'config', 'user.email', 'fixture@example.invalid');
  git(root, 'add', '--', '.');
  git(root, 'commit', '--no-gpg-sign', '-m', 'fixture: source');
  git(root, 'branch', '-M', 'main');
  const baseSha = await readGitHeadRevision(root);
  git(parent, 'init', '--bare', remote);
  git(root, 'remote', 'add', 'origin', remote);
  git(root, 'push', 'origin', 'main');
  const trustedPolicyRoot = path.join(parent, 'policy-source');
  git(root, 'worktree', 'add', '--detach', trustedPolicyRoot, baseSha);
  await writeFile(path.join(root, changedPath), '# Fixture\n\nVerified update.\n', 'utf8');

  const loopPolicy = await loadLoopPolicy(root);
  const loopState = createLoopState({
    taskId,
    branch: `codex/issue-${issueNumber}-g1`,
    baseSha,
    headSha: baseSha,
    risk: changedPath.startsWith('client/') ? 'medium' : 'low',
    acceptanceCriteria: [],
    policy: loopPolicy,
    now,
  });
  await saveLoopState(root, loopState);

  let branchSha = staleBranch ? 'b'.repeat(40) : null;
  let mainSha = staleBase ? 'c'.repeat(40) : baseSha;
  let pulls = [];
  let postCount = 0;
  let createBehavior = loseCreateResponse ? 'lose-response' : 'normal';
  let pullTitle = `Automated work for issue #${issueNumber}`;
  let pullBody = `Closes #${issueNumber}\n\nTask: ${taskId}\nBase revision: ${baseSha}`;
  let approvals = 0;
  let leaseActive = true;
  let verifierRuns = 0;
  let task = taskRecord(baseSha);
  const taskStore = {
    async loadTaskRecord(id) { assert.equal(id, taskId); return structuredClone(task); },
    async assertTaskLease(id, owner, _timestamp, expectedVersion) {
      assert.equal(id, taskId);
      assert.equal(owner, 'fixture-lease-owner');
      return leaseActive && task.version === expectedVersion;
    },
    async compareAndSaveTaskRecordUnderLease(next, expectedVersion, owner) {
      assert.equal(owner, 'fixture-lease-owner');
      if (!leaseActive || task.version !== expectedVersion) return 'stale';
      task = structuredClone(next);
      return 'saved';
    },
  };
  const gitAdapter = {
    async changedPaths(worktree) {
      return (await import('../tasks/github-issue-delivery.mjs')).createGitAdapter().changedPaths(worktree);
    },
    committedPaths(worktree, sha) { return (async () => (await import('../tasks/github-issue-delivery.mjs')).createGitAdapter().committedPaths(worktree, sha))(); },
    commitCount(worktree, sha) { return (async () => (await import('../tasks/github-issue-delivery.mjs')).createGitAdapter().commitCount(worktree, sha))(); },
    currentBranch(worktree) { return (async () => (await import('../tasks/github-issue-delivery.mjs')).createGitAdapter().currentBranch(worktree))(); },
    remoteUrl() { return 'https://github.com/memories-quy-2002/digital-e-shop.git'; },
    createBranch(worktree, branch) { return (async () => (await import('../tasks/github-issue-delivery.mjs')).createGitAdapter().createBranch(worktree, branch))(); },
    commit(worktree, paths, message, maxChangedLines) { return (async () => (await import('../tasks/github-issue-delivery.mjs')).createGitAdapter().commit(worktree, paths, message, maxChangedLines))(); },
    push(worktree, targetRepository, branch, token) {
      assert.equal(targetRepository.id, repository.id);
      assert.equal(targetRepository.owner, repository.owner);
      assert.equal(targetRepository.name, repository.name);
      assert.equal(token, 'fixture-token');
      try {
        git(worktree, 'push', '--porcelain', 'origin', `HEAD:refs/heads/${branch}`);
        branchSha = git(worktree, 'rev-parse', 'HEAD');
        return { accepted: true };
      } catch {
        return { accepted: false, uncertain: true, errorCode: 'fixture_push_failed' };
      }
    },
  };
  function ref(branch, sha) { return { ref: `refs/heads/${branch}`, object: { sha } }; }
  function pr() {
    const headSha = branchSha;
    return {
      number: 51,
      state: 'open',
      html_url: `https://github.com/${repository.owner}/${repository.name}/pull/51`,
      base: { ref: 'main', sha: mainSha },
      head: { ref: `codex/issue-${issueNumber}-g1`, sha: headSha },
      title: pullTitle,
      body: pullBody,
      draft: true,
    };
  }
  const githubApi = {
    async request({ method, path: route, body }) {
      if (route.endsWith('/git/ref/heads/main')) return ref('main', mainSha);
      if (route.endsWith(`/git/ref/heads/codex/issue-${issueNumber}-g1`)) {
        if (!branchSha) throw new IssueDeliveryError('github_request_failed', { status: 404 });
        return ref(`codex/issue-${issueNumber}-g1`, branchSha);
      }
      if (route.includes('/pulls?')) {
        if (leaseLossAt === 'before-pr-create' && branchSha) leaseActive = false;
        return structuredClone(pulls);
      }
      if (method === 'POST' && route.endsWith('/pulls')) {
        postCount += 1;
        branchSha ??= git(root, 'rev-parse', 'HEAD');
        pullTitle = body.title;
        pullBody = body.body;
        if (createBehavior !== 'fail-without-pr') pulls = [pr()];
        if (createBehavior === 'lose-response' || createBehavior === 'fail-without-pr') {
          createBehavior = 'normal';
          throw new IssueDeliveryError('github_response_uncertain');
        }
        return pr();
      }
      if (method === 'PATCH' && route.endsWith('/pulls/51')) { pullTitle = body.title; pullBody = body.body; pulls = [pr()]; return pr(); }
      throw new Error(`Unexpected fixture request: ${method} ${route}`);
    },
  };
  const authProvider = {
    async getInstallationToken(capability) { assert.ok(['observe', 'issue:delivery'].includes(capability)); return 'fixture-token'; },
    async requestApproval(scope) {
      approvals += 1;
      assert.equal(scope.capability, 'issue:delivery');
      if (leaseLossAt === 'approval') leaseActive = false;
      return Object.freeze({});
    },
    consumeApproval(approval, scope) { assert.ok(approval); assert.equal(scope.taskId, taskId); },
  };
  const makeHost = ({ canonical = false, disabled = false } = {}) => createIssueDeliveryHost({
    repoRoot: root,
    trustedPolicyRoot,
    repository,
    taskRecord: task,
    taskStore,
    leaseOwner: 'fixture-lease-owner',
    authProvider,
    gitAdapter,
    githubApi,
    ...(canonical ? {} : { loadPolicy: async (_root, revision) => Object.freeze({ ...autonomyPolicy(revision), ...(disabled ? { enabled: false } : {}) }), loadLoopPolicy: async () => loopPolicy }),
    runVerifier: async (plan, { repoRoot }) => {
      verifierRuns += 1;
      const head = await readGitHeadRevision(repoRoot);
      const fingerprint = await readGitWorkspaceFingerprint(repoRoot);
      const result = {
        mode: 'full', passed: true, complete: plan.complete, revisionStable: true, workspaceStable: true,
        verifiedRevision: head, currentRevision: head,
        verifiedWorkspaceFingerprint: fingerprint, currentWorkspaceFingerprint: fingerprint,
        commands: plan.commands.map(({ id }) => ({ id, exitCode: 0, signal: null, spawnErrorCode: null })),
        requiredExternalChecks: [...plan.requiredExternalChecks],
      };
      const mutated = verificationMutator(result, plan);
      if (leaseLossAt === 'before-push' && verifierRuns === 2) leaseActive = false;
      return mutated;
    },
  });
  t.after(() => rm(parent, { recursive: true, force: true }));
  return { root, baseSha, makeHost, dirtyTrustedPolicy: async () => writeFile(path.join(trustedPolicyRoot, '.agent/policy/stop-conditions.yml'), 'schemaVersion: 1\n', 'utf8'),
    get task() { return task; }, get pulls() { return pulls; }, get branchSha() { return branchSha; }, get postCount() { return postCount; }, get approvals() { return approvals; }, set mainSha(value) { mainSha = value; }, set createBehavior(value) { createBehavior = value; } };
}

test('delivery commits approved paths, pushes a deterministic branch and opens an Issue-linked draft PR', async (t) => {
  const data = await fixture(t);
  const result = await data.makeHost().deliver();
  assert.equal(result.status, 'delivered');
  assert.deepEqual(result.externalChecksPending, ['github-ci', 'dependency-review', 'codeql']);
  assert.equal(result.branch, 'codex/issue-42-g1');
  assert.equal(result.pullRequest.number, 51);
  assert.match(data.pulls[0].body, /Closes #42/);
  assert.match(data.pulls[0].body, /Required hosted checks pending:[\s\S]*github-ci/);
  assert.equal(result.verification.postCommit.complete, false);
  assert.equal(result.verification.postCommit.mode, 'full');
  assert.equal(result.verification.postCommit.currentRevision, result.headSha);
  assert.equal(result.verification.postCommit.currentWorkspaceFingerprint, result.workspaceFingerprint);
  assert.equal(Object.hasOwn(result.pullRequest, 'body'), false);
  assert.equal(result.pullRequest.baseSha, data.baseSha);
  assert.equal(data.branchSha, result.headSha);
  assert.equal(data.task.budgets.deliveries, 1);
  assert.equal(data.approvals, 1);
});

test('a lost create response is reconciled from the exact remote branch and PR tuple', async (t) => {
  const data = await fixture(t, { loseCreateResponse: true });
  const result = await data.makeHost().deliver();
  assert.equal(result.status, 'delivered');
  assert.equal(result.pullRequest.number, 51);
  assert.equal(data.postCount, 1);
});

test('a duplicate delivery returns the existing PR without another approval or reservation', async (t) => {
  const data = await fixture(t);
  const first = await data.makeHost().deliver();
  const version = data.task.version;
  const count = data.task.budgets.deliveries;
  const duplicate = await data.makeHost().deliver();
  assert.equal(first.pullRequest.number, duplicate.pullRequest.number);
  assert.equal(duplicate.status, 'already-delivered');
  assert.equal(data.task.version, version);
  assert.equal(data.task.budgets.deliveries, count);
  assert.equal(data.approvals, 1);
});

test('a partial push with no PR can resume on the exact committed branch after fresh approval', async (t) => {
  const data = await fixture(t);
  data.createBehavior = 'fail-without-pr';
  await assert.rejects(data.makeHost().deliver(), (error) => error.code === 'pull_request_outcome_uncertain');
  assert.ok(data.branchSha);
  assert.equal(data.pulls.length, 0);
  const second = await data.makeHost().deliver();
  assert.equal(second.status, 'delivered');
  assert.equal(second.headSha, data.branchSha);
  assert.equal(data.approvals, 2);
  assert.equal(data.postCount, 2);
});

test('delivery refuses stale remote base or a pre-existing branch with a different head', async (t) => {
  const staleBase = await fixture(t, { staleBase: true });
  await assert.rejects(staleBase.makeHost().deliver(), (error) => error.code === 'stale_remote_base');
  assert.equal(staleBase.approvals, 0);

  const staleBranch = await fixture(t, { staleBranch: true });
  await assert.rejects(staleBranch.makeHost().deliver(), (error) => error.code === 'stale_remote_branch');
  assert.equal(staleBranch.approvals, 0);
});

test('a disabled autonomy policy blocks delivery before reservation or approval', async (t) => {
  const data = await fixture(t);
  await assert.rejects(data.makeHost({ disabled: true }).deliver(), (error) => error.code === 'policy_disabled');
  assert.equal(data.task.budgets.deliveries, 0);
  assert.equal(data.approvals, 0);
  assert.equal(data.postCount, 0);
});

test('full local verification failure refuses approval and remote delivery', async (t) => {
  const data = await fixture(t, {
    verificationMutator(result) {
      result.passed = false;
      result.commands[0].exitCode = 1;
      return result;
    },
  });
  await assert.rejects(data.makeHost().deliver(), (error) => error.code === 'fixed_verifier_evidence_invalid');
  assert.equal(data.approvals, 0);
  assert.equal(data.branchSha, null);
  assert.equal(data.postCount, 0);
});

test('full verifier rejects malformed hosted-check evidence for frontend delivery', async (t) => {
  const data = await fixture(t, {
    changedPath: 'client/src/features/products/pages/ProductPage.tsx',
    verificationMutator(result) {
      result.requiredExternalChecks = ['github-ci'];
      return result;
    },
  });
  await assert.rejects(data.makeHost().deliver(), (error) => error.code === 'fixed_verifier_evidence_invalid');
  assert.equal(data.approvals, 0);
  assert.equal(data.branchSha, null);
  assert.equal(data.postCount, 0);
});

test('lease loss during approval prevents all delivery writes', async (t) => {
  const data = await fixture(t, { leaseLossAt: 'approval' });
  await assert.rejects(data.makeHost().deliver(), (error) => error.code === 'task_lease_lost');
  assert.equal(data.approvals, 1);
  assert.equal(data.branchSha, null);
  assert.equal(data.postCount, 0);
});

test('lease loss after full local verification prevents the branch push', async (t) => {
  const data = await fixture(t, { leaseLossAt: 'before-push' });
  await assert.rejects(data.makeHost().deliver(), (error) => error.code === 'task_lease_lost');
  assert.equal(data.branchSha, null);
  assert.equal(data.postCount, 0);
});

test('lease loss after push reconciliation prevents draft PR creation', async (t) => {
  const data = await fixture(t, { leaseLossAt: 'before-pr-create' });
  await assert.rejects(data.makeHost().deliver(), (error) => error.code === 'task_lease_lost');
  assert.equal(data.branchSha !== null, true);
  assert.equal(data.postCount, 0);
  assert.equal(data.pulls.length, 0);
});

test('dirty canonical stop policy is refused even when trusted checkout HEAD is unchanged', async (t) => {
  const data = await fixture(t);
  await data.dirtyTrustedPolicy();
  await assert.rejects(data.makeHost({ canonical: true }).deliver(), (error) => error.code === 'canonical_policy_root_dirty');
  assert.equal(data.approvals, 0);
  assert.equal(data.postCount, 0);
});
