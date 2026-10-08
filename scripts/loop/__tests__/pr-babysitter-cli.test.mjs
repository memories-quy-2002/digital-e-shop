import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { exitCodeForAction, parsePrBabysitterArguments, runPrBabysitterCli } from '../pr-babysitter-cli.mjs';
import { createPrBabysitterState } from '../pr-state.mjs';
import { normalizeCheckObservation, normalizeRequiredCheckSnapshot } from '../pr-evidence.mjs';

const sha = 'a'.repeat(40);
const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const stage0Repository = 'memories-quy-2002/digital-e-shop';
const stage0RepositoryId = 743050379;
const policy = { schemaVersion: 1, protectedPaths: { high: [], critical: [] },
  riskRules: { low: [], medium: [], high: [], highRiskActions: ['stage1_required_check_recovery'], criticalActions: [
    'production_secret_access', 'production_db_mutation', 'branch_protection_bypass', 'direct_push_main',
    'disable_security_checks', 'production_deployment_promotion',
  ] },
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
      actions: { host: {}, getTarget: async () => null },
      budget: async () => ({ stop: false }), telemetry: noOp, ...overrides } };
}

async function createRerunHarness({ stopBudget = false } = {}) {
  const repository = 'owner/repo'; const repositoryId = 9; const prNumber = 2;
  const baseSha = 'b'.repeat(40); const headSha = 'a'.repeat(40); const mergeSha = 'c'.repeat(40);
  const workflowSha = 'd'.repeat(40); const workflowPath = '.github/workflows/ci.yml'; const workflowRef = 'refs/heads/main';
  const identity = { type: 'workflow', repositoryId, path: workflowPath, ref: workflowRef, sha: workflowSha };
  const workflowRule = { repositoryId, path: workflowPath, ref: workflowRef, sha: workflowSha };
  const snapshot = { repository, repositoryId, number: prNumber, state: 'open', draft: false, baseRef: 'main', baseSha,
    headRef: 'feature/test', headSha, mergeSha, headRepository: repository, updatedAt: '2026-09-29T00:00:00.000Z' };
  const events = [];
  let reserved = 0;
  const approval = Object.freeze({ approval: true });
  const requiredCheckSnapshot = normalizeRequiredCheckSnapshot({ baseRef: 'main', policyFingerprint: 'e'.repeat(64), requiredChecks: [],
    requiredWorkflows: [workflowRule], collectionStatus: 'complete' });
  const requiredWorkflowKey = requiredCheckSnapshot.requiredWorkflowKeys[0];
  const observation = normalizeCheckObservation({ checkId: 'ci-check', requiredCheckKey: null, requiredWorkflowKey,
    provider: 'github-actions', headSha, baseSha, mergeSha, testedSha: headSha, attemptKey: 'workflow-attempt-1',
    status: 'completed', conclusion: 'failure', runnerOutcome: 'check_failed', coversRelevantScope: true,
    protectedPathTouched: false, failureFingerprint: 'f'.repeat(64), previouslyPassedRevision: headSha });
  let prState = createPrBabysitterState({ repository, number: prNumber, state: 'open', draft: false, baseRef: 'main', baseSha,
    headRef: 'feature/test', headSha, mergeSha, headRepository: repository, updatedAt: snapshot.updatedAt });
  const cliApproval = async (scope) => {
    events.push('approve');
    assert.deepEqual(scope, { repositoryId, prNumber, baseSha, headSha, mergeSha, capability: 'actions:rerun',
      paths: [workflowPath], testedSha: headSha,
      actionTarget: { workflowId: 17, runId: 23, runAttempt: 1, failedJobIds: [31], requiredIdentity: identity } });
    return approval;
  };
  const trustedHost = { config: { repository, repositoryId, repoRoot: 'C:/repo', taskId: 'cli-rerun-task', policy },
    adapters: {
      pr: { async collect() { events.push('collect'); return { prSnapshot: { repository, number: prNumber, state: 'open', draft: false,
        baseRef: 'main', baseSha, headRef: 'feature/test', headSha, mergeSha, headRepository: repository, updatedAt: snapshot.updatedAt },
        requiredCheckSnapshot, checkObservations: [observation], checkCollectionComplete: true }; },
        async refresh() { events.push('refresh'); return snapshot; } },
      state: { async load() { events.push('state-load'); return prState; }, async save(_repository, _number, value) { prState = value; events.push('state-save'); } },
      auth: { async authenticateApprover() { events.push('authenticate'); }, requestApproval: cliApproval },
      actions: { host: Object.freeze({ trusted: true }), async getTarget() { events.push('target'); return { repositoryId, prNumber, baseSha, headSha, mergeSha,
        testedSha: headSha, requiredIdentity: identity, workflowId: 17, runId: 23, runAttempt: 1, failedJobIds: [31],
        failureAttemptKey: 'workflow-attempt-1' }; },
        async rerunFailedJobs(input) {
          events.push('writer');
          assert.equal(input.host, this.host);
          assert.equal(input.decision.action, 'retry-check');
          assert.equal(input.target.testedSha, headSha);
          assert.equal(input.target.requiredIdentity.path, workflowPath);
          assert.equal(input.approval, approval);
          reserved += 1;
          events.push('reserved');
          events.push('write');
          return { status: 'submitted', actionAttemptKey: 'attempt-key', token: 'ghs_secret-token-value' };
        } },
      repair: {}, writer: {}, budget: async () => { events.push('budget'); return { stop: stopBudget }; }, telemetry: async () => {},
    } };
  return { trustedHost, events, get prState() { return prState; }, get reserved() { return reserved; } };
}

