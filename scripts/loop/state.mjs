import { randomUUID } from 'node:crypto';
import { open, lstat, mkdir, readFile, realpath, rename, unlink } from 'node:fs/promises';
import path from 'node:path';

import { normalizeRepoPath } from './classify-risk.mjs';

const STATE_DIRECTORY = '.loop/state';
const TASK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
const ACCEPTANCE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$/;
const BRANCH_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const SHA_PATTERN = /^[a-f0-9]{7,64}$/i;
const MAX_STATE_BYTES = 256 * 1024;
const MAX_ACCEPTANCE_CRITERIA = 100;
const MAX_FAILURE_FINGERPRINTS = 100;
const MAX_PROTECTED_PATHS = 100;
const PHASES = new Set(['inspect', 'implement', 'verify', 'repair', 'done', 'escalated']);
const RISKS = new Set(['low', 'medium', 'high', 'critical']);
const ACCEPTANCE_STATUSES = new Set(['pending', 'passed', 'failed', 'blocked']);
const STATE_KEYS = Object.freeze([
  'schemaVersion',
  'taskId',
  'branch',
  'baseSha',
  'headSha',
  'phase',
  'risk',
  'iteration',
  'maxIterations',
  'ciRetryCount',
  'acceptanceCriteria',
  'lastVerification',
  'failureCounts',
  'protectedPathsTouched',
  'budgets',
  'escalationReason',
  'startedAt',
  'updatedAt',
]);
const BUDGET_KEYS = Object.freeze([
  'tokenLimit',
  'tokenUsed',
  'wallClockLimitSeconds',
  'ciRunLimit',
  'ciRuns',
]);

export class LoopStateError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class LoopStateValidationError extends LoopStateError {}

export class LoopStatePathError extends LoopStateError {}

export class LoopStateNotFoundError extends LoopStateError {
  constructor(taskId) {
    super(`Loop state not found for task ${taskId}`);
    this.taskId = taskId;
  }
}

export class LoopStateCorruptError extends LoopStateError {
  constructor(source, message, options = {}) {
    super(`Loop state is corrupt at ${source}: ${message}`, options);
    this.source = source;
  }
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertExactKeys(value, keys, label) {
  if (!isPlainObject(value)) {
    throw new LoopStateValidationError(`${label} must be an object`);
  }

  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  const missing = expected.filter((key) => !actual.includes(key));
  const unknown = actual.filter((key) => !expected.includes(key));
  if (missing.length || unknown.length) {
    const details = [
      missing.length ? `missing ${missing.join(', ')}` : null,
      unknown.length ? `unknown ${unknown.join(', ')}` : null,
    ].filter(Boolean);
    throw new LoopStateValidationError(`${label} has ${details.join('; ')}`);
  }
}

function assertAllowedKeys(value, keys, label) {
  if (!isPlainObject(value)) {
    throw new LoopStateValidationError(`${label} must be an object`);
  }
  const allowed = new Set(keys);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) {
    throw new LoopStateValidationError(`${label} has unknown key(s): ${unknown.join(', ')}`);
  }
}

function assertTaskId(taskId) {
  if (typeof taskId !== 'string' || !TASK_ID_PATTERN.test(taskId)) {
    throw new LoopStateValidationError('taskId must be a safe 1-80 character identifier');
  }
}

function assertNonEmptyString(value, label, maximum = 255) {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximum || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new LoopStateValidationError(`${label} must be a non-empty safe string`);
  }
}

function assertBranch(branch) {
  assertNonEmptyString(branch, 'branch', 255);
  if (!BRANCH_PATTERN.test(branch) || branch.includes('..') || branch.includes('//')
      || branch.includes('@{') || branch.endsWith('/') || branch.endsWith('.')
      || branch.toLowerCase().endsWith('.lock')) {
    throw new LoopStateValidationError('branch must be a safe git branch name');
  }
}

function assertCounter(value, label, { allowNull = false, positive = false } = {}) {
  if (allowNull && value === null) return;
  if (!Number.isSafeInteger(value) || value < (positive ? 1 : 0)) {
    throw new LoopStateValidationError(`${label} must be a ${positive ? 'positive' : 'non-negative'} safe integer${allowNull ? ' or null' : ''}`);
  }
}

function assertIsoTimestamp(value, label) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new LoopStateValidationError(`${label} must be a valid ISO timestamp`);
  }
  if (new Date(value).toISOString() !== value) {
    throw new LoopStateValidationError(`${label} must use canonical ISO format`);
  }
}

