import { randomUUID } from 'node:crypto';
import { open, lstat, mkdir, readFile, realpath, rename, unlink } from 'node:fs/promises';
import path from 'node:path';

import {
  normalizePrBabysitterRepository,
  PrBabysitterStateError,
  PrBabysitterStateValidationError,
  createPrBabysitterState,
  validatePrBabysitterState,
  reconcilePrBabysitterState,
  recordActionableFailure,
  recordCheckObservation,
  recordFlakyRetry,
  recordRepairRequest,
} from './pr-state-contract.mjs';
export {
  PrBabysitterStateError,
  PrBabysitterStateValidationError,
  createPrBabysitterState,
  validatePrBabysitterState,
  reconcilePrBabysitterState,
  recordCheckObservation,
  recordFlakyRetry,
  recordActionableFailure,
  recordRepairRequest,
};

const PR_STATE_DIRECTORY = '.loop/pr';
const MAX_STATE_BYTES = 256 * 1024;

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

function assertPrNumber(prNumber) {
  if (!Number.isSafeInteger(prNumber) || prNumber < 1) {
    throw new PrBabysitterStateValidationError('prNumber must be a positive safe integer');
  }
}

function stateFileName(repository, prNumber) {
  const canonicalRepository = normalizePrBabysitterRepository(repository);
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

export async function savePrBabysitterState(repoRoot, state) {
  validatePrBabysitterState(state);
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
  const canonicalRepository = normalizePrBabysitterRepository(repository);
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
    validatePrBabysitterState(parsed);
    if (stateIdentity(parsed) !== `${canonicalRepository}#${prNumber}`) {
      throw new PrBabysitterStateValidationError('repository/PR number does not match the requested state file');
    }
  } catch (error) {
    if (error instanceof PrBabysitterStateCorruptError) throw error;
    throw new PrBabysitterStateCorruptError(source, error.message, { cause: error });
  }
  return parsed;
}
