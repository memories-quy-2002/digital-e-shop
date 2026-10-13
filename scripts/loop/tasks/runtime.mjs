import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

import { validateTaskRecord } from './contracts.mjs';
import { createTaskSession } from './session.mjs';
import { createTaskImplementationPipeline } from '../runner/task-pipeline.mjs';
import { createGitAdapter, createIssueDeliveryHost } from './github-issue-delivery.mjs';
import { buildVerificationPlan, readGitHeadRevision, readGitWorkspaceFingerprint, runVerificationPlan } from '../verify.mjs';
import { reconcileTaskCi } from './ci-reconciliation.mjs';

const TASK_ID = /^repo-[1-9][0-9]*-issue-[1-9][0-9]*-g[1-9][0-9]*$/;
const REVISION = /^[a-f0-9]{40,64}$/i;
const DIGEST = /^[a-f0-9]{64}$/;
const OWNER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ACTIVE = new Map();
const LOCAL_CONCURRENCY = 1;
const MAX_PACKET_BYTES = 4096;
const TERMINAL = new Set(['completed', 'cancelled', 'escalated', 'failed']);
const YIELD_STATES = new Set(['queued', 'delivering', 'monitoring', 'waiting-approval', 'retry-wait']);
const UNCERTAIN_SIDE_EFFECTS = new Set(['push_outcome_uncertain', 'pull_request_outcome_uncertain', 'github_response_uncertain']);
const execFileAsync = promisify(execFile);

export class IssueTaskRuntimeError extends Error {
  constructor(code, options = {}) { super(code, options); this.name = new.target.name; this.code = code; }
}

function fail(code, cause) { throw new IssueTaskRuntimeError(code, cause ? { cause } : undefined); }
function plain(value) { return value !== null && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value)); }
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function strictObject(value, keys) { return plain(value) && Object.keys(value).sort().join('|') === [...keys].sort().join('|'); }
function response(status, body) { return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } }); }
function sha256(value) { return createHash('sha256').update(value, 'utf8').digest('hex'); }
function safeReason(error) { return typeof error?.code === 'string' && /^[a-z][a-z0-9_-]{0,63}$/.test(error.code) ? error.code : 'task_runtime_failed'; }

function validatePacket(value, repositoryId) {
  const keys = ['deliveryId', 'expectedVersion', 'generation', 'issueNumber', 'kind', 'leaseOwner', 'leaseUntil', 'policyRevision', 'repositoryId', 'sourceRevision', 'taskId'];
  if (!strictObject(value, keys) || value.kind !== 'issue_task' || value.repositoryId !== repositoryId
      || !Number.isSafeInteger(value.issueNumber) || value.issueNumber < 1
      || !Number.isSafeInteger(value.generation) || value.generation < 1
      || value.taskId !== `repo-${repositoryId}-issue-${value.issueNumber}-g${value.generation}` || !TASK_ID.test(value.taskId)
      || typeof value.deliveryId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value.deliveryId)
      || !REVISION.test(value.sourceRevision) || !REVISION.test(value.policyRevision)
      || value.sourceRevision.toLowerCase() !== value.policyRevision.toLowerCase()
      || !Number.isSafeInteger(value.expectedVersion) || value.expectedVersion < 1
      || typeof value.leaseOwner !== 'string' || !OWNER.test(value.leaseOwner)
      || !Number.isSafeInteger(value.leaseUntil) || value.leaseUntil < 1) fail('task_packet_invalid');
  return Object.freeze({ ...value });
}

function validateIssue(issue, record) {
  if (!plain(issue) || Object.keys(issue).sort().join('|') !== ['action', 'actorId', 'body', 'issueNumber', 'isPullRequest', 'labels', 'title'].sort().join('|')
      || issue.issueNumber !== record.key.issueNumber || !Number.isSafeInteger(issue.actorId) || issue.actorId < 1
      || typeof issue.action !== 'string' || typeof issue.isPullRequest !== 'boolean'
      || !Array.isArray(issue.labels) || issue.labels.length > 100 || issue.labels.some((label) => typeof label !== 'string' || label.length > 100)
      || typeof issue.title !== 'string' || Buffer.byteLength(issue.title, 'utf8') > 512
      || typeof issue.body !== 'string' || Buffer.byteLength(issue.body, 'utf8') > 64 * 1024) fail('trusted_issue_observation_invalid');
  if (sha256(issue.body) !== record.requestDigest) fail('issue_digest_mismatch');
  return issue;
}

