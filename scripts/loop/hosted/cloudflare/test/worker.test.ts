import { SELF } from 'cloudflare:test';
import { describe, expect, it, vi } from 'vitest';

import { decidePrAction } from '../../../pr-babysitter.mjs';
import { incompleteEvidence, STAGE0_LIMITS } from '../src/limits';
import worker, { type Env } from '../src/index';
import { handleWebhook } from '../src/handlers/webhook';
import type { IssueTaskQueueMessage } from '../src/handlers/issue-task-queue';
import type { Stage0QueueMessage } from '../src/handlers/queue';
import { decisionFixtures } from './decision-fixtures.mjs';

const webhookSecret = 'unit-test-webhook-secret';
const checkRunName = 'Loop Engineering Stage 0';
const repositoryId = 123456;
const appId = 5130911;
const trustedRevision = 'a'.repeat(40);
const autonomyPolicy = Object.freeze({
  schemaVersion: 1, enabled: true, autoMergeEnabled: false,
  ownerActorIds: Object.freeze([93824124]), eligibleActors: Object.freeze([93824124]), optInLabel: 'autonomous:run',
  eligibleCategories: Object.freeze(['documentation']), eligiblePaths: Object.freeze(['docs/API.md']),
  eligibleRisks: Object.freeze(['low']), runner: Object.freeze({ provider: 'openai', model: 'GPT-6-Luna' }),
  capabilities: Object.freeze(['observe']),
  budgets: Object.freeze({ maxModelCalls: 8, maxDeliveryGenerations: 2, taskConcurrency: 1, maxHostedWorkflowRuns: 3 }),
  trustedRevision,
});

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function signatureFor(rawBody: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(webhookSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  return `sha256=${toHex(new Uint8Array(signature))}`;
}

function pullRequestPayload(action: string, targetRepositoryId = repositoryId) {
  return {
    action,
    number: 42,
    repository: { id: targetRepositoryId },
    pull_request: { number: 42 },
  };
}

function issuePayload(action = 'opened', targetRepositoryId = repositoryId) {
  return {
    action,
    repository: { id: targetRepositoryId },
    sender: { id: 93824124 },
    issue: { number: 42, body: 'Implement a small frontend improvement.', labels: [{ name: 'autonomous:run' }] },
  };
}

async function webhookRequest(options: {
  event?: string;
  deliveryId?: string;
  rawBody?: string;
  payload?: unknown;
  signature?: string;
} = {}): Promise<Request> {
  const rawBody = options.rawBody ?? JSON.stringify(options.payload ?? pullRequestPayload('synchronize'));
  const signature = options.signature ?? await signatureFor(rawBody);
  return new Request('https://stage0.test/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-github-delivery': options.deliveryId ?? 'delivery-test-42',
      'x-github-event': options.event ?? 'pull_request',
      'x-hub-signature-256': signature,
    },
    body: rawBody,
  });
}

function webhookEnv(send = vi.fn(async (_message: unknown, _options?: unknown) => undefined)): {
  env: Env;
  send: typeof send;
  taskSend: ReturnType<typeof vi.fn>;
} {
  const taskSend = vi.fn(async (_message: IssueTaskQueueMessage, _options?: unknown) => undefined);
  return {
    env: {
      EVENT_QUEUE: { send } as unknown as Queue<Stage0QueueMessage>,
      TASK_QUEUE: { send: taskSend } as unknown as Queue<IssueTaskQueueMessage>,
      STAGE0_DB: {} as D1Database,
      GITHUB_WEBHOOK_SECRET: webhookSecret,
      GITHUB_REPOSITORY_ID: String(repositoryId),
      GITHUB_APP_ID: String(appId),
      STAGE0_CHECK_RUN_NAME: checkRunName,
    },
    send,
    taskSend,
  };
}

