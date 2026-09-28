import { randomUUID } from 'node:crypto';
import { open, lstat, mkdir, readFile, realpath, rename, unlink } from 'node:fs/promises';
import path from 'node:path';

import { normalizeCheckObservation, normalizePrSnapshot, PrEvidenceError } from './pr-evidence.mjs';

const PR_STATE_DIRECTORY = '.loop/pr';
const MAX_STATE_BYTES = 256 * 1024;
const MAX_ATTEMPT_KEYS = 10_000;
const MAX_CHECK_COUNTERS = 1_000;
const MAX_REPAIR_REQUESTS = 100;
const REVISION_PATTERN = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i;
const FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/i;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/;
const TASK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
const PHASES = new Set(['observe', 'waiting_for_checks', 'repair_requested', 'escalated', 'complete']);
const STATE_KEYS = Object.freeze([
  'schemaVersion',
  'repository',
  'prNumber',
  'branch',
  'baseRef',
  'headSha',
  'phase',
  'engineeringTaskId',
  'observedAttemptKeys',
  'flakyRetryCounts',
  'repairRequestCount',
  'lastActionableFailureFingerprint',
  'lastDecisionReasonCode',
  'escalationReason',
  'telemetry',
  'startedAt',
  'updatedAt',
]);
const TELEMETRY_KEYS = Object.freeze([
  'observationsRecorded',
  'flakyRetriesRecorded',
  'repairRequestsRecorded',
]);

export class PrBabysitterStateError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class PrBabysitterStateValidationError extends PrBabysitterStateError {}
export class PrBabysitterStatePathError extends PrBabysitterStateError {}

export class PrBabysitterStateNotFoundError extends PrBabysitterStateError {
  constructor(repository, prNumber) {
    super(`PR babysitter state not found for ${repository}#${prNumber}`);
    this.repository = repository;
    this.prNumber = prNumber;
  }
}

