import { constants as fsConstants } from 'node:fs';
import { open, lstat, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const STAGE1_TRUST_CONFIG_RELATIVE_PATH = path.join('.config', 'digital-e', 'loop-engineering', 'stage1-trust.json');
const REPOSITORY_ID = 743050379;
const WORKFLOW_ACTOR_LOGIN = 'digital-e-loop-runner[bot]';
const MAX_CONFIG_BYTES = 16 * 1024;

export class Stage1TrustConfigError extends Error {
  constructor(reasonCode) {
    super(reasonCode);
    this.name = 'Stage1TrustConfigError';
    this.reasonCode = reasonCode;
  }
}

function invalid() { throw new Stage1TrustConfigError('stage1_trust_configuration_invalid'); }
function unavailable() { throw new Stage1TrustConfigError('stage1_trust_configuration_unavailable'); }

export function stage1OperatingSystemHomeDirectory() {
  let homeDirectory;
  try { homeDirectory = os.userInfo().homedir; }
  catch { unavailable(); }
  if (typeof homeDirectory !== 'string' || homeDirectory.length === 0 || !path.isAbsolute(homeDirectory)) unavailable();
  return homeDirectory;
}

export function stage1TrustConfigPath(homeDirectory = stage1OperatingSystemHomeDirectory()) {
  if (typeof homeDirectory !== 'string' || homeDirectory.length === 0 || !path.isAbsolute(homeDirectory)) unavailable();
  return path.resolve(homeDirectory, STAGE1_TRUST_CONFIG_RELATIVE_PATH);
}

export function parseStage1TrustConfig(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) invalid();
  const keys = ['schemaVersion', 'repositoryId', 'trustedApproverIds', 'workflowActorId', 'workflowActorLogin'];
  if (Object.keys(value).length !== keys.length || Object.keys(value).some((key) => !keys.includes(key))
    || value.schemaVersion !== 1 || value.repositoryId !== REPOSITORY_ID
    || !Array.isArray(value.trustedApproverIds) || value.trustedApproverIds.length < 1 || value.trustedApproverIds.length > 20
    || value.trustedApproverIds.some((id) => !Number.isSafeInteger(id) || id < 1)
    || new Set(value.trustedApproverIds).size !== value.trustedApproverIds.length
    || !Number.isSafeInteger(value.workflowActorId) || value.workflowActorId < 1
    || value.workflowActorLogin !== WORKFLOW_ACTOR_LOGIN) invalid();
  return Object.freeze({
    schemaVersion: 1,
    repositoryId: REPOSITORY_ID,
    trustedApproverIds: Object.freeze([...value.trustedApproverIds]),
    workflowActorId: value.workflowActorId,
    workflowActorLogin: WORKFLOW_ACTOR_LOGIN,
  });
}

export async function loadStage1TrustConfig({ homeDirectory = stage1OperatingSystemHomeDirectory() } = {}) {
  const configPath = stage1TrustConfigPath(homeDirectory);
  let before;
  try { before = await lstat(configPath); }
  catch (error) {
    if (error.code === 'ENOENT') throw new Stage1TrustConfigError('stage1_trust_configuration_unavailable');
    throw new Stage1TrustConfigError('stage1_trust_configuration_unavailable');
  }
  if (before.isSymbolicLink() || !before.isFile() || before.size < 1 || before.size > MAX_CONFIG_BYTES) invalid();
  if (process.platform !== 'win32' && (before.mode & 0o077) !== 0) invalid();
  let handle;
  try {
    handle = await open(configPath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    const opened = await handle.stat();
    const after = await lstat(configPath);
    if (!opened.isFile() || after.isSymbolicLink() || opened.dev !== before.dev || opened.ino !== before.ino
      || opened.dev !== after.dev || opened.ino !== after.ino || opened.size !== before.size) invalid();
    const source = await handle.readFile('utf8');
    if (Buffer.byteLength(source, 'utf8') > MAX_CONFIG_BYTES) invalid();
    let value;
    try { value = JSON.parse(source); } catch { invalid(); }
    return parseStage1TrustConfig(value);
  } catch (error) {
    if (error instanceof Stage1TrustConfigError) throw error;
    throw new Stage1TrustConfigError('stage1_trust_configuration_unavailable');
  } finally {
    await handle?.close().catch(() => {});
  }
}