function createRepairHarness({ missingFingerprint = false, tupleRace = false, stopWorkspaceBudget = false,
  stopContentsBudget = false, stopContentsBudgetCheck = null } = {}) {
  const repository = 'owner/repo'; const repositoryId = 9; const prNumber = 2;
  const baseSha = 'b'.repeat(40); const headSha = 'a'.repeat(40); const newHeadSha = 'f'.repeat(40); const mergeSha = 'c'.repeat(40);
  const workflowPath = '.github/workflows/ci.yml'; const workflowRef = 'refs/heads/main'; const workflowSha = 'd'.repeat(40);
  const rule = { repositoryId, path: workflowPath, ref: workflowRef, sha: workflowSha };
  const identity = { type: 'workflow', ...rule };
  const requiredCheckSnapshot = normalizeRequiredCheckSnapshot({ baseRef: 'main', policyFingerprint: 'e'.repeat(64), requiredChecks: [],
    requiredWorkflows: [rule], collectionStatus: 'complete' });
  const observation = normalizeCheckObservation({ checkId: 'ci-check', requiredCheckKey: null,
    requiredWorkflowKey: requiredCheckSnapshot.requiredWorkflowKeys[0], provider: 'github-actions', headSha, baseSha, mergeSha,
    testedSha: headSha, attemptKey: 'repair-attempt-1', status: 'completed', conclusion: 'failure', runnerOutcome: 'check_failed',
    coversRelevantScope: true, protectedPathTouched: false, failureFingerprint: 'f'.repeat(64) });
  const oldSnapshot = { repository, repositoryId, number: prNumber, state: 'open', draft: false, baseRef: 'main', baseSha,
    headRef: 'feature/test', headSha, mergeSha, headRepository: repository, updatedAt: '2026-09-29T00:00:00.000Z' };
  const newSnapshot = { ...oldSnapshot, headSha: newHeadSha, updatedAt: '2026-09-29T00:01:00.000Z' };
  let pushed = false; let diffReads = 0; let refreshes = 0;
  const events = []; let outputDiff = 'diff --git a/src/app.mjs b/src/app.mjs\n';
  const stateFor = (snapshot) => createPrBabysitterState({ repository, number: prNumber, state: 'open', draft: false,
    baseRef: snapshot.baseRef, baseSha: snapshot.baseSha, headRef: snapshot.headRef, headSha: snapshot.headSha,
    mergeSha: snapshot.mergeSha, headRepository: repository, updatedAt: snapshot.updatedAt });
  const trustedHost = { config: { repository, repositoryId, repoRoot: 'C:/repo', taskId: 'cli-repair-task', policy },
    adapters: {
      pr: {
        async collect() { events.push('collect'); const snapshot = pushed ? newSnapshot : oldSnapshot;
          return { prSnapshot: { repository, number: prNumber, state: 'open', draft: false, baseRef: 'main', baseSha,
            headRef: 'feature/test', headSha: snapshot.headSha, mergeSha, headRepository: repository, updatedAt: snapshot.updatedAt },
            requiredCheckSnapshot, checkObservations: pushed ? [] : [observation], checkCollectionComplete: true }; },
        async refresh() { events.push('refresh'); refreshes += 1;
          return tupleRace && refreshes >= 4 ? { ...oldSnapshot, headSha: '9'.repeat(40) } : pushed ? newSnapshot : oldSnapshot; },
      },
      state: { async load(_repo, _pr, snapshot) { events.push('state-load'); return stateFor(snapshot); }, async save() { events.push('state-save'); } },
      auth: {
        async authenticateApprover() { events.push('authenticate'); },
        async requestApproval(scope) { events.push(scope.capability === 'contents:write' ? 'contents-approval' : 'unexpected-approval');
          assert.deepEqual(scope, { repositoryId, prNumber, baseSha, headSha, mergeSha, capability: 'contents:write', paths: ['src/app.mjs'] });
          return { opaqueApproval: true }; },
        consumeApproval(approval, scope) { events.push('contents-consume'); assert.equal(approval.opaqueApproval, true); assert.equal(scope.capability, 'contents:write'); },
        async getInstallationToken(capability) { events.push('contents-token'); assert.equal(capability, 'contents:write'); return 'ghs_writer-secret'; },
      },
      repair: {
        session: Object.freeze({ hostCreated: true }),
        async readProposal(pathname) { events.push('read-proposal'); assert.equal(pathname, 'patch.json'); return { version: 1, operations: [] }; },
        async validateRepairProposal(session, proposal, context) {
          events.push('repair-approval'); assert.equal(session.hostCreated, true); assert.equal(proposal.version, 1); assert.deepEqual(context, {});
          events.push('repair-consume'); events.push('patch-write'); events.push('repair-commit');
          return { status: 'verified', newHeadSha, changedPaths: ['src/app.mjs'] };
        },
      },
      verifier: {
        async buildFullPlan(paths) { events.push('full-plan'); assert.deepEqual(paths, ['src/app.mjs']); return { mode: 'full', requiredExternalChecks: ['CI'] }; },
        async run(plan) { events.push('full-verify'); assert.equal(plan.mode, 'full'); return {
          passed: true, complete: false, commands: [{ exitCode: 0, signal: null, spawnErrorCode: null }],
          requiredExternalChecks: ['CI'], revisionStable: true, workspaceStable: true,
          verifiedRevision: newHeadSha, currentRevision: newHeadSha,
          verifiedWorkspaceFingerprint: missingFingerprint ? null : '1'.repeat(64),
          currentWorkspaceFingerprint: missingFingerprint ? null : '1'.repeat(64),
        }; },
      },
      writer: {
        async readFinalDiff() { events.push('read-diff'); diffReads += 1; return diffReads > 2 && tupleRace ? outputDiff + 'race' : outputDiff; },
        async readHeadSha() { events.push('read-head'); return newHeadSha; },
        async readWorkspaceFingerprint() { events.push('read-fingerprint'); return '1'.repeat(64); },
        async push(input) { events.push('push'); assert.equal(input.expectedHeadSha, headSha); assert.equal(input.targetCommitSha, newHeadSha);
          assert.equal(input.diffHash, createHash('sha256').update(outputDiff).digest('hex'));
          assert.equal(input.token, 'ghs_writer-secret');
          pushed = true; return { status: 'pushed', commitSha: newHeadSha, token: 'should-not-leak' }; },
      },
      budget: async (capability) => {
        events.push(`budget:${capability}`);
        if (capability === 'contents:write') {
          const checks = events.filter((event) => event.startsWith('contents-budget:')).length + 1;
          events.push(`contents-budget:${checks}`);
          return { stop: stopContentsBudget || checks === stopContentsBudgetCheck };
        }
        return { stop: capability === 'repair:workspace' && stopWorkspaceBudget };
      },
      telemetry: async () => {},
    } };
  return { trustedHost, events, set outputDiff(value) { outputDiff = value; }, get pushed() { return pushed; } };
}