function assertIssuePolicy(issue, context) {
  if (issue.isPullRequest || !['opened', 'labeled'].includes(issue.action)
      || !context.policy.eligibleActors.includes(issue.actorId)
      || !issue.labels.includes(context.policy.optInLabel)) fail('issue_not_eligible');
  return issue;
}

function sameIssue(left, right) {
  return left.issueNumber === right.issueNumber && left.actorId === right.actorId
    && left.action === right.action && left.isPullRequest === right.isPullRequest
    && left.title === right.title && left.body === right.body && same(left.labels, right.labels);
}

function validateContext(context, record) {
  if (!plain(context) || !plain(context.policy) || context.policy.trustedRevision?.toLowerCase() !== record.policyRevision.toLowerCase()
      || typeof context.policy.enabled !== 'boolean' || context.policy.autoMergeEnabled !== false
      || !plain(context.loopPolicy) || !plain(context.loopPolicy.stopConditions)) fail('canonical_task_context_invalid');
  return context;
}

async function readBoundedJson(request) {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') fail('task_packet_invalid');
  const reader = request.body?.getReader();
  if (!reader) fail('task_packet_invalid');
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_PACKET_BYTES) { await reader.cancel(); fail('task_packet_invalid'); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { fail('task_packet_invalid'); }
}

function policyDigestContext(context, record) {
  const policy = context.policy;
  if (policy.capabilities?.includes('auto_merge') || policy.autoMergeEnabled !== false) fail('task_policy_invalid');
  if (policy.trustedRevision.toLowerCase() !== record.sourceRevision.toLowerCase()
      || record.policyRevision.toLowerCase() !== record.sourceRevision.toLowerCase()) fail('policy_revision_mismatch');
}

async function assertTrustedPolicyRootClean(root) {
  let stdout;
  try {
    ({ stdout } = await execFileAsync('git', ['-C', root, '-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false',
      'status', '--porcelain=v1', '-z', '--untracked-files=all', '--', '.agent/policy'], {
      encoding: null, env: { PATH: process.env.PATH ?? '', ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
        ...(process.env.WINDIR ? { WINDIR: process.env.WINDIR } : {}) }, windowsHide: true, timeout: 15_000, maxBuffer: 2 * 1024 * 1024,
    }));
  } catch (error) { fail('canonical_policy_root_unavailable', error); }
  if (!Buffer.isBuffer(stdout) || stdout.length !== 0) fail('canonical_policy_root_dirty');
}

/**
 * Local host gateway for the Cloudflare TaskDispatchPacket. The caller supplies
 * host-owned D1/auth/Issue-observer/model-broker and runner-observer adapters;
 * no packet field can provide an approval, token, or policy decision.
 */
