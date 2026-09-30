import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readdir, realpath, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { classifyRisk, normalizeRepoPath } from './classify-risk.mjs';
import { assertCurrentPrTuple, assertRepairWorkspace } from './pr-worktree-guard.mjs';
import { validatePrBabysitterState } from './pr-state.mjs';
import { evaluateBudgets, recordTokenUsage, saveLoopState, validateLoopState } from './state.mjs';
import { buildVerificationPlan, readGitHeadRevision, readGitWorkspaceFingerprint, runVerificationPlan } from './verify.mjs';

const execFileAsync = promisify(execFile);
const HASH_PATTERN = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i;
const FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/i;
const CHECK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/;
const MAX_OPERATIONS = 100;
const MAX_OPERATION_BYTES = 256 * 1024;
const MAX_PROPOSAL_BYTES = 1024 * 1024;
const sessions = new WeakMap();

export class RepairSessionError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = new.target.name;
    this.code = code;
  }
}

function fail(code, message, cause) {
  throw new RepairSessionError(code, message, cause ? { cause } : undefined);
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, required, label) {
  if (!isPlainObject(value)) fail('invalid_input', `${label} must be an object`);
  const keys = Object.keys(value);
  if (keys.some((key) => !required.includes(key)) || required.some((key) => !Object.hasOwn(value, key))) {
    fail('invalid_input', `${label} contains missing or unsupported fields`);
  }
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function safeSha(value, label) {
  if (typeof value !== 'string' || !HASH_PATTERN.test(value)) fail('invalid_evidence', `${label} must be a full Git SHA`);
  return value.toLowerCase();
}

function normalizeFailures(failures) {
  if (!Array.isArray(failures) || failures.length < 1 || failures.length > 100) {
    fail('invalid_evidence', 'failures must contain 1 to 100 entries');
  }
  const normalized = failures.map((failure) => {
    exactKeys(failure, ['checkId', 'failureFingerprint'], 'failed check');
    if (typeof failure.checkId !== 'string' || !CHECK_ID_PATTERN.test(failure.checkId)) {
      fail('invalid_evidence', 'failed check IDs must be stable identifiers');
    }
    if (typeof failure.failureFingerprint !== 'string' || !FINGERPRINT_PATTERN.test(failure.failureFingerprint)) {
      fail('invalid_evidence', 'failure fingerprints must be SHA-256 digests');
    }
    return { checkId: failure.checkId, failureFingerprint: failure.failureFingerprint.toLowerCase() };
  });
  const ids = new Set(normalized.map(({ checkId }) => checkId));
  const fingerprints = new Set(normalized.map(({ failureFingerprint }) => failureFingerprint));
  if (ids.size !== normalized.length || fingerprints.size !== normalized.length) {
    fail('invalid_evidence', 'failed check IDs and fingerprints must be unique');
  }
  return normalized.sort((a, b) => a.checkId.localeCompare(b.checkId));
}

function minimumLimit(stateLimit, policyLimit) {
  if (stateLimit === null) return policyLimit;
  if (policyLimit === null) return stateLimit;
  return Math.min(stateLimit, policyLimit);
}

function currentBudgetView(state, policy) {
  const { budgets } = state;
  const iterationLimit = Math.min(state.maxIterations, policy.stopConditions.maxIterations);
  const tokenLimit = minimumLimit(budgets.tokenLimit, policy.stopConditions.tokenLimit);
  const wallClockLimitSeconds = minimumLimit(budgets.wallClockLimitSeconds, policy.stopConditions.maxWallClockSeconds);
  const ciRunLimit = minimumLimit(budgets.ciRunLimit, policy.stopConditions.ciRunLimit);
  const tokenRemaining = tokenLimit === null || budgets.tokenUsed === null
    ? null
    : Math.max(0, tokenLimit - budgets.tokenUsed);
  return {
    iteration: state.iteration,
    maxIterations: state.maxIterations,
    tokenLimit: budgets.tokenLimit,
    tokenUsed: budgets.tokenUsed,
    wallClockLimitSeconds: budgets.wallClockLimitSeconds,
    ciRunLimit: budgets.ciRunLimit,
    ciRuns: budgets.ciRuns,
    remaining: {
      iterations: Math.max(0, iterationLimit - state.iteration),
      tokens: tokenRemaining,
      wallClockSeconds: wallClockLimitSeconds === null
        ? null
        : Math.max(0, wallClockLimitSeconds - Math.floor((Date.now() - Date.parse(state.startedAt)) / 1000)),
      ciRuns: ciRunLimit === null ? null : Math.max(0, ciRunLimit - budgets.ciRuns),
    },
  };
}

function assertBudgetAvailable(state, policy) {
  const result = evaluateBudgets(state, policy);
  if (result.stop) fail('budget_exhausted', `repair is blocked by ${result.reason}`, result.reason);
}

export function beginRepairSession(input) {
  exactKeys(input, ['repoRoot', 'worktree', 'hostContext', 'policy', 'testedSha', 'failures'], 'repair session input');
  if (typeof input.repoRoot !== 'string' || input.repoRoot.length === 0) fail('invalid_input', 'repoRoot is required');
  try {
    validateLoopState(input.hostContext?.loopState);
    validatePrBabysitterState(input.hostContext?.prState);
  } catch (error) {
    fail('invalid_host_state', 'validated policy and LoopState are required', error);
  }
  const { worktree, hostContext, policy } = input;
  exactKeys(worktree, [
    'repository', 'repositoryId', 'prNumber', 'branch', 'baseSha', 'headSha', 'mergeSha',
    'taskId', 'taskWorktreeId', 'dirty', 'workspaceFingerprint',
  ], 'inspected worktree');
  if (typeof worktree.repository !== 'string'
      || !Number.isSafeInteger(worktree.repositoryId)
      || !Number.isSafeInteger(worktree.prNumber)
      || typeof worktree.branch !== 'string'
      || typeof worktree.dirty !== 'boolean'
      || typeof worktree.workspaceFingerprint !== 'string'
      || !FINGERPRINT_PATTERN.test(worktree.workspaceFingerprint)) {
    fail('invalid_worktree', 'an inspected PR worktree result is required');
  }
  safeSha(worktree.baseSha, 'worktree.baseSha');
  safeSha(worktree.headSha, 'worktree.headSha');
  if (worktree.mergeSha !== null) safeSha(worktree.mergeSha, 'worktree.mergeSha');
  const loopState = hostContext.loopState;
  if (worktree.taskId !== hostContext.taskId || worktree.taskWorktreeId !== hostContext.taskWorktreeId
      || loopState.taskId !== worktree.taskId || loopState.branch !== worktree.branch
      || loopState.baseSha !== worktree.baseSha || loopState.headSha !== worktree.headSha
      || hostContext.prState?.repository !== worktree.repository
      || hostContext.prState?.prNumber !== worktree.prNumber
      || hostContext.prState?.baseSha !== worktree.baseSha
      || hostContext.prState?.headSha !== worktree.headSha
      || hostContext.prState?.mergeSha !== worktree.mergeSha) {
    fail('stale_host_state', 'inspected worktree, PR state, and LoopState identities or SHA tuples do not match');
  }
  assertBudgetAvailable(loopState, policy);

  const testedSha = safeSha(input.testedSha, 'testedSha');
  const failures = normalizeFailures(input.failures);
  if (testedSha !== worktree.headSha && testedSha !== worktree.mergeSha) {
    fail('stale_test_evidence', 'testedSha must match the current PR head or merge SHA');
  }
  for (const failure of failures) {
    if ((loopState.failureCounts[failure.failureFingerprint] ?? 0) < 1) {
      fail('unrecorded_failure', 'every failed fingerprint must already be recorded in LoopState');
    }
  }

  if (!Array.isArray(hostContext.allowedPaths) || hostContext.allowedPaths.length < 1 || hostContext.allowedPaths.length > 100) {
    fail('invalid_path_scope', 'host allowedPaths must contain 1 to 100 paths');
  }
  const allowedPaths = [...hostContext.allowedPaths].map(normalizeRepoPath).sort();
  if (new Set(allowedPaths).size !== allowedPaths.length) fail('invalid_path_scope', 'host allowedPaths must be unique');
  const plan = buildVerificationPlan({ changedPaths: allowedPaths, mode: 'fast', policy });
  if (plan.risk.level === 'critical') fail('critical_path', 'critical paths and actions cannot enter a repair session');
  const session = deepFreeze({
    schemaVersion: 1,
    sessionId: randomUUID(),
    repository: worktree.repository,
    prNumber: worktree.prNumber,
    branch: worktree.branch,
    baseSha: worktree.baseSha,
    headSha: worktree.headSha,
    mergeSha: worktree.mergeSha,
    testedSha,
    workspaceFingerprint: worktree.workspaceFingerprint,
    allowedPaths,
    risk: plan.risk.level,
    approvalScope: 'repair:workspace',
    failedChecks: failures,
    verificationRequirements: {
      mode: plan.mode,
      commandIds: plan.commands.map(({ id }) => id),
      requiredExternalChecks: plan.requiredExternalChecks,
    },
    remainingBudgets: currentBudgetView(loopState, policy),
  });
  sessions.set(session, {
    repoRoot: path.resolve(input.repoRoot),
    worktree,
    hostContext,
    policy,
    plan,
    initialState: structuredClone(loopState),
  });
  return session;
}

function parseProposal(proposal, allowedPaths) {
  exactKeys(proposal, ['version', 'operations'], 'patch proposal');
  if (proposal.version !== 1 || !Array.isArray(proposal.operations)
      || proposal.operations.length < 1 || proposal.operations.length > MAX_OPERATIONS) {
    fail('invalid_proposal', 'patch proposal must be a bounded version 1 JSON change set');
  }
  let totalBytes = 0;
  const seen = new Set();
  const operations = proposal.operations.map((operation) => {
    if (!isPlainObject(operation) || !['write', 'delete'].includes(operation.op)) {
      fail('invalid_proposal', 'only write and delete operations are supported');
    }
    exactKeys(operation, operation.op === 'write' ? ['op', 'path', 'content'] : ['op', 'path'], 'patch operation');
    let normalized;
    try {
      normalized = normalizeRepoPath(operation.path);
    } catch (error) {
      fail('unsafe_path', 'patch proposal contains an unsafe repository path', error);
    }
    if (normalized !== operation.path) fail('unsafe_path', 'patch paths must use canonical repository-relative form');
    if (!allowedPaths.includes(normalized)) fail('out_of_scope', `patch path is outside the exact approved scope: ${normalized}`);
    if (seen.has(normalized)) fail('invalid_proposal', 'patch proposal cannot operate on a path more than once');
    seen.add(normalized);
    if (operation.op === 'write') {
      if (typeof operation.content !== 'string' || Buffer.from(operation.content, 'utf8').toString('utf8') !== operation.content) {
        fail('invalid_proposal', 'write content must be valid UTF-8 text');
      }
      if (operation.content.includes('\u0000')) fail('invalid_proposal', 'write content must be UTF-8 text without NUL bytes');
      const size = Buffer.byteLength(operation.content, 'utf8');
      if (size > MAX_OPERATION_BYTES) fail('invalid_proposal', 'each text operation is limited to 262144 UTF-8 bytes');
      totalBytes += size;
      return { op: 'write', path: normalized, content: operation.content };
    }
    return { op: 'delete', path: normalized };
  });
  if (totalBytes > MAX_PROPOSAL_BYTES) fail('invalid_proposal', 'patch proposal exceeds the total text size limit');
  return operations;
}

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

async function inspectOperationPath(repoRoot, operation) {
  const segments = operation.path.split('/');
  let current = repoRoot;
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const entries = await readdir(current).catch((error) => {
      if (error.code === 'ENOENT' && operation.op === 'write') return null;
      throw error;
    });
    if (entries === null) return;
    const caseMatch = entries.find((entry) => entry.toLowerCase() === segment.toLowerCase());
    if (caseMatch && caseMatch !== segment) fail('case_aliased_path', `patch path casing differs from the worktree entry: ${operation.path}`);
    if (!caseMatch) {
      if (operation.op === 'delete') fail('missing_delete_target', `delete target does not exist: ${operation.path}`);
      return;
    }
    current = path.join(current, segment);
    const info = await lstat(current);
    if (info.isSymbolicLink()) fail('symlink_path', `patch path traverses a symlink: ${operation.path}`);
    if (index < segments.length - 1 && !info.isDirectory()) fail('invalid_parent', `patch parent is not a directory: ${operation.path}`);
    if (index === segments.length - 1 && operation.op === 'delete' && !info.isFile()) {
      fail('invalid_delete_target', `delete target must be a regular file: ${operation.path}`);
    }
    if (index === segments.length - 1 && operation.op === 'write' && !info.isFile()) {
      fail('invalid_write_target', `write target must be a regular file: ${operation.path}`);
    }
  }
  const realParent = await realpath(path.dirname(current));
  if (!isInside(repoRoot, realParent)) fail('symlink_path', `patch parent escapes the worktree: ${operation.path}`);
}