async function createStage0Fixture(t, { remote = `https://github.com/${stage0Repository}.git` } = {}) {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'digital-e-loop-stage0-test-'));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const repoRoot = path.join(temporaryRoot, 'repo');
  const policyDirectory = path.join(repoRoot, '.agent', 'policy');
  await mkdir(policyDirectory, { recursive: true });
  for (const filename of ['protected-paths.yml', 'risk-rules.yml', 'stop-conditions.yml']) {
    await writeFile(path.join(policyDirectory, filename),
      await readFile(path.join(repositoryRoot, '.agent', 'policy', filename), 'utf8'), 'utf8');
  }
  const git = async (...args) => execFileAsync('git', ['-C', repoRoot, ...args], {
    encoding: 'utf8', timeout: 10_000, windowsHide: true,
  });
  await git('init', '--initial-branch=main');
  await git('config', 'user.name', 'Loop Stage 0 Test');
  await git('config', 'user.email', 'loop-stage0@example.invalid');
  await git('remote', 'add', 'origin', remote);
  await git('add', '.agent/policy');
  await git('commit', '-m', 'test: stage 0 canonical policy fixture');
  const baseSha = (await git('rev-parse', 'HEAD')).stdout.trim();
  await git('checkout', '-b', 'feature/stage0-probe');
  await writeFile(path.join(policyDirectory, 'stop-conditions.yml'), '{ invalid json', 'utf8');
  await writeFile(path.join(repoRoot, 'stage0-probe.txt'), 'fixture\n', 'utf8');
  await git('add', '.agent/policy/stop-conditions.yml', 'stage0-probe.txt');
  await git('commit', '-m', 'test: create a PR head with changed policy');
  const headSha = (await git('rev-parse', 'HEAD')).stdout.trim();

  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const keyPath = path.join(temporaryRoot, 'github-app-private-key.pem');
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  await writeFile(keyPath, privateKeyPem, { encoding: 'utf8', mode: 0o600 });
  return {
    repoRoot,
    baseSha,
    headSha,
    keyPath,
    privateKeyPem,
    env: {
      LOOP_GITHUB_APP_ID: '12345',
      LOOP_GITHUB_APP_CLIENT_ID: 'Iv1.stage0test',
      LOOP_GITHUB_APP_INSTALLATION_ID: '67890',
      LOOP_GITHUB_APP_PRIVATE_KEY_FILE: keyPath,
    },
  };
}

