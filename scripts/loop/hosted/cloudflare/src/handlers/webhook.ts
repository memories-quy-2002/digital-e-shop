import type { Env } from '../index';
import { STAGE0_LIMITS, unavailableEvidence } from '../limits';
import { authorizeIssueTask } from '../../../../tasks/issue-ingress.mjs';
import { createGitHubObserverRuntime } from '../github/observer';
import { createD1Stage0Storage } from '../storage/d1';
import { loadCanonicalAutonomyPolicy } from './issue-policy';
import type { IssueTaskQueueMessage } from './issue-task-queue';
import type { Stage0QueueMessage } from './queue';

const supportedPullRequestActions = new Set([
  'opened',
  'reopened',
  'synchronize',
  'ready_for_review',
  'edited',
]);
const maxDeliveryIdLength = 128;
const maxWebhookSecretLength = 4096;
const maxCheckRunNameLength = 100;
type IgnoredReasonCode = 'unsupported_event' | 'unsupported_action' | 'wrong_repository' | 'self_check_run'
  | 'policy_disabled' | 'policy_revision_mismatch' | 'actor_not_eligible' | 'opt_in_missing' | 'pull_request_issue';
type RejectedReasonCode =
  | 'invalid_webhook_headers'
  | 'invalid_webhook_body'
  | 'invalid_signature'
  | 'request_body_too_large';

interface WebhookConfiguration {
  secret: string;
  repositoryId: number;
  appId: number;
  checkRunName: string;
}

export interface IssueIngressServices {
  loadPolicy(env: Env, repositoryId: number): Promise<{ policy: Record<string, unknown>; sourceRevision: string }>;
  createTaskRecordIfAbsent(env: Env, record: unknown): Promise<'created' | 'duplicate'>;
}

type BodyReadResult =
  | { status: 'ok'; bytes: Uint8Array }
  | { status: 'too_large' }
  | { status: 'read_error' };