async function runGit(repoRoot, args, { binary = false } = {}) {
  try {
    const { stdout } = await execFileAsync('git', ['-C', repoRoot, ...args], {
      encoding: binary ? null : 'utf8',
      env: { PATH: process.env.PATH ?? '', ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}) },
      maxBuffer: 1024 * 1024,
      timeout: 10000,
      windowsHide: true,
    });
    return stdout;
  } catch (error) {
    fail('git_operation_failed', 'a fixed host-controlled Git operation failed', error);
  }
}

async function readChangedPaths(repoRoot) {
  const output = await runGit(repoRoot, [
    '-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false',
    'status', '--porcelain=v1', '-z', '--untracked-files=all', '--no-renames',
  ], { binary: true });
  if (!Buffer.isBuffer(output)) fail('git_inspection_failed', 'Git status did not return a byte buffer');
  const paths = [];
  let offset = 0;
  while (offset < output.length) {
    const end = output.indexOf(0, offset);
    if (end < 0 || end - offset < 4 || output[offset + 2] !== 0x20) fail('git_inspection_failed', 'Git returned malformed status data');
    const rawPath = output.subarray(offset + 3, end);
    const displayPath = rawPath.toString('utf8');
    if (!Buffer.from(displayPath, 'utf8').equals(rawPath)) fail('git_inspection_failed', 'Git path is not valid UTF-8');
    paths.push(normalizeRepoPath(displayPath));
    offset = end + 1;
  }
  return [...new Set(paths)].sort();
}

