import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { loadAutonomyPolicy, loadLoopPolicy } from '../policy.mjs';
import { readGitHeadRevision, readGitWorkspaceFingerprint, buildVerificationPlan, runVerificationPlan } from '../verify.mjs';
import { normalizeRepoPath } from '../classify-risk.mjs';
import { validateTaskRecord } from './contracts.mjs';
import { reserveTaskBudget } from './lifecycle.mjs';
import { loadLoopState, saveLoopState } from '../state.mjs';
import { deriveIssueDeliveryPlan } from './delivery-branch.mjs';

const execFileAsync = promisify(execFile);
const API_ORIGIN = 'https://api.github.com';
const API_VERSION = '2026-03-10';
const SHA = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i;
const MAX_RESPONSE_BYTES = 256 * 1024;
const MAX_CHANGED_PATHS = 100;
const MAX_PATH_BYTES = 1024;
const TITLE_LIMIT = 256;
const BODY_LIMIT = 64 * 1024;

export class IssueDeliveryError extends Error {
  constructor(code, { status, cause } = {}) {
    super(code, cause ? { cause } : undefined);
    this.name = new.target.name;
    this.code = code;
    if (Number.isSafeInteger(status)) this.status = status;
  }
}

function fail(code, details) { throw new IssueDeliveryError(code, details); }
function isRecord(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }

function repositoryIdentity(value, repositoryId) {
  if (!isRecord(value) || Object.keys(value).sort().join('|') !== ['id', 'name', 'owner'].sort().join('|')
      || value.id !== repositoryId || typeof value.owner !== 'string' || !/^[A-Za-z0-9-]{1,39}$/.test(value.owner)
      || typeof value.name !== 'string' || !/^[A-Za-z0-9_.-]{1,100}$/.test(value.name)) fail('repository_identity_invalid');
  return Object.freeze({ ...value, fullName: `${value.owner}/${value.name}` });
}

function safePathList(paths) {
  if (!Array.isArray(paths) || paths.length < 1 || paths.length > MAX_CHANGED_PATHS) fail('changed_paths_invalid');
  try {
    const normalized = paths.map(normalizeRepoPath);
    if (normalized.some((value, index) => value !== paths[index] || Buffer.byteLength(value, 'utf8') > MAX_PATH_BYTES)
        || new Set(normalized).size !== normalized.length) fail('changed_paths_invalid');
    return [...normalized].sort();
  } catch (error) {
    if (error instanceof IssueDeliveryError) throw error;
    fail('changed_paths_invalid');
  }
}

function gitEnvironment(token) {
  const env = {
    PATH: process.env.PATH ?? '',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null',
    GIT_TERMINAL_PROMPT: '0',
    GCM_INTERACTIVE: 'Never',
  };
  for (const key of ['SystemRoot', 'WINDIR']) if (process.env[key]) env[key] = process.env[key];
  if (token) {
    env.GIT_CONFIG_COUNT = '2';
    env.GIT_CONFIG_KEY_0 = 'credential.helper';
    env.GIT_CONFIG_VALUE_0 = '';
    env.GIT_CONFIG_KEY_1 = 'http.https://github.com/.extraheader';
    env.GIT_CONFIG_VALUE_1 = `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`;
  }
  return env;
}

async function assertPolicyRootClean(root) {
  let status;
  try {
    const { stdout } = await execFileAsync('git', ['-C', root, '-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false',
      'status', '--porcelain=v1', '-z', '--untracked-files=all', '--', '.agent/policy'], {
      encoding: null, env: gitEnvironment(), windowsHide: true, timeout: 15_000, maxBuffer: 2 * 1024 * 1024,
    });
    status = stdout;
  } catch (error) {
    throw new IssueDeliveryError('canonical_policy_root_unavailable', { cause: error });
  }
  if (!Buffer.isBuffer(status) || status.length !== 0) fail('canonical_policy_root_dirty');
}