function response(body: object, status: number): Response {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

function ignored(reasonCode: IgnoredReasonCode) {
  return response({ status: 'ignored', reasonCode }, 202);
}

function rejected(reasonCode: RejectedReasonCode) {
  const status = reasonCode === 'invalid_signature' ? 401 : reasonCode === 'request_body_too_large' ? 413 : 400;
  return response({ status: 'rejected', reasonCode }, status);
}

function parsePositiveId(value: string | undefined): number | null {
  if (!value || !/^[1-9][0-9]*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getConfiguration(env: Env): WebhookConfiguration | null {
  const repositoryId = parsePositiveId(env.GITHUB_REPOSITORY_ID);
  const appId = parsePositiveId(env.GITHUB_APP_ID);
  const secret = env.GITHUB_WEBHOOK_SECRET;
  const checkRunName = env.STAGE0_CHECK_RUN_NAME;

  if (
    repositoryId === null ||
    appId === null ||
    typeof secret !== 'string' ||
    secret.length === 0 ||
    secret.length > maxWebhookSecretLength ||
    typeof checkRunName !== 'string' ||
    checkRunName.length === 0 ||
    checkRunName.length > maxCheckRunNameLength ||
    !env.EVENT_QUEUE
  ) {
    return null;
  }

  return { secret, repositoryId, appId, checkRunName };
}

const defaultIssueIngressServices: IssueIngressServices = {
  async loadPolicy(env, repositoryId) {
    const runtime = createGitHubObserverRuntime(env);
    return loadCanonicalAutonomyPolicy(runtime.api, repositoryId);
  },
  async createTaskRecordIfAbsent(env, record) {
    if (!env.STAGE0_DB) throw new Error('task_storage_unavailable');
    return createD1Stage0Storage(env.STAGE0_DB).createTaskRecordIfAbsent(record);
  },
};

function issueEnvelope(payload: Record<string, unknown>): {
  action: string;
  repositoryId: number;
  issueNumber: number;
  actorId: number;
  labels: string[];
  body: string;
  isPullRequest: boolean;
} | null {
  if (!isRecord(payload.issue) || !isRecord(payload.sender)) return null;
  const issue = payload.issue;
  const repositoryId = getRepositoryId(payload);
  if (!positiveInteger(issue.number) || repositoryId === null
      || !positiveInteger(payload.sender.id) || typeof payload.action !== 'string'
      || !Array.isArray(issue.labels) || issue.labels.length > 100
      || issue.labels.some((label) => !isRecord(label) || typeof label.name !== 'string' || label.name.length > 100)
      || typeof issue.body !== 'string') return null;
  return {
    action: payload.action,
    repositoryId,
    issueNumber: issue.number,
    actorId: payload.sender.id,
    labels: issue.labels.map((label) => (label as Record<string, unknown>).name as string),
    body: issue.body,
    isPullRequest: Object.prototype.hasOwnProperty.call(issue, 'pull_request'),
  };
}

async function acceptIssueTask(
  payload: Record<string, unknown>,
  deliveryId: string,
  env: Env,
  services: IssueIngressServices,
): Promise<Response> {
  if (!env.TASK_QUEUE || !env.STAGE0_DB) return response(unavailableEvidence('issue_task_ingress_not_configured'), 503);
  const envelope = issueEnvelope(payload);
  if (!envelope) return rejected('invalid_webhook_body');
  if (envelope.repositoryId !== parsePositiveId(env.GITHUB_REPOSITORY_ID)) return ignored('wrong_repository');

  let trusted: { policy: Record<string, unknown>; sourceRevision: string };
  try {
    trusted = await services.loadPolicy(env, envelope.repositoryId);
  } catch {
    console.warn('issue_task_policy_unavailable');
    return response(unavailableEvidence('canonical_autonomy_policy_unavailable'), 503);
  }
  const now = new Date();
  const deadline = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  let authorization: Awaited<ReturnType<typeof authorizeIssueTask>>;
  try {
    authorization = await authorizeIssueTask({
      ...envelope,
      configuredRepositoryId: parsePositiveId(env.GITHUB_REPOSITORY_ID),
      sourceRevision: trusted.sourceRevision,
      policy: trusted.policy,
      now: now.toISOString(),
      deadline: deadline.toISOString(),
    });
  } catch {
    return rejected('invalid_webhook_body');
  }
  if (authorization.status === 'ignored') return ignored(authorization.reasonCode as IgnoredReasonCode);

  let taskStatus: 'created' | 'duplicate';
  try {
    taskStatus = await services.createTaskRecordIfAbsent(env, authorization.record);
  } catch (error) {
    const code = isRecord(error) && error.code === 'task_conflict' ? 'task_conflict' : 'task_storage_unavailable';
    return response(unavailableEvidence(code), code === 'task_conflict' ? 409 : 503);
  }

  const task = authorization.record;
  const message: IssueTaskQueueMessage = {
    kind: 'issue_task',
    deliveryId,
    repositoryId: task.key.repositoryId,
    issueNumber: task.key.issueNumber,
    generation: task.key.generation,
    taskId: task.taskId,
    sourceRevision: task.sourceRevision,
    policyRevision: task.policyRevision,
  };
  try {
    await env.TASK_QUEUE.send(message, { contentType: 'json' });
  } catch {
    console.warn('issue_task_queue_send_failed');
    return response(unavailableEvidence('queue_unavailable'), 503);
  }
  return response({ status: 'accepted', taskStatus }, 202);
}

function validateContentLength(value: string | null): 'valid' | 'invalid' | 'too_large' {
  if (value === null) return 'valid';
  if (!/^[0-9]+$/.test(value)) return 'invalid';
  const contentLength = Number(value);
  if (!Number.isSafeInteger(contentLength) || contentLength > STAGE0_LIMITS.maxRequestBodyBytes) {
    return 'too_large';
  }
  return 'valid';
}

async function readBoundedBody(request: Request): Promise<BodyReadResult> {
  if (request.body === null) return { status: 'ok', bytes: new Uint8Array() };

  const reader = request.body.getReader();
  const boundedBytes = new Uint8Array(STAGE0_LIMITS.maxRequestBodyBytes);
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > STAGE0_LIMITS.maxRequestBodyBytes) {
        await reader.cancel().catch(() => undefined);
        return { status: 'too_large' };
      }
      boundedBytes.set(value, totalBytes - value.byteLength);
    }
  } catch {
    return { status: 'read_error' };
  } finally {
    reader.releaseLock();
  }

  return {
    status: 'ok',
    bytes: totalBytes === boundedBytes.byteLength ? boundedBytes : boundedBytes.slice(0, totalBytes),
  };
}