async function applyOperations(repoRoot, operations) {
  for (const operation of operations) {
    const target = path.resolve(repoRoot, ...operation.path.split('/'));
    if (!isInside(repoRoot, target)) fail('unsafe_path', 'patch target escaped the repository');
    if (operation.op === 'delete') {
      await unlink(target);
      continue;
    }
    await mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.${randomUUID()}.loop-tmp`;
    let handle;
    try {
      handle = await open(temporary, 'wx', 0o600);
      await handle.writeFile(operation.content, 'utf8');
      await handle.sync();
      await handle.close();
      handle = null;
      await rename(temporary, target);
    } finally {
      if (handle) await handle.close().catch(() => {});
      await unlink(temporary).catch(() => {});
    }
  }
}

async function changedLineCounts(repoRoot, changedPaths) {
  const output = await runGit(repoRoot, ['diff', '--numstat', '--cached', '-z', 'HEAD', '--', ...changedPaths]);
  let additions = 0;
  let deletions = 0;
  for (const line of String(output).split('\n')) {
    if (!line) continue;
    const match = /^(\d+)\t(\d+)\t/.exec(line);
    if (!match) continue;
    additions += Number(match[1]);
    deletions += Number(match[2]);
  }
  return { changedFiles: changedPaths.length, additions, deletions };
}

function assertActualPaths(session, operations, changedPaths, policy) {
  const expected = new Set(operations.map(({ path: operationPath }) => operationPath));
  const allowed = new Set(session.allowedPaths);
  if (changedPaths.length === 0) fail('empty_change_set', 'patch proposal did not change the worktree');
  for (const changedPath of changedPaths) {
    if (!allowed.has(changedPath) || !expected.has(changedPath)) fail('out_of_scope_change', `Git reports an unapproved changed path: ${changedPath}`);
  }
  const classification = classifyRisk({ paths: changedPaths }, policy);
  if (classification.level === 'critical') fail('critical_path', 'critical paths and actions cannot be repaired');
  if (classification.requiresHumanApproval && changedPaths.some((changedPath) => !allowed.has(changedPath))) {
    fail('approval_scope_mismatch', 'high-risk changed path is outside the consumed approval scope');
  }
}

function validationContext(session) {
  const privateContext = sessions.get(session);
  if (!privateContext) fail('untrusted_session', 'session was not created by this trusted host process');
  return privateContext;
}

export async function validateRepairProposal(session, patchProposal, context) {
  const privateContext = validationContext(session);
  if (!isPlainObject(context) || Object.keys(context).some((key) => key !== 'tokenUsage')) {
    fail('invalid_input', 'repair validation context accepts only host-reported tokenUsage');
  }
  if (JSON.stringify(session).length > 64 * 1024) fail('invalid_session', 'repair session exceeds its size limit');

  const { repoRoot, worktree, hostContext, policy } = privateContext;
  if (Object.hasOwn(context, 'tokenUsage')) {
    const nextState = recordTokenUsage(hostContext.loopState, context.tokenUsage);
    await saveLoopState(repoRoot, nextState);
    hostContext.loopState = nextState;
    privateContext.loopState = nextState;
  } else if (hostContext.loopState.budgets.tokenLimit !== null) {
    const nextState = structuredClone(hostContext.loopState);
    nextState.budgets.tokenUsed = null;
    validateLoopState(nextState);
    await saveLoopState(repoRoot, nextState);
    hostContext.loopState = nextState;
    privateContext.loopState = nextState;
  }
  assertBudgetAvailable(hostContext.loopState, policy);

  if (await readGitWorkspaceFingerprint(repoRoot) !== session.workspaceFingerprint) {
    fail('workspace_changed', 'worktree differs from the session fingerprint before applying the patch');
  }
  if (await readGitHeadRevision(repoRoot) !== session.headSha) fail('stale_head', 'local branch head differs from the repair session');

  const operations = parseProposal(patchProposal, session.allowedPaths);
  const proposalRisk = classifyRisk({ paths: operations.map(({ path: operationPath }) => operationPath) }, policy);
  if (proposalRisk.level === 'critical') fail('critical_path', 'critical paths and actions cannot be repaired');
  for (const operation of operations) await inspectOperationPath(repoRoot, operation);

  const approvalProvider = hostContext.approvalProvider;
  if (!approvalProvider || typeof approvalProvider.requestApproval !== 'function') {
    fail('approval_provider_unavailable', 'trusted interactive approval provider is required');
  }
  let approval;
  try {
    approval = await approvalProvider.requestApproval({
      repositoryId: worktree.repositoryId,
      prNumber: worktree.prNumber,
      baseSha: worktree.baseSha,
      headSha: worktree.headSha,
      mergeSha: worktree.mergeSha,
      capability: 'repair:workspace',
      paths: [...session.allowedPaths],
    });
    await assertRepairWorkspace(worktree, approval);
  } catch (error) {
    fail('approval_rejected', 'exact repair:workspace approval was not obtained and consumed', error);
  }

  await assertCurrentPrTuple(worktree);
  await applyOperations(repoRoot, operations);
  await assertCurrentPrTuple(worktree);
  const changedPaths = await readChangedPaths(repoRoot);
  assertActualPaths(session, operations, changedPaths, policy);

  await runGit(repoRoot, ['add', '--', ...changedPaths]);
  const diff = await changedLineCounts(repoRoot, changedPaths);
  const budget = evaluateBudgets(hostContext.loopState, policy, diff);
  if (budget.stop) fail('budget_exhausted', `repair is blocked by ${budget.reason}`, budget.reason);

  await runGit(repoRoot, ['commit', '-m', `fix(loop): repair PR checks ${session.sessionId}`]);
  const verifiedRevision = await readGitHeadRevision(repoRoot);
  const committedState = structuredClone(hostContext.loopState);
  committedState.headSha = verifiedRevision;
  await saveLoopState(repoRoot, committedState);
  hostContext.loopState = committedState;
  privateContext.loopState = committedState;
  const plan = buildVerificationPlan({ changedPaths, mode: 'fast', policy });
  const verificationBudget = evaluateBudgets(hostContext.loopState, policy, diff);
  if (verificationBudget.stop) {
    fail('budget_exhausted', `repair verification is blocked by ${verificationBudget.reason}`, verificationBudget.reason);
  }
  const verification = await runVerificationPlan(plan, { repoRoot });
  if (!verification.passed || !verification.complete || !verification.revisionStable || !verification.workspaceStable
      || verification.verifiedRevision !== verifiedRevision || verification.currentRevision !== verifiedRevision) {
    const commandSummary = verification.commands.map(({ id, exitCode, spawnErrorCode }) => `${id}:${exitCode ?? 'none'}:${spawnErrorCode ?? 'none'}`).join(',');
    fail('verification_failed', `fixed verifier did not produce stable passing evidence for the committed revision (${commandSummary})`);
  }

  const [newHeadSha, workspaceFingerprint, finalChangedPaths, branch] = await Promise.all([
    readGitHeadRevision(repoRoot),
    readGitWorkspaceFingerprint(repoRoot),
    runGit(repoRoot, ['diff', '--name-only', '-z', session.headSha, 'HEAD']).then((output) => String(output).split('\0').filter(Boolean).map(normalizeRepoPath).sort()),
    runGit(repoRoot, ['symbolic-ref', '--quiet', '--short', 'HEAD']).then((value) => String(value).trim()),
  ]);
  if (newHeadSha === session.headSha) fail('head_not_advanced', 'committed repair must advance the branch SHA');
  assertActualPaths(session, operations, finalChangedPaths, policy);
  if (branch !== session.branch) fail('branch_changed', 'repair commit changed the PR branch identity');

  const nextState = structuredClone(hostContext.loopState);
  nextState.iteration += 1;
  nextState.headSha = newHeadSha;
  const nextBudget = evaluateBudgets(nextState, policy);
  await saveLoopState(repoRoot, nextState);

  return deepFreeze({
    status: 'verified',
    sessionId: session.sessionId,
    newHeadSha,
    workspaceFingerprint,
    changedPaths: finalChangedPaths,
    risk: classifyRisk({ paths: finalChangedPaths }, policy).level,
    verification,
    remainingBudgets: currentBudgetView(nextState, policy),
    tokenUsage: { total: nextState.budgets.tokenUsed },
    nextBudgetStop: nextBudget.stop ? nextBudget.reason : null,
  });
}
