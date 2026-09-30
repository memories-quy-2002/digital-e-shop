import assert from 'node:assert/strict';
import { generateKeyPairSync, verify as verifySignature } from 'node:crypto';
import { describe, it } from 'node:test';

import { createGitHubAuthProvider, GitHubAuthProviderError } from '../github-auth-provider.mjs';

const APP_ID = 812345;
const APP_CLIENT_ID = 'Iv1.projectclient';
const INSTALLATION_ID = 456789;
const REPOSITORY_ID = 987654;
const USER_TOKEN = 'ghu-test-user-token-never-log';
const INSTALLATION_TOKEN = 'ghs-test-install-token-never-log';
const NOW = Date.parse('2026-09-28T08:00:00.000Z');
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });

function response(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function defaultPermissions(capability = 'observe') {
  const observe = {
    metadata: 'read',
    pull_requests: 'read',
    checks: 'read',
    actions: 'read',
    administration: 'read',
  };
  if (capability === 'actions:rerun') return { ...observe, actions: 'write' };
  if (capability === 'contents:write') return { ...observe, contents: 'write' };
  return observe;
}

function createHarness(options = {}) {
  let now = options.now ?? NOW;
  let pollIndex = 0;
  const calls = [];
  const promptEvents = [];
  const pollResponses = options.pollResponses ?? [
    { error: 'authorization_pending' },
    { access_token: USER_TOKEN, token_type: 'bearer' },
  ];
  const prompt = async (event) => {
    promptEvents.push(structuredClone(event));
    if (event.type === 'approval') return options.confirmation ?? true;
    return true;
  };
  Object.defineProperty(prompt, 'isTTY', { value: options.isTTY ?? true });

  const fetchImpl = async (input, init = {}) => {
    const url = new URL(input);
    calls.push({
      url,
      init,
      body: typeof init.body === 'string' ? init.body : '',
    });

    if (url.href === 'https://github.com/login/device/code') {
      return response(200, options.deviceResponse ?? {
        device_code: 'device-code-private',
        user_code: 'ABCD-EFGH',
        verification_uri: 'https://github.com/login/device',
        expires_in: 900,
        interval: 5,
      });
    }
    if (url.href === 'https://github.com/login/oauth/access_token') {
      const value = pollResponses[pollIndex] ?? pollResponses.at(-1);
      pollIndex += 1;
      return response(200, value);
    }
    if (url.href === 'https://api.github.com/user') {
      return response(200, options.user ?? { id: 1001, login: 'trusted-maintainer' });
    }
    if (url.href === 'https://api.github.com/repositories/' + REPOSITORY_ID) {
      return response(200, {
        id: REPOSITORY_ID,
        full_name: 'memories-quy-2002/digital-e-shop',
        permissions: options.repositoryPermissions ?? { pull: true, push: true, admin: false },
      });
    }
    if (url.href === 'https://api.github.com/app/installations/' + INSTALLATION_ID + '/access_tokens') {
      if (options.installationResponse instanceof Response) return options.installationResponse;
      const requested = JSON.parse(init.body);
      const capability = requested.permissions.contents === 'write'
        ? 'contents:write'
        : requested.permissions.actions === 'write' ? 'actions:rerun' : 'observe';
      return response(201, options.installationResponse ?? {
        token: INSTALLATION_TOKEN,
        expires_at: '2026-09-28T09:00:00Z',
        permissions: defaultPermissions(capability),
        repository_selection: 'selected',
        repositories: [{ id: REPOSITORY_ID, full_name: 'memories-quy-2002/digital-e-shop' }],
      });
    }
    return response(404, { message: 'not found' });
  };

  const clock = {
    now: () => now,
    sleep: async (milliseconds) => {
      now += milliseconds;
    },
  };
  const provider = createGitHubAuthProvider({
    appId: APP_ID,
    appClientId: APP_CLIENT_ID,
    installationId: INSTALLATION_ID,
    repositoryId: REPOSITORY_ID,
    getAppPrivateKey: options.getAppPrivateKey ?? (async () => privateKey.export({ type: 'pkcs8', format: 'pem' })),
    trustedApproverIds: options.trustedApproverIds ?? [1001],
    fetchImpl,
    prompt,
    clock,
  });

  return {
    provider,
    calls,
    promptEvents,
    setNow(value) {
      now = value;
    },
  };
}

function callFor(calls, pathname, method = 'GET') {
  return calls.find((call) => call.url.pathname === pathname && (call.init.method ?? 'GET') === method);
}

function decodeJwt(token) {
  const [encodedHeader, encodedPayload, encodedSignature] = token.split('.');
  const signingInput = encodedHeader + '.' + encodedPayload;
  assert.equal(
    verifySignature('RSA-SHA256', Buffer.from(signingInput), publicKey, Buffer.from(encodedSignature, 'base64url')),
    true,
  );
  return {
    header: JSON.parse(Buffer.from(encodedHeader, 'base64url').toString('utf8')),
    payload: JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')),
  };
}

function approvalScope(overrides = {}) {
  return {
    repositoryId: REPOSITORY_ID,
    prNumber: 42,
    baseSha: 'a'.repeat(40),
    headSha: 'b'.repeat(40),
    mergeSha: 'c'.repeat(40),
    capability: 'contents:write',
    paths: ['scripts/loop/client.mjs', '.agent/loops/pr-babysitter.md'],
    ...overrides,
  };
}

describe('GitHub App authentication and approval provider', () => {
  it('polls device authorization and resolves identity from GitHub /user, ignoring caller identity', async () => {
    const harness = createHarness();

    const principal = await harness.provider.authenticateApprover({ id: 9999, login: 'forged' });

    assert.deepEqual(principal, { id: 1001, login: 'trusted-maintainer' });
    assert.equal(harness.calls.filter((call) => call.url.pathname === '/login/oauth/access_token').length, 2);
    assert.equal(callFor(harness.calls, '/user').init.headers.Authorization, 'Bearer ' + USER_TOKEN);
    assert.equal(callFor(harness.calls, '/user').init.redirect, 'manual');
    assert.deepEqual(harness.promptEvents.map((event) => event.type), ['device-code']);
    assert.equal(JSON.stringify(harness.promptEvents).includes(USER_TOKEN), false);
  });

  it('stops on device-flow cancellation and does not call the user endpoint', async () => {
    const harness = createHarness({ pollResponses: [{ error: 'access_denied' }] });

    await assert.rejects(
      harness.provider.authenticateApprover(),
      (error) => error instanceof GitHubAuthProviderError && error.code === 'authorization_cancelled',
    );
    assert.equal(callFor(harness.calls, '/user'), undefined);
  });

  it('expires the device flow without polling past its deadline', async () => {
    const harness = createHarness({
      deviceResponse: {
        device_code: 'device-code-private',
        user_code: 'ABCD-EFGH',
        verification_uri: 'https://github.com/login/device',
        expires_in: 1,
        interval: 1,
      },
      pollResponses: [{ access_token: USER_TOKEN, token_type: 'bearer' }],
    });

    await assert.rejects(
      harness.provider.authenticateApprover(),
      (error) => error instanceof GitHubAuthProviderError && error.code === 'device_flow_expired',
    );
    assert.equal(callFor(harness.calls, '/login/oauth/access_token'), undefined);
    assert.equal(callFor(harness.calls, '/user'), undefined);
  });

  it('rejects authentication without a TTY before requesting a device code', async () => {
    const harness = createHarness({ isTTY: false });

    await assert.rejects(
      harness.provider.authenticateApprover(),
      (error) => error instanceof GitHubAuthProviderError && error.code === 'interactive_tty_required',
    );
    assert.equal(harness.calls.length, 0);
  });

  it('mints an RS256 App JWT and scopes the observe token to the fixed installation, repository, and permissions', async () => {
    const harness = createHarness();

    const token = await harness.provider.getInstallationToken('observe');

    assert.equal(token, INSTALLATION_TOKEN);
    const tokenCall = callFor(harness.calls, '/app/installations/' + INSTALLATION_ID + '/access_tokens', 'POST');
    assert.equal(tokenCall.url.origin, 'https://api.github.com');
    assert.equal(tokenCall.init.redirect, 'manual');
    assert.deepEqual(JSON.parse(tokenCall.body), {
      repository_ids: [REPOSITORY_ID],
      permissions: defaultPermissions('observe'),
    });
    const authorization = tokenCall.init.headers.Authorization;
    assert.match(authorization, /^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    const { header, payload } = decodeJwt(authorization.slice('Bearer '.length));
    assert.equal(header.alg, 'RS256');
    assert.equal(header.typ, 'JWT');
    assert.equal(payload.iss, APP_ID);
    assert.ok(payload.iat <= Math.floor(NOW / 1000));
    assert.ok(payload.exp > payload.iat && payload.exp - payload.iat <= 600);
    assert.equal(tokenCall.init.headers['X-GitHub-Api-Version'], '2026-03-10');
  });

  it('adds only the fixed capability permission for rerun and contents tokens', async () => {
    const harness = createHarness();

    await harness.provider.getInstallationToken('actions:rerun');
    await harness.provider.getInstallationToken('contents:write');

    const calls = harness.calls.filter((call) => call.url.pathname.endsWith('/access_tokens'));
    assert.deepEqual(JSON.parse(calls[0].body).permissions, defaultPermissions('actions:rerun'));
    assert.deepEqual(JSON.parse(calls[1].body).permissions, defaultPermissions('contents:write'));
    assert.deepEqual(JSON.parse(calls[0].body).repository_ids, [REPOSITORY_ID]);
    assert.deepEqual(JSON.parse(calls[1].body).repository_ids, [REPOSITORY_ID]);
    await assert.rejects(harness.provider.getInstallationToken('contents:delete'), GitHubAuthProviderError);
  });

  it('fails closed when GitHub returns a token without the requested permission', async () => {
    const harness = createHarness({
      installationResponse: {
        token: INSTALLATION_TOKEN,
        expires_at: '2026-09-28T09:00:00Z',
        permissions: { metadata: 'read', pull_requests: 'read', actions: 'read', administration: 'read' },
        repository_selection: 'selected',
        repositories: [{ id: REPOSITORY_ID }],
      },
    });

    await assert.rejects(
      harness.provider.getInstallationToken('observe'),
      (error) => error instanceof GitHubAuthProviderError && error.code === 'token_permissions_mismatch',
    );
  });

  it('does not fall back to another credential or expose response secrets after token creation is forbidden', async () => {
    const harness = createHarness({
      installationResponse: response(403, { message: INSTALLATION_TOKEN }),
    });

    await assert.rejects(
      harness.provider.getInstallationToken('observe'),
      (error) => error instanceof GitHubAuthProviderError
        && error.code === 'forbidden'
        && !error.message.includes(INSTALLATION_TOKEN),
    );
    assert.equal(harness.calls.filter((call) => call.url.pathname === '/user').length, 0);
  });

  it('rejects a GitHub principal that is not in the trusted numeric user-ID allowlist', async () => {
    const harness = createHarness({
      trustedApproverIds: [1002],
      user: { id: 1001, login: 'not-trusted' },
    });
    await harness.provider.authenticateApprover();

    await assert.rejects(
      harness.provider.requestApproval(approvalScope()),
      (error) => error instanceof GitHubAuthProviderError && error.code === 'approver_not_trusted',
    );
    assert.equal(callFor(harness.calls, '/repositories/' + REPOSITORY_ID), undefined);
  });

  it('requires effective repository write permission and an explicit TTY approval', async () => {
    const noWrite = createHarness({ repositoryPermissions: { pull: true, push: false, admin: false } });
    await noWrite.provider.authenticateApprover();
    await assert.rejects(
      noWrite.provider.requestApproval(approvalScope()),
      (error) => error instanceof GitHubAuthProviderError && error.code === 'repository_write_required',
    );
    assert.equal(noWrite.promptEvents.some((event) => event.type === 'approval'), false);

    const cancelled = createHarness({ confirmation: false });
    await cancelled.provider.authenticateApprover();
    await assert.rejects(
      cancelled.provider.requestApproval(approvalScope()),
      (error) => error instanceof GitHubAuthProviderError && error.code === 'approval_cancelled',
    );
  });

  it('does not issue an approval when the TTY is absent', async () => {
    const harness = createHarness({ isTTY: false });

    await assert.rejects(
      harness.provider.requestApproval(approvalScope()),
      (error) => error instanceof GitHubAuthProviderError && error.code === 'interactive_tty_required',
    );
    assert.equal(harness.calls.length, 0);
  });

  it('binds a non-serializable single-use approval to exact repository, PR, revision tuple, capability, and sorted paths', async () => {
    const harness = createHarness();
    await harness.provider.authenticateApprover();

    const scope = approvalScope();
    const approval = await harness.provider.requestApproval(scope);
    const confirmation = harness.promptEvents.find((event) => event.type === 'approval');

    assert.equal(confirmation.repositoryId, REPOSITORY_ID);
    assert.equal(confirmation.prNumber, 42);
    assert.deepEqual(confirmation.revision, {
      baseSha: 'a'.repeat(40),
      headSha: 'b'.repeat(40),
      mergeSha: 'c'.repeat(40),
    });
    assert.equal(confirmation.capability, 'contents:write');
    assert.deepEqual(confirmation.paths, ['.agent/loops/pr-babysitter.md', 'scripts/loop/client.mjs']);
    assert.equal(confirmation.approverId, 1001);
    assert.throws(() => JSON.stringify(approval), GitHubAuthProviderError);

    assert.throws(
      () => harness.provider.consumeApproval(approval, { ...scope, headSha: 'd'.repeat(40) }),
      (error) => error.code === 'approval_scope_mismatch',
    );
    assert.equal(harness.provider.consumeApproval(approval, scope), undefined);
    assert.throws(
      () => harness.provider.consumeApproval(approval, scope),
      (error) => error instanceof GitHubAuthProviderError && error.code === 'approval_replayed',
    );
    assert.throws(
      () => harness.provider.consumeApproval({}, scope),
      (error) => error instanceof GitHubAuthProviderError && error.code === 'invalid_approval',
    );
  });

  it('binds Actions rerun approval to the exact tested head or merge SHA', async () => {
    const harness = createHarness();
    await harness.provider.authenticateApprover();
    const actionTarget = {
      workflowId: 5001,
      runId: 7001,
      runAttempt: 2,
      failedJobIds: [9003, 9001],
      requiredIdentity: {
        type: 'workflow',
        repositoryId: REPOSITORY_ID,
        path: '.github/workflows/ci.yml',
        ref: 'refs/heads/main',
        sha: 'a'.repeat(40),
      },
    };
    const scope = approvalScope({
      capability: 'actions:rerun',
      paths: ['.github/workflows/ci.yml'],
      testedSha: 'b'.repeat(40),
      actionTarget,
    });
    const approval = await harness.provider.requestApproval(scope);
    const confirmation = harness.promptEvents.find((event) => event.type === 'approval');

    assert.equal(confirmation.testedSha, 'b'.repeat(40));
    assert.deepEqual(confirmation.actionTarget, {
      ...actionTarget,
      failedJobIds: [9001, 9003],
      requiredIdentity: { ...actionTarget.requiredIdentity, sha: 'a'.repeat(40) },
    });
    assert.throws(
      () => harness.provider.consumeApproval(approval, { ...scope, testedSha: 'c'.repeat(40) }),
      (error) => error instanceof GitHubAuthProviderError && error.code === 'approval_scope_mismatch',
    );
    assert.throws(
      () => harness.provider.consumeApproval(approval, {
        ...scope,
        actionTarget: { ...actionTarget, runAttempt: 3 },
      }),
      (error) => error instanceof GitHubAuthProviderError && error.code === 'approval_scope_mismatch',
    );
    assert.equal(harness.provider.consumeApproval(approval, scope), undefined);

    await assert.rejects(
      harness.provider.requestApproval(approvalScope({ capability: 'actions:rerun', paths: ['.github/workflows/ci.yml'] })),
      (error) => error instanceof GitHubAuthProviderError && error.code === 'invalid_scope',
    );
  });

  it('expires an unconsumed approval and rejects malformed or unsafe path scopes', async () => {
    const harness = createHarness();
    await harness.provider.authenticateApprover();
    const approval = await harness.provider.requestApproval(approvalScope());
    const prompt = harness.promptEvents.find((event) => event.type === 'approval');
    harness.setNow(Date.parse(prompt.expiresAt));

    assert.throws(
      () => harness.provider.consumeApproval(approval, approvalScope()),
      (error) => error instanceof GitHubAuthProviderError && error.code === 'approval_expired',
    );
    await assert.rejects(
      harness.provider.requestApproval(approvalScope({ paths: ['../outside.txt'] })),
      (error) => error instanceof GitHubAuthProviderError && error.code === 'invalid_scope',
    );
    await assert.rejects(
      harness.provider.requestApproval(approvalScope({ paths: ['C:/outside.txt'] })),
      (error) => error instanceof GitHubAuthProviderError && error.code === 'invalid_scope',
    );
  });

  it('rejects caller-supplied permission maps and never reports private-key material in an error', async () => {
    assert.throws(
      () => createGitHubAuthProvider({
        appId: APP_ID,
        appClientId: APP_CLIENT_ID,
        installationId: INSTALLATION_ID,
        repositoryId: REPOSITORY_ID,
        getAppPrivateKey: async () => privateKey.export({ type: 'pkcs8', format: 'pem' }),
        trustedApproverIds: [1001],
        permissions: { contents: 'write' },
      }),
      GitHubAuthProviderError,
    );

    const privateKeyText = 'PRIVATE_KEY_MATERIAL_NEVER_EXPOSE';
    const harness = createHarness({
      getAppPrivateKey: async () => { throw new Error(privateKeyText); },
    });
    await assert.rejects(
      harness.provider.getInstallationToken('observe'),
      (error) => error instanceof GitHubAuthProviderError
        && error.code === 'app_key_unavailable'
        && !error.message.includes(privateKeyText),
    );
    assert.equal(harness.calls.length, 0);
  });
});