function decodeHex(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < value.length; index += 2) {
    bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  }
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

async function verifySignature(secret: string, signatureHeader: string | null, body: Uint8Array): Promise<boolean> {
  const match = signatureHeader?.match(/^sha256=([0-9a-f]{64})$/i);
  if (!match) return false;

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    return await crypto.subtle.verify(
      'HMAC',
      key,
      toArrayBuffer(decodeHex(match[1])),
      toArrayBuffer(body),
    );
  } catch {
    return false;
  }
}

function parseJsonBody(bytes: Uint8Array): Record<string, unknown> | null {
  try {
    const json = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const value: unknown = JSON.parse(json);
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

function getRepositoryId(payload: Record<string, unknown>): number | null {
  if (!isRecord(payload.repository) || !positiveInteger(payload.repository.id)) return null;
  return payload.repository.id;
}

function isOwnCheckRun(payload: Record<string, unknown>, configuration: WebhookConfiguration): boolean {
  if (!isRecord(payload.check_run)) return false;
  const checkRun = payload.check_run;
  return (
    checkRun.name === configuration.checkRunName &&
    isRecord(checkRun.app) &&
    checkRun.app.id === configuration.appId
  );
}

export async function handleWebhook(
  request: Request,
  env: Env,
  issueServices: IssueIngressServices = defaultIssueIngressServices,
): Promise<Response> {
  if (request.method !== 'POST') {
    return Response.json(unavailableEvidence('method_not_allowed'), {
      status: 405,
      headers: { allow: 'POST', 'cache-control': 'no-store' },
    });
  }

  const configuration = getConfiguration(env);
  if (!configuration) return response(unavailableEvidence('webhook_ingress_not_configured'), 503);

  const event = request.headers.get('x-github-event');
  const deliveryId = request.headers.get('x-github-delivery');
  const signature = request.headers.get('x-hub-signature-256');
  if (
    !event ||
    !deliveryId ||
    deliveryId.length > maxDeliveryIdLength ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(deliveryId) ||
    !signature
  ) {
    return rejected('invalid_webhook_headers');
  }

  const contentLengthStatus = validateContentLength(request.headers.get('content-length'));
  if (contentLengthStatus === 'invalid') return rejected('invalid_webhook_headers');
  if (contentLengthStatus === 'too_large') return rejected('request_body_too_large');

  const body = await readBoundedBody(request);
  if (body.status === 'too_large') return rejected('request_body_too_large');
  if (body.status === 'read_error') return rejected('invalid_webhook_body');
  if (!(await verifySignature(configuration.secret, signature, body.bytes))) {
    return rejected('invalid_signature');
  }

  if (event !== 'pull_request' && event !== 'check_run' && event !== 'issues') return ignored('unsupported_event');

  const payload = parseJsonBody(body.bytes);
  if (!payload) return rejected('invalid_webhook_body');

  if (event === 'check_run') {
    return isOwnCheckRun(payload, configuration)
      ? ignored('self_check_run')
      : ignored('unsupported_event');
  }

  if (event === 'issues') return acceptIssueTask(payload, deliveryId, env, issueServices);

  const eventAction = payload.action;
  const actualRepositoryId = getRepositoryId(payload);
  if (typeof eventAction !== 'string' || actualRepositoryId === null) {
    return rejected('invalid_webhook_body');
  }
  if (actualRepositoryId !== configuration.repositoryId) return ignored('wrong_repository');
  if (!supportedPullRequestActions.has(eventAction)) return ignored('unsupported_action');

  const pullRequest = payload.pull_request;
  if (
    !positiveInteger(payload.number) ||
    !isRecord(pullRequest) ||
    !positiveInteger(pullRequest.number) ||
    payload.number !== pullRequest.number
  ) {
    return rejected('invalid_webhook_body');
  }

  const message: Stage0QueueMessage = {
    deliveryId,
    event,
    action: eventAction,
    repositoryId: actualRepositoryId,
    prNumber: pullRequest.number,
    receivedAt: new Date().toISOString(),
  };

  try {
    await env.EVENT_QUEUE!.send(message, { contentType: 'json' });
  } catch {
    console.warn('stage0_webhook_queue_send_failed');
    return response(unavailableEvidence('queue_unavailable'), 503);
  }

  return response({ status: 'accepted' }, 202);
}
