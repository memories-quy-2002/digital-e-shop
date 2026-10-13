import { createHash } from 'node:crypto';
import { normalizeRepoPath } from '../classify-risk.mjs';

const REVISION = /^[a-f0-9]{40,64}$/i;
const DIGEST = /^[a-f0-9]{64}$/i;
const MAX_ISSUE_BODY_BYTES = 64 * 1024;
const MAX_CHANGED_PATHS = 200;
const MAX_PATCH_BYTES = 1024 * 1024;
const CAPABILITIES = Object.freeze(['read_checkout', 'write_worktree', 'run_fixed_verifier']);

export class RunnerProtocolError extends Error {
  constructor(code) {
    super(code);
    this.name = new.target.name;
    this.code = code;
  }
}

function fail(code) { throw new RunnerProtocolError(code); }

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}

function exactKeys(value, keys, label) {
  if (!plainObject(value) || Object.keys(value).sort().join('|') !== [...keys].sort().join('|')) {
    fail(`${label}_invalid`);
  }
}

function revision(value) { return typeof value === 'string' && REVISION.test(value); }
function digest(value) { return typeof value === 'string' && DIGEST.test(value); }
function positiveInteger(value) { return Number.isSafeInteger(value) && value > 0; }
function boundedText(value, maxBytes) {
  return typeof value === 'string' && new TextEncoder().encode(value).byteLength <= maxBytes;
}

/** Validate a transient coding request. The issue body is explicitly untrusted and never serialized to durable state. */
export function validateRunnerRequest(input) {
  exactKeys(input, ['schemaVersion', 'task', 'untrustedContext', 'workspace', 'limits', 'capabilities'], 'runner_request');
  if (input.schemaVersion !== 1) fail('runner_request_invalid');
  exactKeys(input.task, ['taskId', 'repositoryId', 'issueNumber', 'generation', 'requestDigest', 'sourceRevision', 'policyRevision'], 'runner_task');
  const task = input.task;
  if (!positiveInteger(task.repositoryId) || !positiveInteger(task.issueNumber)
      || !positiveInteger(task.generation)
      || task.taskId !== `repo-${task.repositoryId}-issue-${task.issueNumber}-g${task.generation}`
      || !digest(task.requestDigest) || !revision(task.sourceRevision) || !revision(task.policyRevision)) {
    fail('runner_task_invalid');
  }
  exactKeys(input.untrustedContext, ['issueTitle', 'issueBody'], 'runner_context');
  if (!boundedText(input.untrustedContext.issueTitle, 512)
      || !boundedText(input.untrustedContext.issueBody, MAX_ISSUE_BODY_BYTES)
      || input.untrustedContext.issueBody.trim().length === 0) fail('runner_context_invalid');
  const issueDigest = createHash('sha256').update(input.untrustedContext.issueBody, 'utf8').digest('hex');
  if (issueDigest !== task.requestDigest.toLowerCase()) fail('runner_context_digest_mismatch');
  exactKeys(input.workspace, ['path', 'baseRevision', 'allowedPaths'], 'runner_workspace');
  if (typeof input.workspace.path !== 'string' || input.workspace.path.length < 1 || input.workspace.path.length > 1024
      || !revision(input.workspace.baseRevision) || input.workspace.baseRevision.toLowerCase() !== task.sourceRevision.toLowerCase()
      || !Array.isArray(input.workspace.allowedPaths) || input.workspace.allowedPaths.length < 1
      || input.workspace.allowedPaths.length > MAX_CHANGED_PATHS) fail('runner_workspace_invalid');
  const normalizedPaths = input.workspace.allowedPaths.map((path) => {
    if (typeof path !== 'string') fail('runner_workspace_invalid');
    try { return normalizeRepoPath(path); } catch { fail('runner_workspace_invalid'); }
  });
  if (new Set(normalizedPaths.map((path) => path.toLowerCase())).size !== normalizedPaths.length) fail('runner_workspace_invalid');
  exactKeys(input.limits, ['wallClockSeconds', 'maxOutputBytes', 'maxPatchBytes'], 'runner_limits');
  if (!Number.isSafeInteger(input.limits.wallClockSeconds) || input.limits.wallClockSeconds < 1
      || input.limits.wallClockSeconds > 24 * 60 * 60
      || !Number.isSafeInteger(input.limits.maxOutputBytes) || input.limits.maxOutputBytes < 1024
      || input.limits.maxOutputBytes > 1024 * 1024
      || !Number.isSafeInteger(input.limits.maxPatchBytes) || input.limits.maxPatchBytes < 1
      || input.limits.maxPatchBytes > MAX_PATCH_BYTES) fail('runner_limits_invalid');
  if (!Array.isArray(input.capabilities) || input.capabilities.length < 1
      || input.capabilities.some((capability) => !CAPABILITIES.includes(capability))
      || new Set(input.capabilities).size !== input.capabilities.length) fail('runner_capabilities_invalid');
  return Object.freeze({
    schemaVersion: 1,
    task: Object.freeze({
      taskId: task.taskId,
      repositoryId: task.repositoryId,
      issueNumber: task.issueNumber,
      generation: task.generation,
      requestDigest: task.requestDigest.toLowerCase(),
      sourceRevision: task.sourceRevision.toLowerCase(),
      policyRevision: task.policyRevision.toLowerCase(),
    }),
    untrustedContext: Object.freeze({
      issueTitle: input.untrustedContext.issueTitle,
      issueBody: input.untrustedContext.issueBody,
    }),
    workspace: Object.freeze({
      path: input.workspace.path,
      baseRevision: input.workspace.baseRevision.toLowerCase(),
      allowedPaths: Object.freeze(normalizedPaths),
    }),
    limits: Object.freeze({ ...input.limits }),
    capabilities: Object.freeze([...input.capabilities]),
  });
}