export class PrBabysitterStateCorruptError extends PrBabysitterStateError {
  constructor(source, message, options = {}) {
    super(`PR babysitter state is corrupt at ${source}: ${message}`, options);
    this.source = source;
  }
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertAllowedKeys(value, allowedKeys, label) {
  if (!isPlainObject(value)) throw new PrBabysitterStateValidationError(`${label} must be a plain object`);
  if (Object.keys(value).some((key) => !allowedKeys.includes(key))) {
    throw new PrBabysitterStateValidationError(`${label} contains unsupported fields`);
  }
}

function assertExactKeys(value, requiredKeys, optionalKeys, label) {
  assertAllowedKeys(value, [...requiredKeys, ...optionalKeys], label);
  if (requiredKeys.some((key) => !Object.hasOwn(value, key))) {
    throw new PrBabysitterStateValidationError(`${label} is missing required fields`);
  }
}

function assertCounter(value, label, { max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < 0 || value > max) {
    throw new PrBabysitterStateValidationError(`${label} must be a bounded non-negative safe integer`);
  }
}

function assertTimestamp(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    throw new PrBabysitterStateValidationError(`${label} must be a canonical UTC timestamp`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) {
    throw new PrBabysitterStateValidationError(`${label} must be a canonical UTC timestamp`);
  }
}

function assertIdentifier(value, label) {
  if (typeof value !== 'string' || !IDENTIFIER_PATTERN.test(value)) {
    throw new PrBabysitterStateValidationError(`${label} must be a stable identifier`);
  }
}

function normalizeRepository(repository) {
  try {
    // Reuse the PR evidence contract so filenames and state keys have one canonical form.
    return normalizePrSnapshot({
      repository,
      number: 1,
      state: 'open',
      draft: false,
      baseRef: 'main',
      headRef: 'main',
      headSha: 'a'.repeat(40),
      headRepository: repository,
      updatedAt: '2000-01-01T00:00:00.000Z',
    }).repository;
  } catch (error) {
    throw new PrBabysitterStateValidationError(error.message, { cause: error });
  }
}

function assertRepository(repository) {
  const normalized = normalizeRepository(repository);
  if (normalized !== repository) throw new PrBabysitterStateValidationError('repository must be canonical owner/name form');
}

function validateState(state) {
  assertExactKeys(state, STATE_KEYS, [], 'PR babysitter state');
  if (state.schemaVersion !== 1) throw new PrBabysitterStateValidationError('schemaVersion is unsupported');
  assertRepository(state.repository);
  assertCounter(state.prNumber, 'prNumber', { max: Number.MAX_SAFE_INTEGER });
  if (state.prNumber < 1) throw new PrBabysitterStateValidationError('prNumber must be positive');
  try {
    normalizePrSnapshot({
      repository: state.repository,
      number: state.prNumber,
      state: 'open',
      draft: false,
      baseRef: state.baseRef,
      headRef: state.branch,
      headSha: state.headSha,
      headRepository: state.repository,
      updatedAt: state.updatedAt,
    });
  } catch (error) {
    throw new PrBabysitterStateValidationError(error.message, { cause: error });
  }
  if (!PHASES.has(state.phase)) throw new PrBabysitterStateValidationError('phase is unsupported');
  if (state.engineeringTaskId !== null
      && (typeof state.engineeringTaskId !== 'string' || !TASK_ID_PATTERN.test(state.engineeringTaskId))) {
    throw new PrBabysitterStateValidationError('engineeringTaskId must be a safe identifier or null');
  }
  if (!Array.isArray(state.observedAttemptKeys) || state.observedAttemptKeys.length > MAX_ATTEMPT_KEYS) {
    throw new PrBabysitterStateValidationError(`observedAttemptKeys must be an array of at most ${MAX_ATTEMPT_KEYS} entries`);
  }
  const attemptKeys = new Set();
  for (const attemptKey of state.observedAttemptKeys) {
    assertIdentifier(attemptKey, 'observed attempt key');
    if (attemptKeys.has(attemptKey)) throw new PrBabysitterStateValidationError('observedAttemptKeys must be unique');
    attemptKeys.add(attemptKey);
  }
  if (!isPlainObject(state.flakyRetryCounts)) {
    throw new PrBabysitterStateValidationError('flakyRetryCounts must be a plain object');
  }
  const checkIds = Object.keys(state.flakyRetryCounts);
  if (checkIds.length > MAX_CHECK_COUNTERS) {
    throw new PrBabysitterStateValidationError(`flakyRetryCounts cannot exceed ${MAX_CHECK_COUNTERS} entries`);
  }
  for (const checkId of checkIds) {
    assertIdentifier(checkId, 'check ID');
    assertCounter(state.flakyRetryCounts[checkId], `flakyRetryCounts.${checkId}`);
    if (state.flakyRetryCounts[checkId] < 1) {
      throw new PrBabysitterStateValidationError('flakyRetryCounts values must be positive');
    }
  }
  assertCounter(state.repairRequestCount, 'repairRequestCount', { max: MAX_REPAIR_REQUESTS });
  if (state.lastActionableFailureFingerprint !== null
      && (typeof state.lastActionableFailureFingerprint !== 'string'
        || !FINGERPRINT_PATTERN.test(state.lastActionableFailureFingerprint))) {
    throw new PrBabysitterStateValidationError('lastActionableFailureFingerprint must be a SHA-256 hex digest or null');
  }
  if (state.lastDecisionReasonCode !== null) assertIdentifier(state.lastDecisionReasonCode, 'lastDecisionReasonCode');
  if (state.escalationReason !== null) assertIdentifier(state.escalationReason, 'escalationReason');
  assertExactKeys(state.telemetry, TELEMETRY_KEYS, [], 'telemetry');
  for (const key of TELEMETRY_KEYS) assertCounter(state.telemetry[key], `telemetry.${key}`);
  assertTimestamp(state.startedAt, 'startedAt');
  assertTimestamp(state.updatedAt, 'updatedAt');
  return state;
}

function cloneState(state) {
  validateState(state);
  return structuredClone(state);
}

function updateTimestamp(state) {
  state.updatedAt = new Date().toISOString();
  return validateState(state);
}

function assertPrNumber(prNumber) {
  if (!Number.isSafeInteger(prNumber) || prNumber < 1) {
    throw new PrBabysitterStateValidationError('prNumber must be a positive safe integer');
  }
}

function stateFileName(repository, prNumber) {
  const canonicalRepository = normalizeRepository(repository);
  assertPrNumber(prNumber);
  const [owner, repo] = canonicalRepository.split('/');
  return `${owner}-${repo}-${prNumber}.json`;
}

function isPathInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

async function resolveRepositoryRoot(repoRoot) {
  if (typeof repoRoot !== 'string' || repoRoot.trim().length === 0) {
    throw new PrBabysitterStatePathError('repository root must be a non-empty path');
  }
  try {
    return await realpath(path.resolve(repoRoot));
  } catch (error) {
    throw new PrBabysitterStatePathError(`cannot resolve repository root: ${error.message}`, { cause: error });
  }
}

async function assertDirectory(directoryPath, label, { create }) {
  if (create) await mkdir(directoryPath, { recursive: true });
  let info;
  try {
    info = await lstat(directoryPath);
  } catch (error) {
    if (!create && error.code === 'ENOENT') return false;
    throw new PrBabysitterStatePathError(`cannot access ${label}: ${error.message}`, { cause: error });
  }
  if (info.isSymbolicLink() || !info.isDirectory()) {
    throw new PrBabysitterStatePathError(`${label} must be a real directory, not a symlink`);
  }
  return true;
}

async function getPrStateDirectory(realRoot, { create }) {
  const loopDirectory = path.join(realRoot, '.loop');
  const prDirectory = path.join(realRoot, PR_STATE_DIRECTORY);
  if (!await assertDirectory(loopDirectory, '.loop', { create })) return null;
  if (!await assertDirectory(prDirectory, '.loop/pr', { create })) return null;
  const realDirectory = await realpath(prDirectory).catch((error) => {
    throw new PrBabysitterStatePathError(`cannot resolve .loop/pr: ${error.message}`, { cause: error });
  });
  if (!isPathInside(realRoot, realDirectory) || realDirectory !== path.resolve(prDirectory)) {
    throw new PrBabysitterStatePathError('.loop/pr resolves outside its expected repository path');
  }
  return realDirectory;
}

function resolveStateFile(stateDirectory, repository, prNumber) {
  const candidate = path.resolve(stateDirectory, stateFileName(repository, prNumber));
  if (!isPathInside(stateDirectory, candidate)) throw new PrBabysitterStatePathError('state path escapes .loop/pr');
  return candidate;
}

function stateIdentity(state) {
  return `${state.repository}#${state.prNumber}`;
}

export function createPrBabysitterState(input) {
  const optionalKeys = ['engineeringTaskId'];
  assertAllowedKeys(input, [
    'repository', 'number', 'state', 'draft', 'baseRef', 'headRef', 'headSha', 'headRepository', 'updatedAt',
    ...optionalKeys,
  ], 'createPrBabysitterState input');
  if (Object.hasOwn(input, 'engineeringTaskId') && input.engineeringTaskId !== null
      && (typeof input.engineeringTaskId !== 'string' || !TASK_ID_PATTERN.test(input.engineeringTaskId))) {
    throw new PrBabysitterStateValidationError('engineeringTaskId must be a safe identifier or null');
  }
  let snapshot;
  try {
    const { engineeringTaskId, ...prSnapshot } = input;
    snapshot = normalizePrSnapshot(prSnapshot);
  } catch (error) {
    if (error instanceof PrBabysitterStateValidationError) throw error;
    if (error instanceof PrEvidenceError) throw new PrBabysitterStateValidationError(error.message, { cause: error });
    throw error;
  }
  const now = new Date().toISOString();
  return validateState({
    schemaVersion: 1,
    repository: snapshot.repository,
    prNumber: snapshot.number,
    branch: snapshot.headRef,
    baseRef: snapshot.baseRef,
    headSha: snapshot.headSha,
    phase: 'observe',
    engineeringTaskId: input.engineeringTaskId ?? null,
    observedAttemptKeys: [],
    flakyRetryCounts: {},
    repairRequestCount: 0,
    lastActionableFailureFingerprint: null,
    lastDecisionReasonCode: null,
    escalationReason: null,
    telemetry: { observationsRecorded: 0, flakyRetriesRecorded: 0, repairRequestsRecorded: 0 },
    startedAt: now,
    updatedAt: now,
  });
}

export function recordCheckObservation(state, observation) {
  const next = cloneState(state);
  let normalized;
  try {
    normalized = normalizeCheckObservation(observation);
  } catch (error) {
    if (error instanceof PrEvidenceError) throw new PrBabysitterStateValidationError(error.message, { cause: error });
    throw error;
  }

  if (normalized.headSha !== next.headSha) {
    next.headSha = normalized.headSha;
    next.phase = 'observe';
    next.observedAttemptKeys = [];
    next.flakyRetryCounts = {};
    next.lastActionableFailureFingerprint = null;
    next.lastDecisionReasonCode = null;
    next.escalationReason = null;
  }
  if (next.observedAttemptKeys.includes(normalized.attemptKey)) return next;
  if (next.observedAttemptKeys.length >= MAX_ATTEMPT_KEYS) {
    throw new PrBabysitterStateValidationError(`observedAttemptKeys cannot exceed ${MAX_ATTEMPT_KEYS} entries`);
  }
  next.observedAttemptKeys.push(normalized.attemptKey);
  next.telemetry.observationsRecorded += 1;
  assertCounter(next.telemetry.observationsRecorded, 'telemetry.observationsRecorded');
  return updateTimestamp(next);
}

export function recordFlakyRetry(state, checkId) {
  const next = cloneState(state);
  assertIdentifier(checkId, 'checkId');
  if (!Object.hasOwn(next.flakyRetryCounts, checkId) && Object.keys(next.flakyRetryCounts).length >= MAX_CHECK_COUNTERS) {
    throw new PrBabysitterStateValidationError(`flakyRetryCounts cannot exceed ${MAX_CHECK_COUNTERS} entries`);
  }
  const previousCount = Object.hasOwn(next.flakyRetryCounts, checkId) ? next.flakyRetryCounts[checkId] : 0;
  next.flakyRetryCounts[checkId] = previousCount + 1;
  next.telemetry.flakyRetriesRecorded += 1;
  assertCounter(next.flakyRetryCounts[checkId], `flakyRetryCounts.${checkId}`);
  assertCounter(next.telemetry.flakyRetriesRecorded, 'telemetry.flakyRetriesRecorded');
  return updateTimestamp(next);
}

export function recordRepairRequest(state, repair) {
  const next = cloneState(state);
  assertExactKeys(repair, ['reasonCode'], ['failureFingerprint', 'engineeringTaskId', 'escalationReason'], 'repair request');
  assertIdentifier(repair.reasonCode, 'reasonCode');
  if (repair.failureFingerprint !== undefined
      && (typeof repair.failureFingerprint !== 'string' || !FINGERPRINT_PATTERN.test(repair.failureFingerprint))) {
    throw new PrBabysitterStateValidationError('failureFingerprint must be a SHA-256 hex digest');
  }
  if (repair.engineeringTaskId !== undefined && repair.engineeringTaskId !== null
      && (typeof repair.engineeringTaskId !== 'string' || !TASK_ID_PATTERN.test(repair.engineeringTaskId))) {
    throw new PrBabysitterStateValidationError('engineeringTaskId must be a safe identifier or null');
  }
  if (repair.escalationReason !== undefined) assertIdentifier(repair.escalationReason, 'escalationReason');
  if (next.repairRequestCount >= MAX_REPAIR_REQUESTS) {
    throw new PrBabysitterStateValidationError(`repairRequestCount cannot exceed ${MAX_REPAIR_REQUESTS}`);
  }

  next.repairRequestCount += 1;
  next.phase = 'repair_requested';
  next.lastDecisionReasonCode = repair.reasonCode;
  if (repair.failureFingerprint !== undefined) next.lastActionableFailureFingerprint = repair.failureFingerprint.toLowerCase();
  if (repair.engineeringTaskId !== undefined) next.engineeringTaskId = repair.engineeringTaskId;
  if (repair.escalationReason !== undefined) {
    next.escalationReason = repair.escalationReason;
    next.phase = 'escalated';
  }
  next.telemetry.repairRequestsRecorded += 1;
  assertCounter(next.telemetry.repairRequestsRecorded, 'telemetry.repairRequestsRecorded');
  return updateTimestamp(next);
}

export async function savePrBabysitterState(repoRoot, state) {
  validateState(state);
  const realRoot = await resolveRepositoryRoot(repoRoot);
  const directory = await getPrStateDirectory(realRoot, { create: true });
  const finalPath = resolveStateFile(directory, state.repository, state.prNumber);
  try {
    const existing = await lstat(finalPath);
    if (existing.isSymbolicLink() || !existing.isFile()) {
      throw new PrBabysitterStatePathError('state target must be a regular file, not a symlink');
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const temporaryPath = `${finalPath}.${process.pid}.${randomUUID()}.tmp`;
  const serializedState = `${JSON.stringify(state, null, 2)}\n`;
  if (Buffer.byteLength(serializedState, 'utf8') > MAX_STATE_BYTES) {
    throw new PrBabysitterStateValidationError(`serialized state cannot exceed ${MAX_STATE_BYTES} bytes`);
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
    if (error instanceof PrBabysitterStateError) throw error;
    throw new PrBabysitterStatePathError(`cannot atomically save PR babysitter state: ${error.message}`, { cause: error });
  }
}

export async function loadPrBabysitterState(repoRoot, repository, prNumber) {
  const canonicalRepository = normalizeRepository(repository);
  assertPrNumber(prNumber);
  const realRoot = await resolveRepositoryRoot(repoRoot);
  const directory = await getPrStateDirectory(realRoot, { create: false });
  if (!directory) throw new PrBabysitterStateNotFoundError(canonicalRepository, prNumber);
  const source = resolveStateFile(directory, canonicalRepository, prNumber);
  let fileInfo;
  try {
    fileInfo = await lstat(source);
  } catch (error) {
    if (error.code === 'ENOENT') throw new PrBabysitterStateNotFoundError(canonicalRepository, prNumber);
    throw new PrBabysitterStatePathError(`cannot access PR babysitter state: ${error.message}`, { cause: error });
  }
  if (fileInfo.isSymbolicLink() || !fileInfo.isFile()) {
    throw new PrBabysitterStatePathError('state file must be a regular file, not a symlink');
  }
  if (fileInfo.size > MAX_STATE_BYTES) {
    throw new PrBabysitterStateCorruptError(source, `state exceeds the ${MAX_STATE_BYTES}-byte safety limit`);
  }
  const realFile = await realpath(source).catch((error) => {
    throw new PrBabysitterStatePathError(`cannot resolve PR babysitter state: ${error.message}`, { cause: error });
  });
  if (!isPathInside(directory, realFile)) {
    throw new PrBabysitterStatePathError('state file resolves outside .loop/pr');
  }

  let parsed;
  try {
    parsed = JSON.parse(await readFile(realFile, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') throw new PrBabysitterStateNotFoundError(canonicalRepository, prNumber);
    throw new PrBabysitterStateCorruptError(source, 'invalid JSON', { cause: error });
  }
  try {
    validateState(parsed);
    if (stateIdentity(parsed) !== `${canonicalRepository}#${prNumber}`) {
      throw new PrBabysitterStateValidationError('repository/PR number does not match the requested state file');
    }
  } catch (error) {
    if (error instanceof PrBabysitterStateCorruptError) throw error;
    throw new PrBabysitterStateCorruptError(source, error.message, { cause: error });
  }
  return parsed;
}