function assertStopConditions(policy) {
  if (!isPlainObject(policy) || !isPlainObject(policy.stopConditions)) {
    throw new LoopStateValidationError('a validated LoopPolicy is required');
  }
  const conditions = policy.stopConditions;
  for (const key of ['maxIterations', 'maxSameFailure', 'maxFlakyRetries', 'maxChangedFiles', 'maxChangedLines', 'maxWallClockSeconds']) {
    assertCounter(conditions[key], `policy.stopConditions.${key}`, { positive: true });
  }
  for (const key of ['tokenLimit', 'ciRunLimit']) {
    assertCounter(conditions[key], `policy.stopConditions.${key}`, { allowNull: true, positive: true });
  }
  return conditions;
}

function validateLastVerification(value) {
  if (value === null) return;
  assertExactKeys(value, ['command', 'exitCode', 'failedCheck', 'failureFingerprint'], 'lastVerification');
  assertNonEmptyString(value.command, 'lastVerification.command', 120);
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(value.command)) {
    throw new LoopStateValidationError('lastVerification.command must be a command identifier');
  }
  if (value.exitCode !== null && !Number.isSafeInteger(value.exitCode)) {
    throw new LoopStateValidationError('lastVerification.exitCode must be an integer or null');
  }
  if (value.failedCheck !== null) {
    assertNonEmptyString(value.failedCheck, 'lastVerification.failedCheck', 120);
    if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(value.failedCheck)) {
      throw new LoopStateValidationError('lastVerification.failedCheck must be a stable check identifier');
    }
  }
  if (value.failureFingerprint !== null && (typeof value.failureFingerprint !== 'string' || !HASH_PATTERN.test(value.failureFingerprint))) {
    throw new LoopStateValidationError('lastVerification.failureFingerprint must be a SHA-256 hex digest or null');
  }
}

export function validateLoopState(state) {
  assertExactKeys(state, STATE_KEYS, 'LoopState');
  if (state.schemaVersion !== 1) throw new LoopStateValidationError('schemaVersion must equal 1');
  assertTaskId(state.taskId);
  assertBranch(state.branch);
  if (!SHA_PATTERN.test(state.baseSha) || !SHA_PATTERN.test(state.headSha)) {
    throw new LoopStateValidationError('baseSha and headSha must be 7-64 character hexadecimal SHAs');
  }
  if (!PHASES.has(state.phase)) throw new LoopStateValidationError('phase is not a supported loop phase');
  if (!RISKS.has(state.risk)) throw new LoopStateValidationError('risk is not a supported risk level');

  assertCounter(state.iteration, 'iteration');
  assertCounter(state.maxIterations, 'maxIterations', { positive: true });
  assertCounter(state.ciRetryCount, 'ciRetryCount');
  if (!Array.isArray(state.acceptanceCriteria)) {
    throw new LoopStateValidationError('acceptanceCriteria must be an array');
  }
  if (state.acceptanceCriteria.length > MAX_ACCEPTANCE_CRITERIA) {
    throw new LoopStateValidationError(`acceptanceCriteria cannot exceed ${MAX_ACCEPTANCE_CRITERIA} entries`);
  }
  const criterionIds = new Set();
  for (const criterion of state.acceptanceCriteria) {
    assertExactKeys(criterion, ['id', 'status'], 'acceptance criterion');
    if (typeof criterion.id !== 'string' || !ACCEPTANCE_ID_PATTERN.test(criterion.id)) {
      throw new LoopStateValidationError('acceptance criterion id must be a stable identifier');
    }
    if (criterionIds.has(criterion.id)) throw new LoopStateValidationError('acceptance criterion IDs must be unique');
    criterionIds.add(criterion.id);
    if (!ACCEPTANCE_STATUSES.has(criterion.status)) {
      throw new LoopStateValidationError('acceptance criterion status is not supported');
    }
  }

  validateLastVerification(state.lastVerification);

  if (!isPlainObject(state.failureCounts)) {
    throw new LoopStateValidationError('failureCounts must be an object');
  }
  if (Object.keys(state.failureCounts).length > MAX_FAILURE_FINGERPRINTS) {
    throw new LoopStateValidationError(`failureCounts cannot exceed ${MAX_FAILURE_FINGERPRINTS} entries`);
  }
  for (const [fingerprint, count] of Object.entries(state.failureCounts)) {
    if (!HASH_PATTERN.test(fingerprint)) throw new LoopStateValidationError('failureCounts keys must be SHA-256 hex digests');
    assertCounter(count, `failureCounts.${fingerprint}`);
  }

  if (!Array.isArray(state.protectedPathsTouched)) {
    throw new LoopStateValidationError('protectedPathsTouched must be an array');
  }
  if (state.protectedPathsTouched.length > MAX_PROTECTED_PATHS) {
    throw new LoopStateValidationError(`protectedPathsTouched cannot exceed ${MAX_PROTECTED_PATHS} entries`);
  }
  for (const protectedPath of state.protectedPathsTouched) {
    assertNonEmptyString(protectedPath, 'protectedPathsTouched entry', 1024);
    try {
      if (normalizeRepoPath(protectedPath) !== protectedPath) {
        throw new LoopStateValidationError('protected paths must use normalized repository-relative form');
      }
    } catch (error) {
      if (error instanceof LoopStateValidationError) throw error;
      throw new LoopStateValidationError('protected paths must use normalized repository-relative form', { cause: error });
    }
  }

  assertExactKeys(state.budgets, BUDGET_KEYS, 'budgets');
  assertCounter(state.budgets.tokenLimit, 'budgets.tokenLimit', { allowNull: true, positive: true });
  assertCounter(state.budgets.tokenUsed, 'budgets.tokenUsed', { allowNull: true });
  assertCounter(state.budgets.wallClockLimitSeconds, 'budgets.wallClockLimitSeconds', { allowNull: true, positive: true });
  assertCounter(state.budgets.ciRunLimit, 'budgets.ciRunLimit', { allowNull: true, positive: true });
  assertCounter(state.budgets.ciRuns, 'budgets.ciRuns');

  if (state.escalationReason !== null) {
    assertNonEmptyString(state.escalationReason, 'escalationReason', 80);
    if (!/^[a-z][a-z0-9_]*$/.test(state.escalationReason)) {
      throw new LoopStateValidationError('escalationReason must be a stable reason code or null');
    }
  }
  assertIsoTimestamp(state.startedAt, 'startedAt');
  assertIsoTimestamp(state.updatedAt, 'updatedAt');
  if (Date.parse(state.updatedAt) < Date.parse(state.startedAt)) {
    throw new LoopStateValidationError('updatedAt cannot precede startedAt');
  }

  return state;
}