function createStage0Fetch({ baseSha, headSha, mergeSha = null, state = 'OPEN', headRepository = stage0Repository,
  repositoryId = stage0RepositoryId, requiredWorkflow = false, workflowRuns = [], requiredCheckContexts = [],
  statusesBySha = {}, checkRunsBySha = {} } = {}) {
  const requests = [];
  const permissions = { metadata: 'read', pull_requests: 'read', checks: 'read', actions: 'read', administration: 'read' };
  const reply = (body, status = 200) => new Response(body === '' ? '' : JSON.stringify(body), {
    status,
    headers: body === '' ? {} : { 'content-type': 'application/json' },
  });
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(String(input));
    const method = init.method ?? 'GET';
    requests.push({ url, method, body: init.body, headers: init.headers });

    if (method === 'POST' && url.pathname === `/app/installations/67890/access_tokens`) {
      return reply({ token: 'ghs_stage0_observe_secret', expires_at: new Date(Date.now() + 3_600_000).toISOString(),
        permissions, repository_selection: 'selected', repositories: [{ id: repositoryId }] });
    }
    if (method === 'GET' && url.pathname === `/repos/${stage0Repository}/pulls/7`) {
      const repositoryName = headRepository;
      return reply({
        number: 7,
        state: state.toLowerCase(),
        updated_at: '2026-09-30T00:00:00Z',
        base: { ref: 'main', sha: baseSha, repo: { id: repositoryId, full_name: stage0Repository } },
        head: { ref: 'feature/stage0-probe', sha: headSha,
          repo: { id: headRepository === stage0Repository ? repositoryId : repositoryId + 1, full_name: repositoryName } },
      });
    }
    if (method === 'POST' && url.pathname === '/graphql') {
      return reply({ data: { repository: { pullRequest: {
        state,
        isDraft: false,
        baseRefName: 'main',
        headRefName: 'feature/stage0-probe',
        baseRefOid: baseSha,
        headRefOid: headSha,
        potentialMergeCommit: mergeSha ? { oid: mergeSha } : null,
        mergeable: 'UNKNOWN',
        baseRepository: { databaseId: repositoryId, nameWithOwner: stage0Repository, defaultBranchRef: { name: 'main' } },
        headRepository: { databaseId: headRepository === stage0Repository ? repositoryId : repositoryId + 1,
          nameWithOwner: headRepository },
      } } } });
    }
    if (url.pathname === `/repos/${stage0Repository}/pulls/7/files`
      || url.pathname === `/repos/${stage0Repository}/pulls/7/reviews`
      || url.pathname === `/repos/${stage0Repository}/pulls/7/comments`) return reply([]);
    if (url.pathname === `/repos/${stage0Repository}`) return reply({ id: repositoryId, default_branch: 'main' });
    if (url.pathname === `/repos/${stage0Repository}/branches/main/protection`) {
      return requiredCheckContexts.length === 0 ? reply('', 404) : reply({
        required_status_checks: { strict: true, contexts: requiredCheckContexts, checks: [] },
      });
    }
    if (url.pathname === `/repos/${stage0Repository}/rulesets`) return reply(requiredWorkflow ? [{ id: 441 }] : []);
    if (url.pathname === `/repos/${stage0Repository}/rulesets/441` && requiredWorkflow) return reply({
      id: 441,
      target: 'branch',
      enforcement: 'active',
      conditions: { ref_name: { include: ['refs/heads/main'], exclude: [] } },
      rules: [{ type: 'required_workflows', parameters: { workflows: [{
        repository_id: repositoryId,
        path: '.github/workflows/ci.yml',
        ref: 'main',
        sha: 'd'.repeat(40),
      }] } }],
    });
    if (url.pathname === `/repos/${stage0Repository}/actions/runs`) {
      return reply({ total_count: workflowRuns.length, workflow_runs: workflowRuns });
    }
    const commitPathPrefix = `/repos/${stage0Repository}/commits/`;
    if (url.pathname.startsWith(commitPathPrefix)) {
      const refAndEndpoint = url.pathname.slice(commitPathPrefix.length);
      if (refAndEndpoint.endsWith('/check-runs')) {
        const testedSha = refAndEndpoint.slice(0, -'/check-runs'.length);
        const checkRuns = checkRunsBySha[testedSha] ?? [];
        return reply({ sha: testedSha, total_count: checkRuns.length, check_runs: checkRuns });
      }
      if (refAndEndpoint.endsWith('/status')) {
        const testedSha = refAndEndpoint.slice(0, -'/status'.length);
        const statuses = statusesBySha[testedSha] ?? [];
        const state = statuses.some((status) => status.state === 'pending') ? 'pending' : 'success';
        return reply({ sha: testedSha, total_count: statuses.length, state, statuses });
      }
    }
    return reply({ message: 'Not Found' }, 404);
  };
  return { fetchImpl, requests, permissions };
}

