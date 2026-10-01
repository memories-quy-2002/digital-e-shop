import { SELF } from 'cloudflare:test';
import { describe, expect, it, vi } from 'vitest';

import { decidePrAction } from '../../../pr-babysitter.mjs';
import { incompleteEvidence, STAGE0_LIMITS } from '../src/limits';
import worker, { type Env } from '../src/index';
import type { Stage0QueueMessage } from '../src/handlers/queue';
import { decisionFixtures } from './decision-fixtures.mjs';

const webhookSecret = 'unit-test-webhook-secret';
const checkRunName = 'Loop Engineering Stage 0';
const repositoryId = 123456;
const appId = 5130911;

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
} {
  return {
    env: {
      EVENT_QUEUE: { send } as unknown as Queue<Stage0QueueMessage>,
      GITHUB_WEBHOOK_SECRET: webhookSecret,
      GITHUB_REPOSITORY_ID: String(repositoryId),
      GITHUB_APP_ID: String(appId),
      STAGE0_CHECK_RUN_NAME: checkRunName,
    },
    send,
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
    const unsupportedEvent = await webhookRequest({ event: 'issues', payload: { action: 'opened' } });
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