function createRuntime(options, testAdapters = null) {
  const allowed = ['repositoryId', 'repoRoot', 'runnerRoot', 'trustedPolicyRoot', 'repository', 'taskStore',
    'authenticate', 'authProvider', 'observeIssue', 'observePullRequest', 'inspectRunner', 'invokeModelCall',
    'loadCanonicalContext', 'docker', 'gitAdapter', 'githubApi', 'now', 'observeCi'];
  const required = ['repositoryId', 'repoRoot', 'runnerRoot', 'trustedPolicyRoot', 'repository', 'taskStore',
    'authenticate', 'authProvider', 'observeIssue', 'observePullRequest', 'inspectRunner', 'invokeModelCall'];
  if (!plain(options) || Object.keys(options).some((key) => !allowed.includes(key))
      || required.some((key) => !Object.hasOwn(options, key))
      || !Number.isSafeInteger(options.repositoryId) || options.repositoryId < 1
      || ['repoRoot', 'runnerRoot', 'trustedPolicyRoot'].some((key) => typeof options[key] !== 'string' || options[key].length === 0)
      || typeof options.authenticate !== 'function' || typeof options.observeIssue !== 'function'
      || typeof options.observePullRequest !== 'function' || typeof options.inspectRunner !== 'function'
      || typeof options.invokeModelCall !== 'function' || typeof options.loadCanonicalContext !== 'function'
      || (!testAdapters && typeof options.observeCi !== 'function')
      || !options.taskStore || ['loadTaskRecord', 'loadTaskLease', 'assertTaskLease', 'compareAndSaveTaskRecordUnderLease', 'releaseTaskLease']
        .some((key) => typeof options.taskStore[key] !== 'function')
      || (!testAdapters && (!options.docker || typeof options.docker !== 'object'))) fail('runtime_configuration_invalid');

  const store = options.taskStore;
  const git = options.gitAdapter ?? createGitAdapter();
  const now = options.now ?? Date.now;
  if (typeof now !== 'function') fail('runtime_configuration_invalid');
  const local = new Map();

  async function loadRecord(taskId) {
    const record = validateTaskRecord(await store.loadTaskRecord(taskId));
    if (record.taskId !== taskId || record.key.repositoryId !== options.repositoryId) fail('task_identity_mismatch');
    return record;
  }

  async function loadContext(record, workspaceRoot) {
    const context = await options.loadCanonicalContext(record, workspaceRoot);
    return validateContext(context, record);
  }

  async function assertPacketFresh(packet, { allowAdvanced = false } = {}) {
    const record = await loadRecord(packet.taskId);
    const lease = await store.loadTaskLease(packet.taskId);
    if (!lease || lease.owner !== packet.leaseOwner || lease.leaseUntil <= now()
        || lease.taskVersion !== record.version || (!allowAdvanced && record.version !== packet.expectedVersion)) fail('task_lease_or_version_stale');
    if (record.key.issueNumber !== packet.issueNumber || record.key.generation !== packet.generation
        || record.sourceRevision.toLowerCase() !== packet.sourceRevision.toLowerCase()
        || record.policyRevision.toLowerCase() !== packet.policyRevision.toLowerCase()) fail('task_identity_mismatch');
    if (await store.assertTaskLease(packet.taskId, packet.leaseOwner, now(), record.version) !== true) fail('task_lease_lost');
    return record;
  }

  async function canonicalPolicy(record) {
    const revision = await readGitHeadRevision(options.trustedPolicyRoot);
    if (revision.toLowerCase() !== record.policyRevision.toLowerCase()) fail('canonical_policy_root_stale');
    await assertTrustedPolicyRootClean(options.trustedPolicyRoot);
    const context = await loadContext(record, null);
    policyDigestContext(context, record);
    const after = await readGitHeadRevision(options.trustedPolicyRoot);
    await assertTrustedPolicyRootClean(options.trustedPolicyRoot);
    if (after.toLowerCase() !== revision.toLowerCase()) fail('canonical_policy_root_stale');
    return context;
  }

  async function runTask(packet, prefetchedIssue) {
    const key = packet.taskId;
    const state = local.get(key);
    if (state) return state.promise;
    const lock = { taskId: key, owner: packet.leaseOwner, expectedVersion: packet.expectedVersion,
      status: 'running', promise: null, stopped: false, unknown: false };
    local.set(key, lock);
    ACTIVE.set(key, lock);
    lock.promise = (async () => {
      let mayRelease = false;
      let record;
      try {
        record = await assertPacketFresh(packet);
        const context = await canonicalPolicy(record);
        if (context.policy.enabled !== true) fail('task_policy_disabled');
        if (TERMINAL.has(record.state)) { mayRelease = true; return; }

        let issue = prefetchedIssue;
        const assertIssueCurrent = async (expected = issue) => {
          const freshRecord = await assertPacketFresh(packet, { allowAdvanced: true });
          const freshContext = await canonicalPolicy(freshRecord);
          const latest = assertIssuePolicy(validateIssue(await options.observeIssue(Object.freeze({ repositoryId: freshRecord.key.repositoryId,
            issueNumber: freshRecord.key.issueNumber, expectedDigest: freshRecord.requestDigest })), freshRecord), freshContext);
          if (expected && !sameIssue(expected, latest)) fail('issue_changed_after_dispatch');
          return latest;
        };

        let freshPrSnapshot;
        const session = createTaskSession({ taskId: record.taskId, leaseOwner: packet.leaseOwner, store,
          now, loadContext: async (freshRecord, { workspaceRoot }) => {
            const loaded = await loadContext(freshRecord, workspaceRoot);
            return freshPrSnapshot ? { ...loaded, prSnapshot: freshPrSnapshot } : loaded;
          } });
        if (record.state === 'queued') {
          if (!testAdapters) {
            const pipeline = createTaskImplementationPipeline({ session, repoRoot: options.repoRoot,
              runnerRoot: options.runnerRoot, issueContext: { repositoryId: record.key.repositoryId,
                issueNumber: record.key.issueNumber, issueTitle: issue.title, issueBody: issue.body },
              allowedPaths: context.policy.eligiblePaths, docker: options.docker,
              invokeModelCall: async (...args) => {
                await assertIssueCurrent(issue);
                return options.invokeModelCall(...args);
              } });
            const outcome = await pipeline.run();
            if (outcome.status !== 'ready_for_delivery') {
              if (outcome.retainLease === true || outcome.status === 'stale') lock.unknown = true;
              else mayRelease = ['failed', 'escalated', 'interrupted'].includes(outcome.status);
              return;
            }
            await session.bindWorkspace(outcome.worktreePath);
          } else {
            const outcome = await testAdapters.pipeline({ packet, record, issue, session, context, assertIssueCurrent });
            if (outcome?.status !== 'ready_for_delivery' || outcome.taskId !== record.taskId) {
              lock.unknown = outcome?.retainLease === true;
              mayRelease = !lock.unknown && outcome?.durableYield === true;
              return;
            }
            if (outcome.worktreePath) await session.bindWorkspace(outcome.worktreePath);
          }
          record = await session.current();
        } else if (record.state === 'delivering') {
          const worktreePath = path.join(options.runnerRoot, record.taskId);
          if (!testAdapters) await session.bindWorkspace(worktreePath);
        } else if (record.state !== 'monitoring') {
          fail('task_state_not_resumable');
        }

        if (record.state === 'delivering' || (record.state === 'queued' && (await session.current()).state === 'delivering')) {
          record = await session.current();
          const workspaceRoot = testAdapters ? options.repoRoot : path.join(options.runnerRoot, record.taskId);
          const refreshedIssue = issue ?? null;
          const delivery = !testAdapters ? createIssueDeliveryHost({ repoRoot: workspaceRoot,
            trustedPolicyRoot: options.trustedPolicyRoot, repository: options.repository, taskRecord: record,
            taskStore: store, leaseOwner: packet.leaseOwner, authProvider: options.authProvider, now,
            ...(refreshedIssue ? { assertIssueCurrent: () => assertIssueCurrent(refreshedIssue) } : {}),
            ...(options.githubApi ? { githubApi: options.githubApi } : {}),
            ...(options.gitAdapter ? { gitAdapter: options.gitAdapter } : {}) }) : null;
          let delivered;
          try {
            await assertPacketFresh(packet, { allowAdvanced: true });
            delivered = testAdapters ? await testAdapters.delivery({ packet, record, issue: refreshedIssue, session, context, assertIssueCurrent }) : await delivery.deliver();
          } catch (error) {
            const code = safeReason(error);
            if (UNCERTAIN_SIDE_EFFECTS.has(code)) lock.unknown = true;
            else mayRelease = true; // TaskRecord remains in its current durable phase for approval/retry.
            return;
          }
          if (!delivered || !['delivered', 'already-delivered'].includes(delivered.status)
              || delivered.taskId !== record.taskId || !delivered.pullRequest) fail('delivery_result_invalid');
          const localHead = await readGitHeadRevision(workspaceRoot);
          const localFingerprint = await readGitWorkspaceFingerprint(workspaceRoot);
          if (localHead.toLowerCase() !== delivered.headSha?.toLowerCase()
              || (delivered.workspaceFingerprint && delivered.workspaceFingerprint !== localFingerprint)) fail('delivery_checkout_changed');
          const verification = testAdapters?.verifyDelivery
            ? await testAdapters.verifyDelivery(record, workspaceRoot, context)
            : await runFixedFullVerification(git, record, workspaceRoot, context);
          if (!validDeliveryVerification(verification, localHead, localFingerprint)) fail('full_local_verification_required');
          const observed = await options.observePullRequest(Object.freeze({ repositoryId: record.key.repositoryId,
            issueNumber: record.key.issueNumber, taskId: record.taskId, branch: `codex/issue-${record.key.issueNumber}-g${record.key.generation}`,
            baseRef: 'main', headSha: localHead }));
          const prSnapshot = normalizeFreshPr(observed, delivered.pullRequest, record);
          freshPrSnapshot = prSnapshot;
          await session.advance('monitor', { pr: { repositoryId: prSnapshot.repositoryId, number: prSnapshot.number,
            baseSha: prSnapshot.baseSha, headSha: prSnapshot.headSha, mergeSha: prSnapshot.mergeSha } });
          mayRelease = true;
          record = await session.current();
        }

        if (record.state === 'monitoring' && options.observeCi) {
          const monitorRoot = testAdapters ? options.repoRoot : path.join(options.runnerRoot, record.taskId);
          if (!testAdapters) await session.bindWorkspace(monitorRoot);
          const monitorContext = await loadContext(record, monitorRoot);
          const verifierEvidence = testAdapters?.verifyMonitoring
            ? await testAdapters.verifyMonitoring(record, monitorRoot, monitorContext)
            : await runFixedFullVerification(git, record, monitorRoot, monitorContext);
          await reconcileTaskCi({ taskId: record.taskId, store, leaseOwner: packet.leaseOwner,
            observe: options.observeCi, context: monitorContext, verifierEvidence, now,
            // Repair/rerun action executors remain disabled until a concrete host capability exists.
          });
        }
        mayRelease = true;
      } catch {
        // Keep durable nonterminal state available for dispatcher reconciliation.
        try {
          const current = await loadRecord(packet.taskId);
          mayRelease = !lock.unknown && (TERMINAL.has(current.state) || ['queued', 'delivering', 'monitoring', 'waiting-approval', 'retry-wait'].includes(current.state));
        } catch { mayRelease = false; }
      } finally {
        if (mayRelease && !lock.unknown) {
          try {
            const current = await loadRecord(packet.taskId);
            if (!TERMINAL.has(current.state) && !YIELD_STATES.has(current.state)) fail('task_state_not_yielded');
            const held = await store.assertTaskLease(packet.taskId, packet.leaseOwner, now(), current.version);
            if (held === true) await store.releaseTaskLease(packet.taskId, packet.leaseOwner);
            lock.status = 'stopped';
            lock.stopped = true;
          } catch { lock.status = 'unknown'; lock.unknown = true; }
        } else {
          lock.status = 'unknown';
          lock.unknown = true;
        }
        if (!lock.unknown) ACTIVE.delete(key);
      }
    })();
    return lock.promise;
  }

  async function handlePost(request) {
    const body = await readBoundedJson(request);
    const packet = validatePacket(body, options.repositoryId);
    const record = await loadRecord(packet.taskId);
    if (record.key.issueNumber !== packet.issueNumber
        || record.key.generation !== packet.generation || record.sourceRevision.toLowerCase() !== packet.sourceRevision.toLowerCase()
        || record.policyRevision.toLowerCase() !== packet.policyRevision.toLowerCase()) fail('task_identity_mismatch');
    const lease = await store.loadTaskLease(packet.taskId);
    if (!lease || lease.owner !== packet.leaseOwner || lease.taskVersion !== record.version || lease.leaseUntil <= now()) fail('task_lease_or_version_stale');

    const existing = local.get(packet.taskId);
    if (existing) {
      if (existing.owner !== packet.leaseOwner || existing.expectedVersion !== packet.expectedVersion) fail('task_already_running');
      return response(202, { status: 'accepted', taskId: packet.taskId, expectedVersion: packet.expectedVersion });
    }
    const globallyExisting = ACTIVE.get(packet.taskId);
    if (globallyExisting) {
      if (globallyExisting.owner !== packet.leaseOwner || globallyExisting.expectedVersion !== packet.expectedVersion) fail('task_already_running');
      return response(202, { status: 'accepted', taskId: packet.taskId, expectedVersion: packet.expectedVersion });
    }
    if (record.version !== packet.expectedVersion || lease.leaseUntil !== packet.leaseUntil) fail('task_identity_or_version_stale');
    if (Date.parse(record.deadline) <= now()) fail('task_deadline_exhausted');
    if (!['queued', 'delivering', 'monitoring'].includes(record.state)) fail('task_state_not_resumable');
    if (ACTIVE.size >= LOCAL_CONCURRENCY) fail('task_concurrency_limit');
    let issue = null;
    try {
      const context = await canonicalPolicy(record);
      if (context.policy.enabled !== true) fail('task_policy_disabled');
      if (['queued', 'delivering'].includes(record.state)) {
        issue = assertIssuePolicy(validateIssue(await options.observeIssue(Object.freeze({ repositoryId: record.key.repositoryId,
          issueNumber: record.key.issueNumber, expectedDigest: record.requestDigest })), record), context);
      }
      if (await store.assertTaskLease(packet.taskId, packet.leaseOwner, now(), packet.expectedVersion) !== true) fail('task_lease_lost');
      if (ACTIVE.size >= LOCAL_CONCURRENCY && !ACTIVE.has(packet.taskId)) fail('task_concurrency_limit');
    } catch (error) {
      // Preflight has not started a local executor. The dispatch packet's lease
      // was issued only after the trusted dispatcher reconciled any old runner.
      try {
        if (!ACTIVE.has(packet.taskId) && await store.assertTaskLease(packet.taskId, packet.leaseOwner, now(), record.version)) {
          await store.releaseTaskLease(packet.taskId, packet.leaseOwner);
        }
      } catch { /* lease expiry and trusted dispatcher reconciliation remain the fallback */ }
      throw error;
    }
    void runTask(packet, issue);
    return response(202, { status: 'accepted', taskId: packet.taskId, expectedVersion: packet.expectedVersion });
  }

  async function handleGet(taskId) {
    if (!TASK_ID.test(taskId)) return response(404, { error: 'not_found' });
    const record = await loadRecord(taskId);
    const lease = await store.loadTaskLease(taskId);
    const localState = local.get(taskId);
    let result;
    if (localState?.stopped === true && !lease) {
      result = { status: 'stopped', taskId, leaseOwner: localState.owner, expectedVersion: record.version };
    } else if (lease && lease.taskVersion === record.version && localState?.status === 'running'
        && localState.owner === lease.owner && lease.leaseUntil > now()) {
      result = { status: 'running', taskId, leaseOwner: lease.owner, expectedVersion: record.version };
    } else {
      if (!lease && !localState) return response(503, { error: 'runner_state_unavailable' });
      const observed = await options.inspectRunner(Object.freeze({ taskId, leaseOwner: lease?.owner ?? localState?.owner ?? null,
        expectedVersion: lease?.taskVersion ?? record.version }));
      if (!strictObject(observed, ['expectedVersion', 'leaseOwner', 'status', 'taskId'])
          || !['running', 'stopped'].includes(observed.status) || observed.taskId !== taskId
          || observed.leaseOwner !== (lease?.owner ?? localState?.owner ?? observed.leaseOwner)
          || observed.expectedVersion !== (lease?.taskVersion ?? record.version)
          || (lease && lease.taskVersion !== record.version)) return response(503, { error: 'runner_state_unavailable' });
      result = observed;
    }
    return response(200, result);
  }

  async function fetch(request) {
    if (!(request instanceof Request)) return response(400, { error: 'invalid_request' });
    try {
      const principal = await options.authenticate(request);
      if (!plain(principal) || principal.authenticated !== true) return response(401, { error: 'unauthorized' });
      const url = new URL(request.url);
      if (url.pathname === '/v1/tasks' && request.method === 'POST') return await handlePost(request);
      const match = /^\/v1\/tasks\/([^/]+)$/.exec(url.pathname);
      if (match && request.method === 'GET') return await handleGet(decodeURIComponent(match[1]));
      return response(404, { error: 'not_found' });
    } catch (error) {
      const code = safeReason(error);
      const status = ['task_policy_disabled', 'policy_revision_mismatch'].includes(code) ? 403
        : ['task_already_running', 'task_concurrency_limit', 'task_lease_or_version_stale', 'task_identity_or_version_stale', 'task_lease_lost'].includes(code) ? 409
          : code === 'task_packet_invalid' ? 400 : code === 'task_not_found' ? 404 : 503;
      return response(status, { error: code });
    }
  }

  return Object.freeze({ fetch, async waitForIdle(taskId) { await local.get(taskId)?.promise; },
    inspectLocal(taskId) { const value = local.get(taskId); return value && Object.freeze({ status: value.status, owner: value.owner, expectedVersion: value.expectedVersion }); } });
}