describe('PR Babysitter CLI', () => {
  it('exports a dedicated Stage 0 bootstrap runner', async () => {
    const hostModule = await import('../pr-babysitter-host.mjs').catch(() => null);
    assert.equal(typeof hostModule?.runPrBabysitterStage0, 'function');
  });

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
    assert.equal(result.exitCode, 3);
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
    assert.equal(result.exitCode, 3);
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
    assert.equal(exitCodeForAction('retry-check'), 1);
    assert.equal(exitCodeForAction('request-repair'), 1);
    assert.equal(exitCodeForAction('escalate'), 2);
  });

  it('refuses an incomplete command host before reading the PR', async () => {
    const trustedHost = makeHost();
    let reads = 0;
    trustedHost.adapters.pr.collect = async () => { reads += 1; throw Error('unexpected read'); };
    const result = await runPrBabysitterCli({ argv: ['rerun-flaky', '--repo', 'owner/repo', '--pr', '2'], trustedHost,
      io: { stdout: { write() {} }, stderr: { write() {} }, isTTY: true } });
    assert.equal(result.exitCode, 3);
    assert.equal(reads, 0);
  });

  it('routes exact workflow scope through the existing Actions writer and persists one retry', async () => {
    const harness = await createRerunHarness();
    let stdout = ''; let stderr = '';
    const result = await runPrBabysitterCli({ argv: ['rerun-flaky', '--repo', 'owner/repo', '--pr', '2'],
      trustedHost: harness.trustedHost,
      io: { isTTY: true, stdout: { write(value) { stdout += value; } }, stderr: { write(value) { stderr += value; } } } });
    assert.equal(result.exitCode, 1, `${stderr}${stdout}`);
    assert.equal(result.status, undefined);
    assert.deepEqual(harness.events.filter((name) => ['budget', 'authenticate', 'target', 'approve', 'writer', 'reserved', 'write'].includes(name)),
      ['budget', 'authenticate', 'target', 'approve', 'writer', 'reserved', 'write'], JSON.stringify({ result, stdout, stderr }));
    assert.equal(stdout.includes('secret-token-value'), false);
    assert.match(stdout, /"status":"wait"/);
    assert.equal(harness.reserved, 1);
    assert.equal(harness.prState.telemetry.observationsRecorded, 1);
    assert.equal(harness.prState.actionableFailureCounts['f'.repeat(64)], 1);
    assert.equal(harness.prState.telemetry.flakyRetriesRecorded, 1);
    const duplicate = await runPrBabysitterCli({ argv: ['decide', '--repo', 'owner/repo', '--pr', '2'],
      trustedHost: harness.trustedHost, io: { stdout: { write() {} }, stderr: { write() {} } } });
    assert.equal(duplicate.exitCode, 1);
    assert.equal(harness.prState.telemetry.observationsRecorded, 1);
    assert.equal(harness.prState.actionableFailureCounts['f'.repeat(64)], 1);
  });

  it('stops on exhausted CI budget before authentication, approval, or write', async () => {
    const harness = await createRerunHarness({ stopBudget: true });
    const result = await runPrBabysitterCli({ argv: ['rerun-flaky', '--repo', 'owner/repo', '--pr', '2'],
      trustedHost: harness.trustedHost, io: { isTTY: true, stdout: { write() {} }, stderr: { write() {} } } });
    assert.equal(result.exitCode, 3);
    assert.equal(harness.events.includes('authenticate'), false);
    assert.equal(harness.events.includes('approve'), false);
    assert.equal(harness.events.includes('write'), false);
    assert.equal(harness.reserved, 0);
  });

  it('stops on exhausted repair budget before authentication or reading the proposal', async () => {
    const harness = createRepairHarness({ stopWorkspaceBudget: true });
    const result = await runPrBabysitterCli({ argv: ['validate-repair', '--repo', 'owner/repo', '--pr', '2', '--patch', 'patch.json'],
      trustedHost: harness.trustedHost, io: { isTTY: true, stdout: { write() {} }, stderr: { write() {} } } });
    assert.equal(result.exitCode, 3);
    assert.ok(harness.events.includes('budget:repair:workspace'));
    assert.equal(harness.events.includes('authenticate'), false);
    assert.equal(harness.events.includes('read-proposal'), false);
    assert.equal(harness.events.includes('repair-approval'), false);
    assert.equal(harness.events.includes('patch-write'), false);
    assert.equal(harness.events.includes('push'), false);
  });

  it('checks the contents budget before minting a token and rechecks immediately before push', async () => {
    const stoppedBeforeToken = createRepairHarness({ stopContentsBudget: true });
    const firstResult = await runPrBabysitterCli({
      argv: ['validate-repair', '--repo', 'owner/repo', '--pr', '2', '--patch', 'patch.json'],
      trustedHost: stoppedBeforeToken.trustedHost,
      io: { isTTY: true, stdout: { write() {} }, stderr: { write() {} } },
    });
    assert.equal(firstResult.exitCode, 3);
    assert.deepEqual(stoppedBeforeToken.events.filter((event) => event.startsWith('contents-budget:')), ['contents-budget:1']);
    assert.equal(stoppedBeforeToken.events.includes('contents-token'), false);
    assert.equal(stoppedBeforeToken.pushed, false);

    const stoppedBeforePush = createRepairHarness({ stopContentsBudgetCheck: 2 });
    const secondResult = await runPrBabysitterCli({
      argv: ['validate-repair', '--repo', 'owner/repo', '--pr', '2', '--patch', 'patch.json'],
      trustedHost: stoppedBeforePush.trustedHost,
      io: { isTTY: true, stdout: { write() {} }, stderr: { write() {} } },
    });
    assert.equal(secondResult.exitCode, 3);
    assert.deepEqual(stoppedBeforePush.events.filter((event) => event.startsWith('contents-budget:')),
      ['contents-budget:1', 'contents-budget:2']);
    assert.equal(stoppedBeforePush.events.includes('contents-token'), true);
    assert.equal(stoppedBeforePush.pushed, false);
  });

  it('consumes workspace approval before patch writes, verifies locally, then pushes exact commit and waits for hosted CI', async () => {
    const harness = createRepairHarness(); let stdout = ''; let stderr = '';
    const result = await runPrBabysitterCli({ argv: ['validate-repair', '--repo', 'owner/repo', '--pr', '2', '--patch', 'patch.json'],
      trustedHost: harness.trustedHost,
      io: { isTTY: true, stdout: { write(value) { stdout += value; } }, stderr: { write(value) { stderr += value; } } } });
    assert.equal(result.exitCode, 1, `${stderr}${stdout}`);
    const events = harness.events;
    assert.ok(events.indexOf('repair-consume') < events.indexOf('patch-write'));
    assert.ok(events.indexOf('patch-write') < events.indexOf('repair-commit'));
    assert.ok(events.indexOf('repair-commit') < events.indexOf('full-verify'));
    assert.ok(events.indexOf('full-verify') < events.indexOf('contents-approval'));
    assert.ok(events.indexOf('contents-consume') < events.indexOf('contents-token'));
    assert.ok(events.indexOf('contents-budget:1') < events.indexOf('contents-token'));
    assert.ok(events.indexOf('contents-token') < events.indexOf('contents-budget:2'));
    assert.ok(events.indexOf('contents-budget:2') < events.indexOf('push'));
    assert.ok(events.indexOf('contents-token') < events.lastIndexOf('refresh'));
    assert.equal(events.at(-1), 'state-save');
    assert.equal(harness.pushed, true);
    assert.equal(stdout.includes('should-not-leak'), false);
    assert.equal(stdout.includes('ghs_writer-secret'), false);
    assert.match(stdout, /"status":"wait"/);
  });

  it('refuses a full verifier result without canonical workspace fingerprints before contents approval', async () => {
    const harness = createRepairHarness({ missingFingerprint: true });
    const result = await runPrBabysitterCli({ argv: ['validate-repair', '--repo', 'owner/repo', '--pr', '2', '--patch', 'patch.json'],
      trustedHost: harness.trustedHost, io: { isTTY: true, stdout: { write() {} }, stderr: { write() {} } } });
    assert.equal(result.exitCode, 4);
    assert.equal(harness.events.includes('contents-approval'), false);
    assert.equal(harness.pushed, false);
  });

  it('refuses a PR tuple or final diff race after approval consumption and token mint', async () => {
    const harness = createRepairHarness({ tupleRace: true });
    const result = await runPrBabysitterCli({ argv: ['validate-repair', '--repo', 'owner/repo', '--pr', '2', '--patch', 'patch.json'],
      trustedHost: harness.trustedHost, io: { isTTY: true, stdout: { write() {} }, stderr: { write() {} } } });
    assert.equal(result.exitCode, 3);
    assert.ok(harness.events.includes('contents-consume'));
    assert.ok(harness.events.includes('contents-token'));
    assert.equal(harness.pushed, false);
  });
});

