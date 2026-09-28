import { lstat, mkdir, open, realpath } from 'node:fs/promises';
import path from 'node:path';

const TELEMETRY_DIRECTORY = '.loop/telemetry';
const TELEMETRY_FILE = 'pr-babysitter.jsonl';
const MAX_EVENT_BYTES = 16 * 1024;
const REVISION_PATTERN = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/;
const FAILURE_CATEGORIES = new Set(['branch-caused', 'flaky', 'infrastructure', 'protected', 'ambiguous']);
const ACTIONS = new Set(['wait', 'retry-check', 'request-repair', 'escalate', 'ready-for-human']);
const EVENT_REQUIRED_KEYS = Object.freeze([
  'timestamp',
  'repository',
  'prNumber',
  'headSha',
  'action',
  'reasonCode',
  'failureCategory',
  'checkIds',
  'retryCount',
  'repairRequestCount',
  'elapsedMs',
  'humanIntervention',
]);
const EVENT_OPTIONAL_KEYS = Object.freeze(['tokenInput', 'tokenOutput', 'humanReasonCode']);

function assertExactKeys(value, required, optional, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be a plain object`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError(`${label} must be a plain object`);
  const allowed = new Set([...required, ...optional]);
  if (Object.keys(value).some((key) => !allowed.has(key))) throw new TypeError(`${label} contains unsupported fields`);
  if (required.some((key) => !Object.hasOwn(value, key))) throw new TypeError(`${label} is missing required fields`);
}

function assertCounter(value, label, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < 0 || value > max) throw new TypeError(`${label} must be a bounded non-negative integer`);
}

function normalizeRepository(repository) {
  if (typeof repository !== 'string') throw new TypeError('repository must use owner/name form');
  const parts = repository.split('/');
  if (parts.length !== 2 || parts.some((part) => part.length === 0 || part.length > 100
      || !/^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/.test(part) || part.includes('..'))) {
    throw new TypeError('repository must use a safe owner/name form');
  }
  return `${parts[0].toLowerCase()}/${parts[1].toLowerCase()}`;
}

function normalizeTimestamp(timestamp) {
  if (typeof timestamp !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(timestamp)) {
    throw new TypeError('timestamp must be a canonical UTC timestamp');
  }
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== timestamp) throw new TypeError('timestamp must be a canonical UTC timestamp');
  return timestamp;
}

function normalizeEvent(input) {
  assertExactKeys(input, EVENT_REQUIRED_KEYS, EVENT_OPTIONAL_KEYS, 'telemetry event');
  const timestamp = normalizeTimestamp(input.timestamp);
  const repository = normalizeRepository(input.repository);
  if (!Number.isSafeInteger(input.prNumber) || input.prNumber < 1) throw new TypeError('prNumber must be a positive safe integer');
  if (typeof input.headSha !== 'string' || !REVISION_PATTERN.test(input.headSha)) throw new TypeError('headSha must be a full Git revision');
  if (!ACTIONS.has(input.action)) throw new TypeError('action is unsupported');
  if (typeof input.reasonCode !== 'string' || !IDENTIFIER_PATTERN.test(input.reasonCode)) throw new TypeError('reasonCode must be a stable identifier');
  if (input.failureCategory !== null && !FAILURE_CATEGORIES.has(input.failureCategory)) throw new TypeError('failureCategory is unsupported');
  if (!Array.isArray(input.checkIds) || input.checkIds.length > 1_000
      || input.checkIds.some((id) => typeof id !== 'string' || !IDENTIFIER_PATTERN.test(id))) {
    throw new TypeError('checkIds must be a bounded array of stable identifiers');
  }
  if (new Set(input.checkIds).size !== input.checkIds.length) throw new TypeError('checkIds must be unique');
  assertCounter(input.retryCount, 'retryCount', 100_000);
  assertCounter(input.repairRequestCount, 'repairRequestCount', 100);
  assertCounter(input.elapsedMs, 'elapsedMs', 7 * 24 * 60 * 60 * 1000);
  if (typeof input.humanIntervention !== 'boolean') throw new TypeError('humanIntervention must be a boolean');

  const hasTokenInput = Object.hasOwn(input, 'tokenInput');
  const hasTokenOutput = Object.hasOwn(input, 'tokenOutput');
  if (hasTokenInput !== hasTokenOutput) throw new TypeError('tokenInput and tokenOutput must be supplied together');
  if (hasTokenInput) {
    assertCounter(input.tokenInput, 'tokenInput');
    assertCounter(input.tokenOutput, 'tokenOutput');
  }
  if (Object.hasOwn(input, 'humanReasonCode')
      && (typeof input.humanReasonCode !== 'string' || !IDENTIFIER_PATTERN.test(input.humanReasonCode))) {
    throw new TypeError('humanReasonCode must be a stable identifier');
  }
  if (input.humanIntervention && !Object.hasOwn(input, 'humanReasonCode')) {
    throw new TypeError('humanReasonCode is required when humanIntervention is true');
  }
  if (!input.humanIntervention && Object.hasOwn(input, 'humanReasonCode')) {
    throw new TypeError('humanReasonCode requires humanIntervention');
  }

  const event = {
    timestamp,
    repository,
    prNumber: input.prNumber,
    headSha: input.headSha.toLowerCase(),
    action: input.action,
    reasonCode: input.reasonCode,
    failureCategory: input.failureCategory,
    checkIds: [...input.checkIds].sort(),
    retryCount: input.retryCount,
    repairRequestCount: input.repairRequestCount,
    elapsedMs: input.elapsedMs,
    humanIntervention: input.humanIntervention,
  };
  if (hasTokenInput) {
    event.tokenInput = input.tokenInput;
    event.tokenOutput = input.tokenOutput;
  }
  if (Object.hasOwn(input, 'humanReasonCode')) event.humanReasonCode = input.humanReasonCode;
  return Object.freeze(event);
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

export function summarizePrTelemetry(events) {
  if (!Array.isArray(events) || events.length > 100_000) throw new TypeError('events must be a bounded array');
  const normalized = events.map(normalizeEvent);
  const escalationsByCategory = {};
  for (const event of normalized) {
    if (event.action !== 'escalate' || event.failureCategory === null) continue;
    escalationsByCategory[event.failureCategory] = (escalationsByCategory[event.failureCategory] ?? 0) + 1;
  }
  const repairAttemptsBeforeGreen = normalized
    .filter((event) => event.action === 'ready-for-human' && event.repairRequestCount > 0)
    .map((event) => event.repairRequestCount);
  return Object.freeze({
    observationCount: normalized.length,
    flakyRetries: normalized.filter((event) => event.action === 'retry-check').length,
    repairRequests: normalized.filter((event) => event.action === 'request-repair').length,
    escalationsByCategory: Object.freeze(Object.fromEntries(Object.entries(escalationsByCategory).sort(([left], [right]) => left.localeCompare(right)))),
    medianRepairAttemptsBeforeGreen: median(repairAttemptsBeforeGreen),
    humanInterventionRate: normalized.length === 0
      ? 0
      : normalized.filter((event) => event.humanIntervention).length / normalized.length,
  });
}

async function ensureDirectory(directoryPath, label, { create }) {
  try {
    await lstat(directoryPath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if (!create) return false;
    await mkdir(directoryPath);
  }
  const info = await lstat(directoryPath);
  if (info.isSymbolicLink() || !info.isDirectory()) throw new TypeError(`${label} must be a real directory`);
  return true;
}

async function resolveTelemetryFile(repoRoot) {
  if (typeof repoRoot !== 'string' || repoRoot.trim().length === 0) throw new TypeError('repository root must be a non-empty path');
  const realRoot = await realpath(path.resolve(repoRoot));
  const loopDirectory = path.join(realRoot, '.loop');
  const telemetryDirectory = path.join(loopDirectory, 'telemetry');
  await ensureDirectory(loopDirectory, '.loop', { create: true });
  await ensureDirectory(telemetryDirectory, '.loop/telemetry', { create: true });
  const realDirectory = await realpath(telemetryDirectory);
  if (realDirectory !== path.resolve(telemetryDirectory)) throw new TypeError('.loop/telemetry resolves outside its expected repository path');
  const filePath = path.join(realDirectory, TELEMETRY_FILE);
  try {
    const fileInfo = await lstat(filePath);
    if (fileInfo.isSymbolicLink() || !fileInfo.isFile()) throw new TypeError('telemetry target must be a regular file, not a symlink');
    if (await realpath(filePath) !== filePath) throw new TypeError('telemetry file resolves outside its expected repository path');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return filePath;
}

export async function appendTelemetryEvent(repoRoot, event) {
  const normalized = normalizeEvent(event);
  const serialized = `${JSON.stringify(normalized)}\n`;
  if (Buffer.byteLength(serialized, 'utf8') > MAX_EVENT_BYTES) throw new TypeError(`telemetry event cannot exceed ${MAX_EVENT_BYTES} bytes`);
  const filePath = await resolveTelemetryFile(repoRoot);
  let handle;
  try {
    handle = await open(filePath, 'a', 0o600);
    const info = await handle.stat();
    if (!info.isFile()) throw new TypeError('telemetry target must be a regular file');
    if (await realpath(filePath) !== filePath) throw new TypeError('telemetry file resolves outside its expected repository path');
    await handle.writeFile(serialized, 'utf8');
    await handle.close();
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    if (error instanceof TypeError) throw error;
    throw new TypeError(`cannot append PR telemetry: ${error.message}`, { cause: error });
  }
  return normalized;
}
