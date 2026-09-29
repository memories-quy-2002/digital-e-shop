import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import { exitCodeForAction, parsePrBabysitterArguments, runPrBabysitterCli } from '../pr-babysitter-cli.mjs';
import { createPrBabysitterState } from '../pr-state.mjs';
import { normalizeCheckObservation, normalizeRequiredCheckSnapshot } from '../pr-evidence.mjs';

const sha = 'a'.repeat(40);
const policy = { schemaVersion: 1, protectedPaths: { high: [], critical: [] },
  riskRules: { low: [], medium: [], high: [], criticalActions: [] },
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

function createRepairHarness({ missingFingerprint = false, tupleRace = false, stopWorkspaceBudget = false } = {}) {
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
          return tupleRace && refreshes >= 3 ? { ...oldSnapshot, headSha: '9'.repeat(40) } : pushed ? newSnapshot : oldSnapshot; },
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
        async readFinalDiff() { events.push('read-diff'); diffReads += 1; return diffReads > 1 && tupleRace ? outputDiff + 'race' : outputDiff; },
        async readHeadSha() { events.push('read-head'); return newHeadSha; },
        async readWorkspaceFingerprint() { events.push('read-fingerprint'); return '1'.repeat(64); },
        async push(input) { events.push('push'); assert.equal(input.expectedHeadSha, headSha); assert.equal(input.targetCommitSha, newHeadSha);
          assert.equal(input.diffHash, createHash('sha256').update(outputDiff).digest('hex'));
          assert.equal(input.token, 'ghs_writer-secret');
          pushed = true; return { status: 'pushed', commitSha: newHeadSha, token: 'should-not-leak' }; },
      },
      budget: async (capability) => { events.push(`budget:${capability}`);
        return { stop: capability === 'repair:workspace' && stopWorkspaceBudget }; },
      telemetry: async () => {},
    } };
  return { trustedHost, events, set outputDiff(value) { outputDiff = value; }, get pushed() { return pushed; } };
}

describe('PR Babysitter CLI', () => {
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