describe('Stage 0 trusted host bootstrap', () => {
  it('refuses every write-capable command before loading App credentials or contacting GitHub', async (t) => {
    const { runPrBabysitterStage0 } = await import('../pr-babysitter-host.mjs');
    let fetchCalls = 0;
    t.mock.method(globalThis, 'fetch', async () => { fetchCalls += 1; throw Error('unexpected network'); });
    let stderr = '';
    const result = await runPrBabysitterStage0({
      argv: ['rerun-flaky', '--repo', stage0Repository, '--pr', '7'],
      env: {},
      io: { stdout: { write() {} }, stderr: { write(value) { stderr += value; } } },
    });
    assert.equal(result.exitCode, 3);
    assert.equal(fetchCalls, 0);
    assert.match(stderr, /stage0_read_only/);
  });

  it('fails closed when dedicated GitHub App settings are missing', async (t) => {
    const { runPrBabysitterStage0 } = await import('../pr-babysitter-host.mjs');
    const fixture = await createStage0Fixture(t);
    let stderr = '';
    t.mock.method(globalThis, 'fetch', async () => { throw Error('unexpected network'); });
    const result = await runPrBabysitterStage0({
      argv: ['inspect', '--repo', stage0Repository, '--pr', '7'],
      repoRoot: fixture.repoRoot,
      env: {},
      io: { stdout: { write() {} }, stderr: { write(value) { stderr += value; } } },
    });
    assert.equal(result.exitCode, 3);
    assert.match(stderr, /app_configuration_missing/);
  });

  it('rejects a private-key path inside the checkout before reading it or contacting GitHub', async (t) => {
    const { runPrBabysitterStage0 } = await import('../pr-babysitter-host.mjs');
    const fixture = await createStage0Fixture(t);
    let stderr = '';
    t.mock.method(globalThis, 'fetch', async () => { throw Error('unexpected network'); });
    const result = await runPrBabysitterStage0({
      argv: ['inspect', '--repo', stage0Repository, '--pr', '7'],
      env: {
        LOOP_GITHUB_APP_ID: '12345',
        LOOP_GITHUB_APP_CLIENT_ID: 'Iv1.stage0test',
        LOOP_GITHUB_APP_INSTALLATION_ID: '67890',
        LOOP_GITHUB_APP_PRIVATE_KEY_FILE: path.join(fixture.repoRoot, 'AGENTS.md'),
      },
      repoRoot: fixture.repoRoot,
      io: { stdout: { write() {} }, stderr: { write(value) { stderr += value; } } },
    });
    assert.equal(result.exitCode, 3);
    assert.match(stderr, /app_key_path_rejected/);
    assert.equal(stderr.includes('Loop Engineering contract'), false);
  });

  it('uses only the fixed repository, base-commit policy, and observe installation capability', async (t) => {
    const { createPrBabysitterStage0Host } = await import('../pr-babysitter-host.mjs');
    const fixture = await createStage0Fixture(t);
    const github = createStage0Fetch({ baseSha: fixture.baseSha, headSha: fixture.headSha });
    t.mock.method(globalThis, 'fetch', github.fetchImpl);
    const host = await createPrBabysitterStage0Host({ prNumber: 7, repoRoot: fixture.repoRoot, env: fixture.env });
    assert.equal(host.config.repository, stage0Repository);
    assert.equal(host.config.repositoryId, stage0RepositoryId);
    assert.equal(host.config.policy.stopConditions.maxIterations, 5);
    assert.equal(typeof host.adapters.pr.collect, 'function');
    assert.equal(typeof host.adapters.writer.push, 'undefined');
    assert.equal(typeof host.adapters.actions, 'undefined');
    await assert.rejects(host.adapters.auth.getInstallationToken('contents:write'));
    await assert.rejects(host.adapters.auth.getInstallationToken('actions:rerun'));

    const tokenRequest = github.requests.find((request) => request.url.pathname === '/app/installations/67890/access_tokens');
    assert.ok(tokenRequest);
    const body = JSON.parse(tokenRequest.body);
    assert.deepEqual(body.repository_ids, [stage0RepositoryId]);
    assert.deepEqual(body.permissions, github.permissions);
    assert.equal(github.requests.some((request) => request.method === 'POST'
      && request.url.pathname !== '/app/installations/67890/access_tokens' && request.url.pathname !== '/graphql'), false);
  });

  it('emits a bounded real PR observation and stores no App key or token', async (t) => {
    const { runPrBabysitterStage0 } = await import('../pr-babysitter-host.mjs');
    const fixture = await createStage0Fixture(t);
    const github = createStage0Fetch({ baseSha: fixture.baseSha, headSha: fixture.headSha });
    t.mock.method(globalThis, 'fetch', github.fetchImpl);
    let stdout = '';
    let stderr = '';
    const result = await runPrBabysitterStage0({
      argv: ['inspect', '--repo', stage0Repository, '--pr', '7'],
      repoRoot: fixture.repoRoot,
      env: fixture.env,
      io: { stdout: { write(value) { stdout += value; } }, stderr: { write(value) { stderr += value; } } },
    });

    assert.equal(result.exitCode, 0, stderr);
    const observation = JSON.parse(stdout.trim());
    assert.equal(observation.status, 'observed');
    assert.equal(observation.pr.repository, stage0Repository);
    assert.equal(observation.pr.baseSha, fixture.baseSha);
    assert.equal(observation.pr.headSha, fixture.headSha);
    assert.equal(observation.decision.action, 'ready-for-human');
    assert.equal(observation.evidence.requiredCheckSnapshot.collectionStatus, 'complete');
    assert.deepEqual(observation.evidence.requiredCheckSnapshot.requiredChecks, []);
    assert.deepEqual(observation.evidence.requiredCheckSnapshot.requiredWorkflows, []);
    assert.equal(observation.evidence.checkCollectionComplete, true);
    assert.deepEqual(observation.evidence.observations, []);
    assert.equal(observation.evidence.reviewSummary.collectionStatus, 'complete');
    assert.equal(stdout.includes('ghs_stage0_observe_secret'), false);
    assert.equal(stdout.includes(fixture.privateKeyPem), false);

    const mutatingRequests = github.requests.filter(({ method, url }) => method === 'PUT' || method === 'PATCH' || method === 'DELETE'
      || (method === 'POST' && url.pathname !== '/graphql' && url.pathname !== '/app/installations/67890/access_tokens'));
    assert.deepEqual(mutatingRequests, []);
    const stateDirectory = path.join(fixture.repoRoot, '.loop', 'pr');
    const stateFiles = await (await import('node:fs/promises')).readdir(stateDirectory);
    assert.equal(stateFiles.length, 1);
    const stateText = await readFile(path.join(stateDirectory, stateFiles[0]), 'utf8');
    assert.equal(stateText.includes('ghs_stage0_observe_secret'), false);
    assert.equal(stateText.includes(fixture.privateKeyPem), false);
  });

  it('reports required check evidence independently for the current head and merge SHAs', async (t) => {
    const { runPrBabysitterStage0 } = await import('../pr-babysitter-host.mjs');
    const fixture = await createStage0Fixture(t);
    const mergeSha = 'c'.repeat(40);
    const github = createStage0Fetch({
      baseSha: fixture.baseSha,
      headSha: fixture.headSha,
      mergeSha,
      requiredCheckContexts: ['client', 'server'],
      statusesBySha: {
        [fixture.headSha]: [{
          context: 'client',
          state: 'success',
          created_at: '2026-09-30T00:00:00Z',
          creator: { id: 15368 },
          description: 'completed',
        }],
      },
    });
    t.mock.method(globalThis, 'fetch', github.fetchImpl);
    let stdout = '';
    const result = await runPrBabysitterStage0({
      argv: ['inspect', '--repo', stage0Repository, '--pr', '7'],
      repoRoot: fixture.repoRoot,
      env: fixture.env,
      io: { stdout: { write(value) { stdout += value; } }, stderr: { write() {} } },
    });

    assert.equal(result.exitCode, 1);
    const observation = JSON.parse(stdout.trim());
    const summary = observation.evidence;
    assert.equal(observation.decision.action, 'wait');
    assert.equal(observation.decision.reasonCode, 'required_check_evidence_missing');
    assert.equal(summary.testedSha, mergeSha);
    assert.equal(summary.observationsTotal, 0);
    assert.deepEqual(summary.checkCollectionsBySha.map((collection) => ({
      testedSha: collection.testedSha,
      collectionStatus: collection.collectionStatus,
      snapshotCurrent: collection.snapshotCurrent,
      checkCollectionComplete: collection.checkCollectionComplete,
      requiredIdentityCoverage: collection.requiredIdentityCoverage,
      observationsTotal: collection.observationsTotal,
      observations: collection.observations.map(({ requiredCheckKey, conclusion }) => ({ requiredCheckKey, conclusion })),
    })), [
      {
        testedSha: mergeSha,
        collectionStatus: 'complete',
        snapshotCurrent: true,
        checkCollectionComplete: true,
        requiredIdentityCoverage: {
          matched: 0,
          total: 2,
          unmatched: [{ context: 'client', appId: null }, { context: 'server', appId: null }],
          unmatchedTotal: 2,
          unmatchedTruncated: false,
        },
        observationsTotal: 0,
        observations: [],
      },
      {
        testedSha: fixture.headSha,
        collectionStatus: 'complete',
        snapshotCurrent: true,
        checkCollectionComplete: true,
        requiredIdentityCoverage: {
          matched: 1,
          total: 2,
          unmatched: [{ context: 'server', appId: null }],
          unmatchedTotal: 1,
          unmatchedTruncated: false,
        },
        observationsTotal: 1,
        observations: [{ requiredCheckKey: 'client|legacy', conclusion: 'success' }],
      },
    ]);
  });

  it('keeps required workflows unavailable when GitHub exposes no attested source SHA', async (t) => {
    const { runPrBabysitterStage0 } = await import('../pr-babysitter-host.mjs');
    const fixture = await createStage0Fixture(t);
    const github = createStage0Fetch({
      baseSha: fixture.baseSha,
      headSha: fixture.headSha,
      requiredWorkflow: true,
      workflowRuns: [{
        id: 88,
        repository: { id: stage0RepositoryId },
        path: '.github/workflows/ci.yml@main',
        head_sha: fixture.headSha,
        workflow_id: 44,
        event: 'pull_request',
        run_number: 5,
        run_attempt: 1,
        status: 'completed',
        conclusion: 'success',
      }],
    });
    t.mock.method(globalThis, 'fetch', github.fetchImpl);
    let stdout = '';
    const result = await runPrBabysitterStage0({
      argv: ['inspect', '--repo', stage0Repository, '--pr', '7'],
      repoRoot: fixture.repoRoot,
      env: fixture.env,
      io: { stdout: { write(value) { stdout += value; } }, stderr: { write() {} } },
    });

    assert.equal(result.exitCode, 1);
    const observation = JSON.parse(stdout.trim());
    assert.equal(observation.evidence.requiredCheckSnapshot.requiredWorkflows.length, 1);
    assert.equal(observation.evidence.workflowEvidence[0].status, 'unavailable');
    assert.equal(observation.evidence.workflowEvidence[0].reasonCode, 'workflow_source_sha_unattested');
    assert.equal(observation.decision.reasonCode, 'required_workflow_evidence_missing');
  });
});