/** Accept bounded evidence only; model prose and raw logs are deliberately absent from runner results. */
export function validateRunnerResult(input, request) {
  const trustedRequest = validateRunnerRequest(request);
  const requiredKeys = [
    'schemaVersion', 'taskId', 'status', 'baseRevision', 'resultRevision', 'workspaceFingerprint',
    'changedPaths', 'patchBytes', 'exitReason',
  ];
  if (plainObject(input) && Object.hasOwn(input, 'patch')) requiredKeys.push('patch');
  exactKeys(input, requiredKeys, 'runner_result');
  if (input.schemaVersion !== 1 || input.taskId !== trustedRequest.task.taskId
      || !['completed', 'interrupted', 'failed'].includes(input.status)
      || input.baseRevision !== trustedRequest.workspace.baseRevision
      || !revision(input.resultRevision) || !digest(input.workspaceFingerprint)
      || !Array.isArray(input.changedPaths) || input.changedPaths.length > MAX_CHANGED_PATHS
      || !Number.isSafeInteger(input.patchBytes) || input.patchBytes < 0
      || input.patchBytes > trustedRequest.limits.maxPatchBytes
      || (input.exitReason !== null && (typeof input.exitReason !== 'string' || !/^[a-z][a-z0-9_-]{0,63}$/.test(input.exitReason)))) {
    fail('runner_result_invalid');
  }
  const changedPaths = input.changedPaths.map((path) => {
    if (typeof path !== 'string') fail('runner_result_invalid');
    try { return normalizeRepoPath(path); } catch { fail('runner_result_invalid'); }
  });
  if (new Set(changedPaths.map((path) => path.toLowerCase())).size !== changedPaths.length) fail('runner_result_invalid');
  const allowed = trustedRequest.workspace.allowedPaths.map((path) => path.toLowerCase());
  if (changedPaths.some((path) => !allowed.includes(path.toLowerCase()))) fail('runner_result_out_of_scope');
  if (Object.hasOwn(input, 'patch')) {
    if (typeof input.patch !== 'string' || new TextEncoder().encode(input.patch).byteLength !== input.patchBytes) fail('runner_patch_invalid');
    const patchPaths = [];
    for (const line of input.patch.split(/\r?\n/)) {
      if (!line.startsWith('diff --git ')) continue;
      const match = /^diff --git a\/([^\s]+) b\/([^\s]+)$/.exec(line);
      if (!match || match[1] !== match[2]) fail('runner_patch_invalid');
      patchPaths.push(match[2]);
    }
    if (patchPaths.length === 0 || new Set(patchPaths).size !== patchPaths.length
        || [...patchPaths].sort().join('|') !== [...changedPaths].sort().join('|')) fail('runner_patch_invalid');
  }
  if (input.status === 'completed' && (input.exitReason !== null || input.patchBytes < 1)) fail('runner_result_invalid');
  if (input.status !== 'completed' && input.exitReason === null) fail('runner_result_invalid');
  return Object.freeze({ ...input, changedPaths: Object.freeze(changedPaths) });
}