function createGitAdapter({ execFileImpl = execFileAsync } = {}) {
  async function run(root, args, { encoding = 'utf8', token, timeout = 15_000 } = {}) {
    try {
      const { stdout } = await execFileImpl('git', ['-C', root, ...args], {
        encoding,
        env: gitEnvironment(token),
        windowsHide: true,
        timeout,
        maxBuffer: 2 * 1024 * 1024,
      });
      return stdout;
    } catch (error) {
      throw new IssueDeliveryError('git_operation_failed', { cause: error });
    }
  }

  return Object.freeze({
    async changedPaths(root) {
      const bytes = await run(root, ['-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false', 'status', '--porcelain=v1', '-z', '--untracked-files=all', '--no-renames'], { encoding: null });
      if (!Buffer.isBuffer(bytes)) fail('git_inspection_failed');
      const paths = [];
      let offset = 0;
      while (offset < bytes.length) {
        const end = bytes.indexOf(0, offset);
        if (end < 0 || end - offset < 4 || bytes[offset + 2] !== 0x20) fail('git_inspection_failed');
        const raw = bytes.subarray(offset + 3, end);
        const decoded = raw.toString('utf8');
        if (!Buffer.from(decoded, 'utf8').equals(raw)) fail('git_inspection_failed');
        paths.push(normalizeRepoPath(decoded));
        offset = end + 1;
      }
      if (paths.length === 0) return [];
      return safePathList(paths);
    },
    async committedPaths(root, baseSha) {
      const output = await run(root, ['diff', '--name-only', '-z', '--no-renames', `${baseSha}..HEAD`], { encoding: 'utf8' });
      const values = String(output).split('\0').filter(Boolean).map(normalizeRepoPath);
      return [...new Set(values)].sort();
    },
    commitCount(root, baseSha) { return run(root, ['rev-list', '--count', `${baseSha}..HEAD`]).then((value) => Number(String(value).trim())); },
    currentBranch(root) { return run(root, ['symbolic-ref', '--quiet', '--short', 'HEAD']).then((value) => String(value).trim()); },
    remoteUrl(root) { return run(root, ['remote', 'get-url', 'origin']).then((value) => String(value).trim()); },
    async createBranch(root, branch) {
      await run(root, ['switch', '--create', branch]);
    },
    async commit(root, paths, message, maxChangedLines) {
      await run(root, ['add', '--', ...paths]);
      const staged = String(await run(root, ['diff', '--cached', '--name-only', '-z', '--no-renames'])).split('\0').filter(Boolean).map(normalizeRepoPath).sort();
      if (staged.length !== paths.length || staged.some((value, index) => value !== paths[index])) {
        await run(root, ['reset', '--quiet', 'HEAD', '--', ...paths]).catch(() => {});
        fail('staged_paths_mismatch');
      }
      const numstat = String(await run(root, ['diff', '--cached', '--numstat', '-z', '--no-renames', 'HEAD', '--', ...paths]));
      let changedLines = 0;
      for (const row of numstat.split('\0').filter(Boolean)) {
        const match = /^(\d+)\t(\d+)\t/.exec(row);
        if (!match) {
          await run(root, ['reset', '--quiet', 'HEAD', '--', ...paths]).catch(() => {});
          fail('changed_line_budget_unknown');
        }
        changedLines += Number(match[1]) + Number(match[2]);
      }
      if (!Number.isSafeInteger(maxChangedLines) || maxChangedLines < 1 || changedLines > maxChangedLines) {
        await run(root, ['reset', '--quiet', 'HEAD', '--', ...paths]).catch(() => {});
        fail('changed_line_budget_exhausted');
      }
      await run(root, ['commit', '--no-gpg-sign', '-m', message]);
      return readGitHeadRevision(root);
    },
    async push(root, repository, branch, token) {
      try {
        await run(root, ['push', '--porcelain', `https://github.com/${repository.owner}/${repository.name}.git`, `HEAD:refs/heads/${branch}`], { token, timeout: 120_000 });
        return { accepted: true };
      } catch (error) {
        return { accepted: false, uncertain: true, errorCode: error.code ?? 'git_operation_failed' };
      }
    },
    run,
  });
}

function apiPath(repository, suffix) {
  return `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}${suffix}`;
}

function safeToken(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 8192 || /[\r\n\0]/.test(value)) fail('installation_token_invalid');
  return value;
}