function timestamp(value) {
  const date = value instanceof Date ? value : new Date(value ?? Date.now());
  if (!Number.isFinite(date.getTime())) throw new LoopStateValidationError('now must be a valid date');
  return date.toISOString();
}

function cloneState(state) {
  validateLoopState(state);
  return structuredClone(state);
}

export function createLoopState(input) {
  const allowedInputKeys = ['taskId', 'branch', 'baseSha', 'headSha', 'risk', 'acceptanceCriteria', 'policy', 'now'];
  assertAllowedKeys(input, allowedInputKeys, 'createLoopState input');
  assertTaskId(input.taskId);
  assertBranch(input.branch);
  const conditions = assertStopConditions(input.policy);
  if (!Array.isArray(input.acceptanceCriteria)) {
    throw new LoopStateValidationError('acceptanceCriteria must be an array of stable IDs');
  }
  const createdAt = timestamp(input.now);

  return validateLoopState({
    schemaVersion: 1,
    taskId: input.taskId,
    branch: input.branch,
    baseSha: input.baseSha,
    headSha: input.headSha,
    phase: 'inspect',
    risk: input.risk,
    iteration: 0,
    maxIterations: conditions.maxIterations,
    ciRetryCount: 0,
    acceptanceCriteria: input.acceptanceCriteria.map((id) => ({ id, status: 'pending' })),
    lastVerification: null,
    failureCounts: {},
    protectedPathsTouched: [],
    budgets: {
      tokenLimit: conditions.tokenLimit,
      tokenUsed: null,
      wallClockLimitSeconds: conditions.maxWallClockSeconds,
      ciRunLimit: conditions.ciRunLimit,
      ciRuns: 0,
    },
    escalationReason: null,
    startedAt: createdAt,
    updatedAt: createdAt,
  });
}

function assertSafeTaskId(taskId) {
  assertTaskId(taskId);
}

function isPathInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

async function resolveRepositoryRoot(repoRoot) {
  if (typeof repoRoot !== 'string' || repoRoot.length === 0) {
    throw new LoopStatePathError('repoRoot must be a non-empty path');
  }
  try {
    return await realpath(path.resolve(repoRoot));
  } catch (error) {
    throw new LoopStatePathError(`cannot resolve repository root: ${error.message}`, { cause: error });
  }
}