function normalizeFreshPr(observation, deliveredPr, record) {
  if (!plain(observation) || Object.keys(observation).sort().join('|') !== ['baseSha', 'headSha', 'mergeSha', 'number', 'repositoryId', 'state'].sort().join('|')
      || observation.repositoryId !== record.key.repositoryId || observation.number !== deliveredPr.number
      || observation.state !== 'open' || observation.mergeSha !== null
      || !REVISION.test(observation.baseSha) || !REVISION.test(observation.headSha)
      || observation.baseSha.toLowerCase() !== deliveredPr.baseSha.toLowerCase()
      || observation.headSha.toLowerCase() !== deliveredPr.headSha.toLowerCase()) fail('fresh_pr_observation_invalid');
  return Object.freeze({ ...observation, baseSha: observation.baseSha.toLowerCase(), headSha: observation.headSha.toLowerCase() });
}

function validDeliveryVerification(value, headSha, fingerprint) {
  return plain(value) && value.mode === 'full' && value.passed === true && value.revisionStable === true
    && value.workspaceStable === true && value.verifiedRevision?.toLowerCase() === headSha.toLowerCase()
    && value.currentRevision?.toLowerCase() === headSha.toLowerCase()
    && /^[a-f0-9]{64}$/i.test(value.verifiedWorkspaceFingerprint ?? '')
    && value.verifiedWorkspaceFingerprint === value.currentWorkspaceFingerprint
    && (fingerprint === undefined || value.currentWorkspaceFingerprint === fingerprint)
    && Array.isArray(value.commands) && value.commands.length > 0
    && value.commands.every((command) => command.exitCode === 0 && command.signal === null && command.spawnErrorCode === null)
    && Array.isArray(value.requiredExternalChecks)
    && (value.complete === true || value.requiredExternalChecks.length > 0);
}

async function runFixedFullVerification(git, record, repoRoot, context) {
  const head = await readGitHeadRevision(repoRoot);
  const changedPaths = await git.committedPaths(repoRoot, record.sourceRevision);
  const plan = buildVerificationPlan({ changedPaths, mode: 'full', policy: context.loopPolicy });
  const result = await runVerificationPlan(plan, { repoRoot });
  return result && result.currentRevision?.toLowerCase() === head.toLowerCase()
    ? result : Object.freeze({ ...result, complete: false, passed: false, currentRevision: head });
}

/** Production gateway: real task pipeline, fixed verifier, IssueDeliveryHost, and read-only CI reconciliation. */
export function createIssueTaskRuntime(options) { return createRuntime(options); }

/** Explicit fixture-only seam; never used by the production runtime factory. */
export function createIssueTaskRuntimeForTests(options, adapters) {
  if (!plain(adapters) || typeof adapters.pipeline !== 'function' || typeof adapters.delivery !== 'function') fail('runtime_test_adapter_invalid');
  return createRuntime(options, adapters);
}