async function readResponseJson(response) {
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > MAX_RESPONSE_BYTES) fail('github_response_too_large');
  let bytes;
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_RESPONSE_BYTES) {
          await reader.cancel().catch(() => {});
          fail('github_response_too_large');
        }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    bytes = Buffer.concat(chunks, total);
  } else {
    bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength > MAX_RESPONSE_BYTES) fail('github_response_too_large');
  }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { fail('github_response_invalid'); }
}

function createGitHubApi({ fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') fail('github_transport_invalid');
  return Object.freeze({
    async request({ method, path: route, token, body }) {
      if (!['GET', 'POST', 'PATCH'].includes(method) || typeof route !== 'string' || !route.startsWith('/repos/')) fail('github_route_rejected');
      let response;
      try {
        response = await fetchImpl(API_ORIGIN + route, {
          method,
          redirect: 'manual',
          signal: AbortSignal.timeout(15_000),
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${safeToken(token)}`,
            'X-GitHub-Api-Version': API_VERSION,
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
      } catch (error) {
        throw new IssueDeliveryError('github_response_uncertain', { cause: error });
      }
      if (response.status >= 300 && response.status < 400) fail('github_redirect_rejected', { status: response.status });
      if (response.status === 404) throw new IssueDeliveryError('github_request_failed', { status: response.status });
      if (response.status >= 500) throw new IssueDeliveryError('github_response_uncertain', { status: response.status });
      if (!response.ok) throw new IssueDeliveryError('github_request_failed', { status: response.status });
      const payload = await readResponseJson(response);
      return payload;
    },
  });
}

function validateRef(payload, branch) {
  if (!isRecord(payload) || payload.ref !== `refs/heads/${branch}` || !isRecord(payload.object)
      || typeof payload.object.sha !== 'string' || !SHA.test(payload.object.sha)) fail('github_ref_invalid');
  return payload.object.sha.toLowerCase();
}

function validatePullRequest(payload, repository, plan) {
  if (!isRecord(payload) || !Number.isSafeInteger(payload.number) || payload.number < 1
      || !['open', 'closed'].includes(payload.state) || !isRecord(payload.base) || !isRecord(payload.head)
      || payload.base.ref !== 'main' || payload.head.ref !== plan.branch
      || typeof payload.base.sha !== 'string' || !SHA.test(payload.base.sha)
      || typeof payload.head.sha !== 'string' || !SHA.test(payload.head.sha)
      || typeof payload.html_url !== 'string' || !/^https:\/\/github\.com\//.test(payload.html_url)
      || payload.html_url !== `https://github.com/${repository.fullName}/pull/${payload.number}`
      || typeof payload.title !== 'string' || payload.title.length > TITLE_LIMIT
      || typeof payload.body !== 'string' || payload.body.length > BODY_LIMIT
      || typeof payload.draft !== 'boolean') fail('github_pull_request_invalid');
  return Object.freeze({
    repositoryId: repository.id,
    number: payload.number,
    state: payload.state,
    url: payload.html_url,
    baseSha: payload.base.sha.toLowerCase(),
    headSha: payload.head.sha.toLowerCase(),
    draft: payload.draft,
    title: payload.title,
    body: payload.body,
  });
}

function prTitle(plan) {
  const title = `Automated work for issue #${plan.issueNumber}`;
  if (title.length > TITLE_LIMIT) fail('pull_request_content_invalid');
  return title;
}

function prBody(plan, verification) {
  const changedFiles = plan.paths.map((value) => `- ${value}`).join('\n');
  const checkIds = verification.commands.map(({ id }) => id).join(', ');
  const pendingExternal = verification.requiredExternalChecks.map((id) => `- ${id}`).join('\n');
  const body = [
    `Closes #${plan.issueNumber}`,
    `Task: ${plan.taskId}`,
    'Summary: Implements the approved Issue changes within the eligible repository paths.',
    `Changed files:\n${changedFiles}`,
    `Local fixed verification passed at ${verification.verifiedRevision}: ${checkIds}`,
    ...(pendingExternal ? [`Required hosted checks pending:\n${pendingExternal}`] : []),
    `Base revision: ${plan.baseSha}`,
  ].join('\n\n');
  if (body.length > BODY_LIMIT) fail('pull_request_content_invalid');
  return body;
}

function sameSha(left, right) { return typeof left === 'string' && typeof right === 'string' && left.toLowerCase() === right.toLowerCase(); }

function validateVerification(result, headSha, fingerprint, plan) {
  const commandResults = result?.commands;
  const commandsPassed = Array.isArray(commandResults)
    && commandResults.length === plan.commands.length
    && commandResults.every((command, index) => isRecord(command)
      && command.id === plan.commands[index].id
      && command.exitCode === 0
      && command.signal === null
      && command.spawnErrorCode === null);
  const externalChecksMatch = Array.isArray(result?.requiredExternalChecks)
    && equalStringLists(result.requiredExternalChecks, plan.requiredExternalChecks);
  if (!isRecord(result) || result.passed !== true || !commandsPassed || !externalChecksMatch
      || result.complete !== (plan.requiredExternalChecks.length === 0)
      || result.revisionStable !== true || result.workspaceStable !== true
      || !sameSha(result.verifiedRevision, headSha) || !sameSha(result.currentRevision, headSha)
      || result.verifiedWorkspaceFingerprint !== fingerprint || result.currentWorkspaceFingerprint !== fingerprint) {
    fail('fixed_verifier_evidence_invalid');
  }
}

function verifyTaskPullRequest(pr, plan) {
  if (!pr.body.includes(`Closes #${plan.issueNumber}`)
      || !pr.body.includes(`Task: ${plan.taskId}`)) fail('pull_request_task_identity_mismatch');
  return pr;
}

function verificationSummary(result) {
  return Object.freeze({
    mode: result.mode,
    passed: result.passed,
    complete: result.complete,
    revisionStable: result.revisionStable,
    workspaceStable: result.workspaceStable,
    verifiedRevision: result.verifiedRevision,
    currentRevision: result.currentRevision,
    verifiedWorkspaceFingerprint: result.verifiedWorkspaceFingerprint,
    currentWorkspaceFingerprint: result.currentWorkspaceFingerprint,
    commands: Object.freeze(result.commands.map(({ id, exitCode, signal, spawnErrorCode }) => Object.freeze({ id, exitCode, signal, spawnErrorCode }))),
    requiredExternalChecks: Object.freeze([...result.requiredExternalChecks]),
  });
}

async function remoteUrlMatches(git, repoRoot, repository) {
  const value = await git.remoteUrl(repoRoot);
  let remote;
  try {
    const normalized = value.replace(/^git@github\.com:/i, 'https://github.com/');
    remote = new URL(normalized.replace(/\.git$/i, ''));
  } catch { fail('git_remote_invalid'); }
  if (remote.protocol !== 'https:' || remote.hostname.toLowerCase() !== 'github.com'
      || remote.username !== '' || remote.password !== '' || remote.search !== '' || remote.hash !== ''
      || remote.pathname.replace(/^\//, '') !== repository.fullName) fail('git_remote_mismatch');
}

function validateApprovalProvider(provider) {
  if (!provider || typeof provider.getInstallationToken !== 'function'
      || typeof provider.requestApproval !== 'function' || typeof provider.consumeApproval !== 'function') fail('approval_provider_unavailable');
}

function validateTaskStore(store) {
  if (!store || typeof store.loadTaskRecord !== 'function'
      || typeof store.assertTaskLease !== 'function'
      || typeof store.compareAndSaveTaskRecordUnderLease !== 'function') fail('task_store_unavailable');
}

function equalStringLists(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/**
 * Host-side Issue delivery. Git paths, revisions and verification evidence are
 * always re-read from the checkout; only the durable TaskRecord and policy
 * loaders are supplied by the trusted orchestrator.
 */
export function createIssueDeliveryHost(options) {
  if (!isRecord(options) || typeof options.repoRoot !== 'string' || options.repoRoot.length === 0) fail('delivery_configuration_invalid');
  let task = validateTaskRecord(options.taskRecord);
  if (!['delivering', 'monitoring'].includes(task.state)) fail('task_not_delivering');
  const repository = repositoryIdentity(options.repository, task.key.repositoryId);
  validateApprovalProvider(options.authProvider);
  const git = options.gitAdapter ?? createGitAdapter();
  const github = options.githubApi ?? createGitHubApi({ fetchImpl: options.fetchImpl });
  const policyLoader = options.loadPolicy ?? loadAutonomyPolicy;
  const loopPolicyLoader = options.loadLoopPolicy ?? loadLoopPolicy;
  const canonicalPolicySource = options.loadPolicy === undefined && options.loadLoopPolicy === undefined;
  const verificationRunner = options.runVerifier ?? runVerificationPlan;
  validateTaskStore(options.taskStore);
  if (typeof options.leaseOwner !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(options.leaseOwner)) fail('task_lease_unavailable');
  const taskStore = options.taskStore;
  const now = options.now ?? Date.now;
  const assertIssueCurrent = options.assertIssueCurrent;
  if (assertIssueCurrent !== undefined && typeof assertIssueCurrent !== 'function') fail('delivery_configuration_invalid');
  if (typeof now !== 'function') fail('delivery_configuration_invalid');

  function timestamp() {
    const value = now();
    if (!Number.isSafeInteger(value) || value < 1) fail('task_session_clock_invalid');
    return value;
  }

  async function assertTaskFresh(expected = task) {
    let current;
    try { current = validateTaskRecord(await taskStore.loadTaskRecord(expected.taskId)); }
    catch (error) { fail('task_session_stale', { cause: error }); }
    if (current.taskId !== expected.taskId || JSON.stringify(current) !== JSON.stringify(expected)
        || current.state !== 'delivering') fail('task_session_stale');
    let held;
    try { held = await taskStore.assertTaskLease(current.taskId, options.leaseOwner, timestamp(), current.version); }
    catch (error) { fail('task_lease_lost', { cause: error }); }
    if (held !== true) fail('task_lease_lost');
    return current;
  }

  async function request(method, route, token, body) {
    if (method !== 'GET') await assertTaskFresh();
    let result;
    try { result = await github.request({ method, path: route, token, ...(body === undefined ? {} : { body }) }); }
    catch (error) { await assertTaskFresh(); throw error; }
    await assertTaskFresh();
    return result;
  }

  async function getBase(token) {
    const encodedRef = 'heads/' + 'main';
    const payload = await request('GET', apiPath(repository, `/git/ref/${encodedRef}`), token);
    return validateRef(payload, 'main');
  }

  async function getBranch(token, plan) {
    const payload = await request('GET', apiPath(repository, `/git/ref/heads/${plan.branch}`), token);
    return validateRef(payload, plan.branch);
  }

  async function findPullRequest(token, plan) {
    const query = new URLSearchParams({ state: 'open', head: `${repository.owner}:${plan.branch}`, base: 'main', per_page: '100' });
    const payload = await request('GET', apiPath(repository, `/pulls?${query}`), token);
    if (!Array.isArray(payload) || payload.length > 100) fail('github_pull_request_list_invalid');
    const matches = payload.map((item) => validatePullRequest(item, repository, plan))
      .filter((item) => item.state === 'open');
    if (matches.length > 1) fail('duplicate_pull_requests');
    return matches[0] ?? null;
  }

  function verifyPullRequest(pr, expectedHead, expectedBase) {
    if (!pr || pr.state !== 'open' || !sameSha(pr.headSha, expectedHead) || !sameSha(pr.baseSha, expectedBase)) fail('stale_pull_request');
    return pr;
  }

  async function deliver() {
    if (task.state !== 'delivering') fail('task_not_delivering');
    await assertTaskFresh();
    const baseHead = await readGitHeadRevision(options.repoRoot);
    const taskBaseSha = task.sourceRevision.toLowerCase();
    const fingerprint = await readGitWorkspaceFingerprint(options.repoRoot);
    const workingPaths = await git.changedPaths(options.repoRoot);
    const localBranch = await git.currentBranch(options.repoRoot).catch(() => null);
    const localHead = await readGitHeadRevision(options.repoRoot);
    const alreadyCommitted = !sameSha(localHead, taskBaseSha);
    if (alreadyCommitted && (localBranch !== `codex/issue-${task.key.issueNumber}-g${task.key.generation}`
        || await git.commitCount(options.repoRoot, taskBaseSha) !== 1 || workingPaths.length > 0)) fail('stale_local_branch');
    if (!alreadyCommitted && !sameSha(baseHead, taskBaseSha)) fail('stale_local_base');
    const changedPaths = safePathList(alreadyCommitted ? await git.committedPaths(options.repoRoot, taskBaseSha) : workingPaths);
    const trustedPolicyRoot = options.trustedPolicyRoot;
    if (typeof trustedPolicyRoot !== 'string' || trustedPolicyRoot.length === 0) fail('canonical_policy_root_unavailable');
    if (!sameSha(await readGitHeadRevision(trustedPolicyRoot), task.policyRevision)) fail('canonical_policy_root_stale');
      if (canonicalPolicySource) await assertPolicyRootClean(trustedPolicyRoot);
    const [policy, loopPolicy] = await Promise.all([
      policyLoader(trustedPolicyRoot, task.policyRevision.toLowerCase()),
      loopPolicyLoader(trustedPolicyRoot),
    ]);
    if (!sameSha(await readGitHeadRevision(trustedPolicyRoot), task.policyRevision)) fail('canonical_policy_root_stale');
      if (canonicalPolicySource) await assertPolicyRootClean(trustedPolicyRoot);
    await assertTaskFresh();
    const plan = deriveIssueDeliveryPlan({ task, policy, loopPolicy, baseSha: taskBaseSha, changedPaths });
    const riskResult = plan.risk;
    if (riskResult === 'high' || riskResult === 'critical') fail('risk_not_eligible');
    await remoteUrlMatches(git, options.repoRoot, repository);

    const observeToken = safeToken(await options.authProvider.getInstallationToken('observe'));
    await assertTaskFresh();
    const baseSha = await getBase(observeToken);
    if (!sameSha(baseSha, plan.baseSha)) fail('stale_remote_base');
    const existingBranchSha = await getBranch(observeToken, plan).catch((error) => {
      if (error instanceof IssueDeliveryError && error.status === 404) return null;
      throw error;
    });
    const existingPr = await findPullRequest(observeToken, plan);

    // A lost prior response is reconciled only when the deterministic branch and
    // open PR both identify the exact local revision and base tuple.
    if (existingBranchSha && sameSha(existingBranchSha, localHead) && existingPr) {
      const observed = verifyTaskPullRequest(verifyPullRequest(existingPr, localHead, baseSha), plan);
      return Object.freeze({ status: 'already-delivered', taskId: task.taskId, branch: plan.branch, baseSha, headSha: localHead, workspaceFingerprint: fingerprint, changedPaths: plan.paths, risk: plan.risk, pullRequest: publicPullRequest(observed) });
    }
    if (existingBranchSha && !sameSha(existingBranchSha, baseHead) && !sameSha(existingBranchSha, localHead)) fail('stale_remote_branch');
    if (existingPr && (!existingBranchSha || !sameSha(existingPr.headSha, existingBranchSha))) fail('stale_pull_request');

    const lifecyclePolicy = Object.freeze({ schemaVersion: 1, stopConditions: loopPolicy.stopConditions });
    const context = { policy, loopPolicy: lifecyclePolicy, loopState: await loadLoopState(options.repoRoot, task.links.loopStateTaskId) };
    const riskOrder = { low: 0, medium: 1, high: 2, critical: 3 };
    if (!Object.hasOwn(riskOrder, context.loopState.risk)
        || riskOrder[context.loopState.risk] < riskOrder[plan.risk]) fail('loop_state_risk_understated');
    if (context.loopState.risk === 'high' || context.loopState.risk === 'critical'
        || !policy.eligibleRisks.includes(context.loopState.risk)) fail('risk_not_eligible');
    if (context.loopState.taskId !== task.taskId || !sameSha(context.loopState.baseSha, taskBaseSha)
        || !sameSha(context.loopState.headSha, localHead) || context.loopState.branch !== plan.branch) fail('loop_state_snapshot_mismatch');
    await assertTaskFresh(task);
    const nextReservation = reserveTaskBudget(task, { kind: 'delivery', expectedVersion: task.version }, context);
    const saved = await taskStore.compareAndSaveTaskRecordUnderLease(nextReservation, task.version, options.leaseOwner, timestamp());
    if (saved !== 'saved') fail('delivery_reservation_conflict');
    const savedTask = validateTaskRecord(await taskStore.loadTaskRecord(task.taskId));
    if (savedTask.version !== nextReservation.version || savedTask.budgets.deliveries !== nextReservation.budgets.deliveries
        || savedTask.taskId !== task.taskId || savedTask.state !== 'delivering') fail('delivery_reservation_conflict');
    task = savedTask;
    await assertTaskFresh();

    const verifierPlan = buildVerificationPlan({ changedPaths: plan.paths, mode: 'full', policy: loopPolicy });
    const preCommitVerification = await verificationRunner(verifierPlan, { repoRoot: options.repoRoot });
    await assertTaskFresh();
    validateVerification(preCommitVerification, localHead, fingerprint, verifierPlan);
    const currentPaths = alreadyCommitted
      ? await git.committedPaths(options.repoRoot, taskBaseSha)
      : safePathList(await git.changedPaths(options.repoRoot));
    if (!equalStringLists(currentPaths, plan.paths)) fail('workspace_changed');

    const approvalScope = Object.freeze({
      repositoryId: task.key.repositoryId,
      issueNumber: task.key.issueNumber,
      generation: task.key.generation,
      taskId: task.taskId,
      branch: plan.branch,
      baseSha: plan.baseSha,
      headSha: localHead,
      workspaceFingerprint: fingerprint,
      paths: [...plan.paths],
      capability: 'issue:delivery',
    });
    const approval = await options.authProvider.requestApproval(approvalScope);
    await assertTaskFresh();
    const token = safeToken(await options.authProvider.getInstallationToken('issue:delivery'));
    await assertTaskFresh();
    const latestBase = await getBase(token);
    const latestHead = await readGitHeadRevision(options.repoRoot);
    const latestFingerprint = await readGitWorkspaceFingerprint(options.repoRoot);
    const latestWorkPaths = await git.changedPaths(options.repoRoot);
    const latestPaths = alreadyCommitted ? latestWorkPaths : safePathList(latestWorkPaths);
    const latestPathsForPlan = alreadyCommitted ? await git.committedPaths(options.repoRoot, taskBaseSha) : latestPaths;
    const latestLoopState = await loadLoopState(options.repoRoot, task.links.loopStateTaskId);
    if (!sameSha(latestBase, baseSha) || !sameSha(latestHead, localHead)
        || latestFingerprint !== fingerprint || !equalStringLists(latestPathsForPlan, plan.paths)
        || JSON.stringify(latestLoopState) !== JSON.stringify(context.loopState)) fail('stale_delivery_snapshot');
    const latestRemoteBranch = await getBranch(token, plan).catch((error) => {
      if (error instanceof IssueDeliveryError && error.status === 404) return null;
      throw error;
    });
    if ((latestRemoteBranch ?? null) !== (existingBranchSha ?? null)) fail('stale_remote_branch');
    const latestPr = await findPullRequest(token, plan);
    if ((latestPr?.number ?? null) !== (existingPr?.number ?? null)) fail('stale_pull_request');
    await assertTaskFresh();
    options.authProvider.consumeApproval(approval, approvalScope);

    if (existingBranchSha && !sameSha(existingBranchSha, taskBaseSha) && !sameSha(existingBranchSha, localHead)) fail('stale_remote_branch');
    if (!alreadyCommitted) {
      await assertIssueCurrent?.();
      await assertTaskFresh();
      if (localBranch !== plan.branch) await git.createBranch(options.repoRoot, plan.branch);
      await assertTaskFresh();
      await git.commit(options.repoRoot, plan.paths, `feat(loop): deliver issue #${task.key.issueNumber}`, loopPolicy.stopConditions.maxChangedLines);
      await assertTaskFresh();
    }
    const committedHead = await readGitHeadRevision(options.repoRoot);
    const afterCommitFingerprint = await readGitWorkspaceFingerprint(options.repoRoot);
    const remainingPaths = await git.changedPaths(options.repoRoot);
    if (remainingPaths.length > 0) fail('workspace_not_clean_after_commit');

    if (!alreadyCommitted) {
      await assertTaskFresh();
      const nextLoopState = {
        ...context.loopState,
        branch: plan.branch,
        headSha: committedHead,
        updatedAt: new Date().toISOString(),
      };
      await saveLoopState(options.repoRoot, nextLoopState);
      await assertTaskFresh();
    }

    const postCommitVerification = alreadyCommitted ? preCommitVerification : await verificationRunner(verifierPlan, { repoRoot: options.repoRoot });
    await assertTaskFresh();
    validateVerification(postCommitVerification, committedHead, afterCommitFingerprint, verifierPlan);

    const freshBase = await getBase(token);
    if (!sameSha(freshBase, baseSha)) fail('stale_remote_base');
    let remoteHead = null;
    try { remoteHead = await getBranch(token, plan); }
    catch (error) { if (!(error instanceof IssueDeliveryError && error.status === 404)) throw error; }
    if (remoteHead && !sameSha(remoteHead, committedHead)) fail('stale_remote_branch');
    if (!remoteHead) {
      await assertIssueCurrent?.();
      await assertTaskFresh();
      const push = await git.push(options.repoRoot, repository, plan.branch, token);
      await assertTaskFresh();
      if (!push.accepted) {
        try { remoteHead = await getBranch(token, plan); }
        catch (error) {
          if (error instanceof IssueDeliveryError && error.status === 404) fail('push_outcome_uncertain', { cause: error });
          throw error;
        }
        if (!sameSha(remoteHead, committedHead)) fail('stale_remote_branch');
      }
    }

    const confirmedBase = await getBase(token);
    if (!sameSha(confirmedBase, baseSha)) fail('stale_remote_base');
    const title = prTitle(plan);
    const body = prBody(plan, postCommitVerification);
    let pullRequest = await findPullRequest(token, plan);
    if (pullRequest) {
      verifyTaskPullRequest(pullRequest, plan);
      verifyPullRequest(pullRequest, committedHead, baseSha);
      if (pullRequest.title !== title || pullRequest.body !== body || pullRequest.draft !== true) {
        await assertIssueCurrent?.();
        await assertTaskFresh();
        const updated = await request('PATCH', apiPath(repository, `/pulls/${pullRequest.number}`), token, { title, body, draft: true });
        pullRequest = validatePullRequest(updated, repository, plan);
        verifyPullRequest(pullRequest, committedHead, baseSha);
      }
    } else {
      try {
        await assertIssueCurrent?.();
        await assertTaskFresh();
        const created = await request('POST', apiPath(repository, '/pulls'), token, {
          title,
          body,
          head: plan.branch,
          base: 'main',
          draft: true,
        });
        pullRequest = validatePullRequest(created, repository, plan);
      } catch (error) {
        if (!(error instanceof IssueDeliveryError)
            || !(error.code === 'github_response_uncertain' || error.code === 'github_response_invalid'
              || error.code === 'github_response_too_large' || error.code === 'github_pull_request_invalid'
              || (error.code === 'github_request_failed' && error.status === 422))) throw error;
        // POST may have succeeded even when the response was lost. Reconcile by
        // deterministic head/base before considering another write.
        pullRequest = await findPullRequest(token, plan);
        if (!pullRequest) fail('pull_request_outcome_uncertain', { cause: error });
      }
      verifyTaskPullRequest(pullRequest, plan);
      verifyPullRequest(pullRequest, committedHead, baseSha);
    }

    return Object.freeze({
      status: 'delivered',
      taskId: task.taskId,
      branch: plan.branch,
      baseSha,
      headSha: committedHead,
      workspaceFingerprint: afterCommitFingerprint,
      changedPaths: plan.paths,
      risk: plan.risk,
      verification: Object.freeze({ preCommit: verificationSummary(preCommitVerification), postCommit: verificationSummary(postCommitVerification) }),
      externalChecksPending: Object.freeze([...postCommitVerification.requiredExternalChecks]),
      pullRequest: publicPullRequest(pullRequest),
    });
  }

  return Object.freeze({ deliver });
}

function publicPullRequest(pr) {
  return Object.freeze({
    repositoryId: pr.repositoryId,
    number: pr.number,
    state: pr.state,
    url: pr.url,
    baseSha: pr.baseSha,
    headSha: pr.headSha,
    draft: pr.draft,
  });
}

export { createGitAdapter };