async function assertDirectoryNotSymlink(directoryPath, label, { create }) {
  if (create) await mkdir(directoryPath, { recursive: true });
  let info;
  try {
    info = await lstat(directoryPath);
  } catch (error) {
    if (!create && error.code === 'ENOENT') return false;
    throw new LoopStatePathError(`cannot access ${label}: ${error.message}`, { cause: error });
  }
  if (info.isSymbolicLink() || !info.isDirectory()) {
    throw new LoopStatePathError(`${label} must be a real directory, not a symlink`);
  }
  return true;
}

async function getStateDirectory(realRoot, { create }) {
  const loopDirectory = path.join(realRoot, '.loop');
  const stateDirectory = path.join(realRoot, STATE_DIRECTORY);
  const loopExists = await assertDirectoryNotSymlink(loopDirectory, '.loop', { create });
  if (!loopExists) return null;
  const stateExists = await assertDirectoryNotSymlink(stateDirectory, '.loop/state', { create });
  if (!stateExists) return null;

  const realStateDirectory = await realpath(stateDirectory).catch((error) => {
    throw new LoopStatePathError(`cannot resolve .loop/state: ${error.message}`, { cause: error });
  });
  if (!isPathInside(realRoot, realStateDirectory) || realStateDirectory !== path.resolve(stateDirectory)) {
    throw new LoopStatePathError('.loop/state resolves outside its expected repository path');
  }
  return realStateDirectory;
}

function stateFilePath(stateDirectory, taskId) {
  const candidate = path.resolve(stateDirectory, `${taskId}.json`);
  if (!isPathInside(stateDirectory, candidate)) {
    throw new LoopStatePathError('state path escapes .loop/state');
  }
  return candidate;
}

function setUpdatedAt(state) {
  state.updatedAt = new Date().toISOString();
  return validateLoopState(state);
}

export function recordFailure(state, fingerprint) {
  const next = cloneState(state);
  if (typeof fingerprint !== 'string' || !HASH_PATTERN.test(fingerprint)) {
    throw new LoopStateValidationError('failure fingerprint must be a SHA-256 hex digest');
  }
  next.failureCounts[fingerprint] = (next.failureCounts[fingerprint] ?? 0) + 1;
  return setUpdatedAt(next);
}

export function recordTokenUsage(state, usage) {
  const next = cloneState(state);
  assertAllowedKeys(usage, ['inputTokens', 'outputTokens'], 'token usage');
  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  assertCounter(inputTokens, 'inputTokens');
  assertCounter(outputTokens, 'outputTokens');
  const used = next.budgets.tokenUsed ?? 0;
  const total = used + inputTokens + outputTokens;
  assertCounter(total, 'tokenUsed');
  next.budgets.tokenUsed = total;
  return setUpdatedAt(next);
}

export function recordCIRun(state) {
  const next = cloneState(state);
  next.budgets.ciRuns += 1;
  assertCounter(next.budgets.ciRuns, 'ciRuns');
  return setUpdatedAt(next);
}

function effectiveLimit(snapshotLimit, policyLimit) {
  if (snapshotLimit === null) return policyLimit;
  if (policyLimit === null) return snapshotLimit;
  return Math.min(snapshotLimit, policyLimit);
}

function validateDiff(diff) {
  if (diff === undefined) return null;
  assertExactKeys(diff, ['changedFiles', 'additions', 'deletions'], 'diff');
  assertCounter(diff.changedFiles, 'diff.changedFiles');
  assertCounter(diff.additions, 'diff.additions');
  assertCounter(diff.deletions, 'diff.deletions');
  assertCounter(diff.additions + diff.deletions, 'diff.changedLines');
  return diff;
}