describe('hosted Stage 0 Worker runtime', () => {
  it('loads the separate queue and scheduled handlers', () => {
    expect(typeof worker.queue).toBe('function');
    expect(typeof worker.scheduled).toBe('function');
  });

  it('keeps its per-invocation subrequest limit below the Workers Free ceiling', () => {
    expect(STAGE0_LIMITS.maxSubrequestsPerInvocation).toBeGreaterThan(0);
    expect(STAGE0_LIMITS.maxSubrequestsPerInvocation).toBeLessThanOrEqual(38);
    expect(STAGE0_LIMITS.maxSubrequestsPerInvocation + STAGE0_LIMITS.maxPaginationPages + 3).toBeLessThan(50);
  });

  it('marks evidence incomplete when a configured collection cap is reached', () => {
    expect(incompleteEvidence('pagination_limit_reached', STAGE0_LIMITS.maxPaginationPages)).toEqual({
      collectionStatus: 'incomplete',
      reasonCode: 'pagination_limit_reached',
      limitReached: true,
      limit: 8,
    });
  });

  it('returns bounded unavailable evidence when trusted webhook configuration is absent', async () => {
    const response = await SELF.fetch('https://stage0.test/webhook', {
      method: 'POST',
      body: '{}',
    });

    expect(response.status).toBe(503);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual({
      collectionStatus: 'unavailable',
      reasonCode: 'webhook_ingress_not_configured',
    });
  });

  it('rejects other methods on the webhook route', async () => {
    const response = await SELF.fetch('https://stage0.test/webhook', { method: 'GET' });

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
    expect(await response.json()).toEqual({
      collectionStatus: 'unavailable',
      reasonCode: 'method_not_allowed',
    });
  });

  it.each(['opened', 'reopened', 'synchronize', 'ready_for_review', 'edited'])(
    'queues only bounded routing metadata for pull_request action %s after verifying its signature',
    async (action) => {
      const { env, send } = webhookEnv();
      const request = await webhookRequest({
        deliveryId: `delivery-${action}`,
        payload: pullRequestPayload(action),
      });

      const response = await worker.fetch(request, env);

      expect(response.status).toBe(202);
      expect(await response.json()).toEqual({ status: 'accepted' });
      expect(send).toHaveBeenCalledTimes(1);
      const envelope = send.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(Object.keys(envelope).sort()).toEqual([
        'action',
        'deliveryId',
        'event',
        'prNumber',
        'receivedAt',
        'repositoryId',
      ]);
      expect(envelope).toMatchObject({
        deliveryId: `delivery-${action}`,
        event: 'pull_request',
        action,
        repositoryId,
        prNumber: 42,
      });
      expect(envelope.receivedAt).toEqual(expect.any(String));
      expect(Number.isNaN(Date.parse(envelope.receivedAt as string))).toBe(false);
      expect(send.mock.calls[0]?.[1]).toEqual({ contentType: 'json' });
    },
  );

  it('rejects an invalid signature before attempting to parse malformed JSON', async () => {
    const { env, send } = webhookEnv();
    const malformedBody = '{"action":';
    const validSignature = await signatureFor(malformedBody);
    const invalidSignature = `${validSignature.slice(0, -1)}${validSignature.endsWith('0') ? '1' : '0'}`;
    const request = await webhookRequest({ rawBody: malformedBody, signature: invalidSignature });

    const response = await worker.fetch(request, env);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ status: 'rejected', reasonCode: 'invalid_signature' });
    expect(send).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON only after its raw-body signature is valid', async () => {
    const { env, send } = webhookEnv();
    const request = await webhookRequest({ rawBody: '{"action":' });

    const response = await worker.fetch(request, env);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ status: 'rejected', reasonCode: 'invalid_webhook_body' });
    expect(send).not.toHaveBeenCalled();
  });

  it('rejects a body above the configured streaming limit', async () => {
    const { env, send } = webhookEnv();
    const oversizedBody = 'x'.repeat(STAGE0_LIMITS.maxRequestBodyBytes + 1);
    const request = await webhookRequest({ rawBody: oversizedBody });

    const response = await worker.fetch(request, env);

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ status: 'rejected', reasonCode: 'request_body_too_large' });
    expect(send).not.toHaveBeenCalled();
  });

  it('acknowledges unsupported events and actions without queueing them', async () => {
    const { env, send } = webhookEnv();
    const unsupportedEvent = await webhookRequest({ event: 'member', payload: { action: 'added' } });
    const unsupportedAction = await webhookRequest({ payload: pullRequestPayload('closed') });

    const eventResponse = await worker.fetch(unsupportedEvent, env);
    const actionResponse = await worker.fetch(unsupportedAction, env);

    expect(eventResponse.status).toBe(202);
    expect(await eventResponse.json()).toEqual({ status: 'ignored', reasonCode: 'unsupported_event' });
    expect(actionResponse.status).toBe(202);
    expect(await actionResponse.json()).toEqual({ status: 'ignored', reasonCode: 'unsupported_action' });
    expect(send).not.toHaveBeenCalled();
  });

  it('ignores a pull request from a repository other than the configured repository', async () => {
    const { env, send } = webhookEnv();
    const request = await webhookRequest({ payload: pullRequestPayload('opened', repositoryId + 1) });

    const response = await worker.fetch(request, env);

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ status: 'ignored', reasonCode: 'wrong_repository' });
    expect(send).not.toHaveBeenCalled();
  });

  it.each([
    ['repository ID', { action: 'opened', number: 42, pull_request: { number: 42 } }],
    ['pull request number', { action: 'opened', number: 42, repository: { id: repositoryId }, pull_request: {} }],
    [
      'consistent pull request numbers',
      {
        action: 'opened',
        number: 42,
        repository: { id: repositoryId },
        pull_request: { number: 43 },
      },
    ],
  ])('rejects a supported pull_request event without a valid %s', async (_missingField, payload) => {
    const { env, send } = webhookEnv();
    const request = await webhookRequest({ payload });

    const response = await worker.fetch(request, env);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ status: 'rejected', reasonCode: 'invalid_webhook_body' });
    expect(send).not.toHaveBeenCalled();
  });

  it('ignores the Worker-owned Check Run only when both configured identity fields match', async () => {
    const { env, send } = webhookEnv();
    const ownCheckRun = await webhookRequest({
      event: 'check_run',
      payload: {
        action: 'completed',
        repository: { id: repositoryId },
        check_run: { app: { id: appId }, name: checkRunName },
      },
    });
    const sameNameOtherApp = await webhookRequest({
      event: 'check_run',
      payload: {
        action: 'completed',
        repository: { id: repositoryId },
        check_run: { app: { id: appId + 1 }, name: checkRunName },
      },
    });
    const sameAppOtherName = await webhookRequest({
      event: 'check_run',
      payload: {
        action: 'completed',
        repository: { id: repositoryId },
        check_run: { app: { id: appId }, name: `${checkRunName} other` },
      },
    });

    const ownResponse = await worker.fetch(ownCheckRun, env);
    const otherResponse = await worker.fetch(sameNameOtherApp, env);
    const otherNameResponse = await worker.fetch(sameAppOtherName, env);

    expect(ownResponse.status).toBe(202);
    expect(await ownResponse.json()).toEqual({ status: 'ignored', reasonCode: 'self_check_run' });
    expect(otherResponse.status).toBe(202);
    expect(await otherResponse.json()).toEqual({ status: 'ignored', reasonCode: 'unsupported_event' });
    expect(otherNameResponse.status).toBe(202);
    expect(await otherNameResponse.json()).toEqual({ status: 'ignored', reasonCode: 'unsupported_event' });
    expect(send).not.toHaveBeenCalled();
  });

  it('preserves a stable delivery ID for duplicate webhook deliveries', async () => {
    const { env, send } = webhookEnv();

    await worker.fetch(await webhookRequest({ deliveryId: 'same-delivery-id' }), env);
    await worker.fetch(await webhookRequest({ deliveryId: 'same-delivery-id' }), env);

    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls.map(([message]) => (message as Stage0QueueMessage).deliveryId)).toEqual([
      'same-delivery-id',
      'same-delivery-id',
    ]);
  });

  it('creates one metadata-only Issue task for signed eligible opt-in deliveries', async () => {
    const { env, taskSend } = webhookEnv();
    const tasks = new Map<string, unknown>();
    const services = {
      loadPolicy: vi.fn(async () => ({ policy: autonomyPolicy, sourceRevision: trustedRevision })),
      createTaskRecordIfAbsent: vi.fn(async (_env: Env, record: { taskId: string }) => {
        if (tasks.has(record.taskId)) return 'duplicate' as const;
        tasks.set(record.taskId, record);
        return 'created' as const;
      }),
    };
    const request = await webhookRequest({ event: 'issues', deliveryId: 'issue-delivery-42', payload: issuePayload() });
    const first = await handleWebhook(request, env, services);
    const duplicateRequest = await webhookRequest({ event: 'issues', deliveryId: 'issue-delivery-42', payload: issuePayload() });
    const duplicate = await handleWebhook(duplicateRequest, env, services);

    expect(first.status).toBe(202);
    expect(await first.json()).toEqual({ status: 'accepted', taskStatus: 'created' });
    expect(await duplicate.json()).toEqual({ status: 'accepted', taskStatus: 'duplicate' });
    expect(tasks.size).toBe(1);
    expect(services.createTaskRecordIfAbsent).toHaveBeenCalledTimes(2);
    expect(taskSend).toHaveBeenCalledTimes(2);
    expect(taskSend.mock.calls[0]?.[0]).toMatchObject({
      kind: 'issue_task', taskId: 'repo-123456-issue-42-g1', repositoryId, issueNumber: 42,
      sourceRevision: trustedRevision, policyRevision: trustedRevision,
    });
    expect(JSON.stringify(taskSend.mock.calls[0]?.[0])).not.toContain('Implement a small');
    expect(JSON.stringify([...tasks.values()])).not.toContain('Implement a small');
  });

  it('keeps Issue ingress fail-closed for disabled policy and noneligible actors', async () => {
    for (const [policy, actorId, reasonCode] of [
      [Object.freeze({ ...autonomyPolicy, enabled: false }), 93824124, 'policy_disabled'],
      [autonomyPolicy, 55, 'actor_not_eligible'],
    ] as const) {
      const { env, taskSend } = webhookEnv();
      const services = {
        loadPolicy: vi.fn(async () => ({ policy, sourceRevision: trustedRevision })),
        createTaskRecordIfAbsent: vi.fn(),
      };
      const payload = issuePayload();
      payload.sender.id = actorId;
      const result = await handleWebhook(
        await webhookRequest({ event: 'issues', payload }), env, services,
      );
      expect(await result.json()).toMatchObject({ status: 'ignored', reasonCode });
      expect(services.createTaskRecordIfAbsent).not.toHaveBeenCalled();
      expect(taskSend).not.toHaveBeenCalled();
    }
  });

  it('ignores Issues without opt-in or from other repositories and rejects unsupported or malformed Issues', async () => {
    const cases = [
      { payload: { ...issuePayload(), issue: { ...issuePayload().issue, labels: [] } }, status: 202, body: { status: 'ignored', reasonCode: 'opt_in_missing' } },
      { payload: issuePayload('edited'), status: 202, body: { status: 'ignored', reasonCode: 'unsupported_action' } },
      { payload: issuePayload('opened', repositoryId + 1), status: 202, body: { status: 'ignored', reasonCode: 'wrong_repository' } },
      { payload: { ...issuePayload(), issue: { ...issuePayload().issue, number: 0 } }, status: 400, body: { status: 'rejected', reasonCode: 'invalid_webhook_body' } },
      { payload: { ...issuePayload(), issue: { ...issuePayload().issue, body: 'x'.repeat(70 * 1024) } }, status: 400, body: { status: 'rejected', reasonCode: 'invalid_webhook_body' } },
    ];
    for (const testCase of cases) {
      const { env, taskSend } = webhookEnv();
      const services = {
        loadPolicy: vi.fn(async () => ({ policy: autonomyPolicy, sourceRevision: trustedRevision })),
        createTaskRecordIfAbsent: vi.fn(async () => 'created' as const),
      };
      const result = await handleWebhook(
        await webhookRequest({ event: 'issues', payload: testCase.payload }), env, services,
      );
      expect(result.status).toBe(testCase.status);
      expect(await result.json()).toEqual(testCase.body);
      expect(services.createTaskRecordIfAbsent).not.toHaveBeenCalled();
      expect(taskSend).not.toHaveBeenCalled();
    }
  });

  it('returns a retryable bounded error when task queue delivery fails after idempotent persistence', async () => {
    const { env, taskSend } = webhookEnv();
    taskSend.mockRejectedValueOnce(new Error('sensitive queue detail'));
    const services = {
      loadPolicy: vi.fn(async () => ({ policy: autonomyPolicy, sourceRevision: trustedRevision })),
      createTaskRecordIfAbsent: vi.fn(async () => 'created' as const),
    };
    const log = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const result = await handleWebhook(
        await webhookRequest({ event: 'issues', payload: issuePayload() }), env, services,
      );
      expect(result.status).toBe(503);
      expect(await result.json()).toEqual({ collectionStatus: 'unavailable', reasonCode: 'queue_unavailable' });
      expect(log.mock.calls.flat().join(' ')).not.toContain('sensitive queue detail');
      expect(services.createTaskRecordIfAbsent).toHaveBeenCalledTimes(1);
    } finally {
      log.mockRestore();
    }
  });

  it('does not acknowledge a Queue failure or log the thrown error', async () => {
    const send = vi.fn(async (_message: unknown, _options?: unknown) => {
      throw new Error(`private queue detail ${webhookSecret}`);
    });
    const { env } = webhookEnv(send);
    const log = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    try {
      const response = await worker.fetch(await webhookRequest(), env);

      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({
        collectionStatus: 'unavailable',
        reasonCode: 'queue_unavailable',
      });
      expect(log).toHaveBeenCalledTimes(1);
      expect(log.mock.calls[0]).toEqual(['stage0_webhook_queue_send_failed']);
      expect(log.mock.calls.flat().join(' ')).not.toContain(webhookSecret);
    } finally {
      log.mockRestore();
    }
  });

  for (const fixture of decisionFixtures) {
    it(`matches the shared decision fixture for a ${fixture.name}`, () => {
      const decision = decidePrAction(fixture.input);

      expect({ action: decision.action, reasonCode: decision.reasonCode }).toEqual(fixture.expected);
    });
  }
});