export function evaluateBudgets(state, policy, diff) {
  validateLoopState(state);
  const conditions = assertStopConditions(policy);
  const change = validateDiff(diff);
  const maxIterations = Math.min(state.maxIterations, conditions.maxIterations);
  if (state.iteration >= maxIterations) return { stop: true, reason: 'max_iterations' };

  if (Object.values(state.failureCounts).some((count) => count >= conditions.maxSameFailure)) {
    return { stop: true, reason: 'max_same_failure' };
  }
  if (state.ciRetryCount >= conditions.maxFlakyRetries) {
    return { stop: true, reason: 'max_flaky_retries' };
  }

  const tokenLimit = effectiveLimit(state.budgets.tokenLimit, conditions.tokenLimit);
  if (tokenLimit !== null) {
    if (state.budgets.tokenUsed === null) return { stop: true, reason: 'token_usage_unknown' };
    if (state.budgets.tokenUsed >= tokenLimit) return { stop: true, reason: 'token_limit' };
  }

  const ciRunLimit = effectiveLimit(state.budgets.ciRunLimit, conditions.ciRunLimit);
  if (ciRunLimit !== null && state.budgets.ciRuns >= ciRunLimit) {
    return { stop: true, reason: 'ci_run_limit' };
  }

  const wallClockLimit = effectiveLimit(state.budgets.wallClockLimitSeconds, conditions.maxWallClockSeconds);
  if (wallClockLimit !== null && Date.now() - Date.parse(state.startedAt) >= wallClockLimit * 1000) {
    return { stop: true, reason: 'max_wall_clock' };
  }

  if (change && change.changedFiles > conditions.maxChangedFiles) {
    return { stop: true, reason: 'max_changed_files' };
  }
  if (change && change.additions + change.deletions > conditions.maxChangedLines) {
    return { stop: true, reason: 'max_changed_lines' };
  }

  return { stop: false, reason: null };
}

export async function saveLoopState(repoRoot, state) {
  validateLoopState(state);
  const realRoot = await resolveRepositoryRoot(repoRoot);
  const stateDirectory = await getStateDirectory(realRoot, { create: true });
  const finalPath = stateFilePath(stateDirectory, state.taskId);

  try {
    const existing = await lstat(finalPath);
    if (existing.isSymbolicLink() || !existing.isFile()) {
      throw new LoopStatePathError('state target must be a regular file, not a symlink');
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const temporaryPath = `${finalPath}.${process.pid}.${randomUUID()}.tmp`;
  const serializedState = `${JSON.stringify(state, null, 2)}\n`;
  if (Buffer.byteLength(serializedState, 'utf8') > MAX_STATE_BYTES) {
    throw new LoopStateValidationError(`serialized state cannot exceed ${MAX_STATE_BYTES} bytes`);
  }
  let handle;
  let temporaryExists = false;
  try {
    handle = await open(temporaryPath, 'wx', 0o600);
    temporaryExists = true;
    await handle.writeFile(serializedState, 'utf8');
    await handle.sync();
    await handle.close();
    handle = null;
    await rename(temporaryPath, finalPath);
    temporaryExists = false;
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    if (temporaryExists) await unlink(temporaryPath).catch(() => {});
    if (error instanceof LoopStateError) throw error;
    throw new LoopStatePathError(`cannot atomically save loop state: ${error.message}`, { cause: error });
  }
}

export async function loadLoopState(repoRoot, taskId) {
  assertSafeTaskId(taskId);
  const realRoot = await resolveRepositoryRoot(repoRoot);
  const stateDirectory = await getStateDirectory(realRoot, { create: false });
  if (!stateDirectory) throw new LoopStateNotFoundError(taskId);
  const source = stateFilePath(stateDirectory, taskId);

  let fileInfo;
  try {
    fileInfo = await lstat(source);
  } catch (error) {
    if (error.code === 'ENOENT') throw new LoopStateNotFoundError(taskId);
    throw new LoopStatePathError(`cannot access loop state: ${error.message}`, { cause: error });
  }
  if (fileInfo.isSymbolicLink() || !fileInfo.isFile()) {
    throw new LoopStatePathError('state file must be a regular file, not a symlink');
  }
  if (fileInfo.size > MAX_STATE_BYTES) {
    throw new LoopStateCorruptError(source, `state exceeds the ${MAX_STATE_BYTES}-byte safety limit`);
  }

  const realFile = await realpath(source).catch((error) => {
    throw new LoopStatePathError(`cannot resolve loop state: ${error.message}`, { cause: error });
  });
  if (!isPathInside(stateDirectory, realFile)) {
    throw new LoopStatePathError('state file resolves outside .loop/state');
  }

  let parsed;
  try {
    parsed = JSON.parse(await readFile(realFile, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') throw new LoopStateNotFoundError(taskId);
    throw new LoopStateCorruptError(source, 'invalid JSON', { cause: error });
  }

  try {
    validateLoopState(parsed);
    if (parsed.taskId !== taskId) throw new LoopStateValidationError('taskId does not match the requested state file');
  } catch (error) {
    if (error instanceof LoopStateCorruptError) throw error;
    throw new LoopStateCorruptError(source, error.message, { cause: error });
  }

  return parsed;
}
