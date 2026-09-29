import { randomUUID, sign as signBytes, createPrivateKey } from 'node:crypto';

const API_ORIGIN = 'https://api.github.com';
const GITHUB_ORIGIN = 'https://github.com';
const API_VERSION = '2026-03-10';
const MAX_RESPONSE_BYTES = 256 * 1024;
const APPROVAL_TTL_MS = 2 * 60 * 1000;
const SHA_PATTERN = /^[a-f0-9]{40}$/i;

const OBSERVE_PERMISSIONS = Object.freeze({
  metadata: 'read',
  pull_requests: 'read',
  checks: 'read',
  actions: 'read',
  administration: 'read',
});

const CAPABILITY_PERMISSIONS = Object.freeze({
  observe: OBSERVE_PERMISSIONS,
  'actions:rerun': Object.freeze({ ...OBSERVE_PERMISSIONS, actions: 'write' }),
  'contents:write': Object.freeze({ ...OBSERVE_PERMISSIONS, contents: 'write' }),
});

const APPROVAL_CAPABILITIES = new Set(['actions:rerun', 'repair:workspace', 'contents:write']);
const ERROR_MESSAGES = Object.freeze({
  invalid_configuration: 'GitHub authentication provider configuration is invalid.',
  interactive_tty_required: 'A trusted interactive TTY is required for this operation.',
  authorization_failed: 'GitHub device authorization could not be started.',
  authorization_cancelled: 'GitHub device authorization was cancelled.',
  device_flow_expired: 'GitHub device authorization expired.',
  invalid_device_response: 'GitHub returned an invalid device authorization response.',
  github_unavailable: 'GitHub could not be reached safely.',
  redirect_rejected: 'GitHub redirected an authenticated request.',
  response_too_large: 'GitHub returned a response larger than the configured limit.',
  invalid_response: 'GitHub returned an invalid response.',
  unauthorized: 'GitHub rejected the supplied authorization.',
  forbidden: 'GitHub denied the requested operation.',
  rate_limited: 'GitHub rate-limited the requested operation.',
  approver_not_authenticated: 'Authenticate a GitHub approver before requesting approval.',
  approver_not_trusted: 'The authenticated GitHub user is not a trusted approver.',
  repository_write_required: 'The approver needs effective write permission on the repository.',
  token_permissions_mismatch: 'GitHub did not grant exactly the requested installation permissions.',
  installation_scope_mismatch: 'GitHub did not restrict the installation token to the configured repository.',
  app_key_unavailable: 'The GitHub App private key is unavailable or invalid.',
  invalid_capability: 'The requested GitHub capability is not supported.',
  invalid_scope: 'The requested approval scope is invalid or unsafe.',
  approval_cancelled: 'The approval request was cancelled.',
  approval_scope_mismatch: 'The approval does not match the exact requested operation scope.',
  invalid_approval: 'The approval handle is invalid.',
  approval_expired: 'The approval has expired.',
  approval_replayed: 'The approval has already been consumed.',
});

export class GitHubAuthProviderError extends Error {
  constructor(code) {
    super(ERROR_MESSAGES[code] ?? 'GitHub authentication operation failed.');
    this.name = 'GitHubAuthProviderError';
    this.code = code;
  }
}

function fail(code) {
  throw new GitHubAuthProviderError(code);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertExactKeys(value, allowed, code = 'invalid_configuration') {
  if (!isRecord(value) || Object.keys(value).some((key) => !allowed.has(key))) fail(code);
}

function parsePositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function toBase64Url(value) {
  return Buffer.from(value).toString('base64url');
}

function canonicalJson(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (isRecord(value)) {
    return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonicalJson(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

async function readJson(response) {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) fail('response_too_large');

  let bytes;
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_RESPONSE_BYTES) {
          await reader.cancel().catch(() => {});
          fail('response_too_large');
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    bytes = Buffer.concat(chunks, total);
  } else {
    bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength > MAX_RESPONSE_BYTES) fail('response_too_large');
  }

  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    fail('invalid_response');
  }
}

function mapHttpError(response) {
  if (response.status === 401) return 'unauthorized';
  if (response.status === 403) {
    return response.headers.get('x-ratelimit-remaining') === '0' ? 'rate_limited' : 'forbidden';
  }
  if (response.status === 429) return 'rate_limited';
  if (response.status >= 300 && response.status < 400) return 'redirect_rejected';
  return 'github_unavailable';
}

async function safeFetch(fetchImpl, url, init) {
  let response;
  try {
    response = await fetchImpl(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(15_000) });
  } catch {
    fail('github_unavailable');
  }
  if (response.status >= 300 && response.status < 400) fail('redirect_rejected');
  return response;
}

async function requestJson(fetchImpl, url, init) {
  const response = await safeFetch(fetchImpl, url, init);
  if (!response.ok) fail(mapHttpError(response));
  return readJson(response);
}

function apiHeaders(extra = {}) {
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': API_VERSION,
    ...extra,
  };
}

function createAppJwt(appId, privateKeyValue, now) {
  let key;
  try {
    key = createPrivateKey(privateKeyValue);
    if (key.asymmetricKeyType !== 'rsa') fail('app_key_unavailable');
  } catch {
    fail('app_key_unavailable');
  }
  const issuedAt = Math.floor(now / 1000);
  const header = toBase64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = toBase64Url(JSON.stringify({ iss: appId, iat: issuedAt, exp: issuedAt + 540 }));
  const signingInput = header + '.' + payload;
  let signature;
  try {
    signature = signBytes('RSA-SHA256', Buffer.from(signingInput), key).toString('base64url');
  } catch {
    fail('app_key_unavailable');
  }
  return signingInput + '.' + signature;
}

function normalizePaths(paths) {
  if (!Array.isArray(paths) || paths.length === 0 || paths.length > 100) fail('invalid_scope');
  const normalized = [];
  for (const path of paths) {
    if (typeof path !== 'string' || path.length === 0 || path.length > 1024) fail('invalid_scope');
    if (path.startsWith('/') || /^[A-Za-z]:/.test(path) || path.includes('\\') || /[\u0000-\u001f\u007f]/.test(path)) fail('invalid_scope');
    const segments = path.split('/');
    if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) fail('invalid_scope');
    normalized.push(path);
  }
  return [...new Set(normalized)].sort();
}

function normalizeActionTarget(value) {
  const keys = ['workflowId', 'runId', 'runAttempt', 'failedJobIds', 'requiredIdentity'];
  assertExactKeys(value, new Set(keys), 'invalid_scope');
  if (!parsePositiveInteger(value.workflowId) || !parsePositiveInteger(value.runId)
      || !parsePositiveInteger(value.runAttempt) || !Array.isArray(value.failedJobIds)
      || value.failedJobIds.length < 1 || value.failedJobIds.length > 100
      || value.failedJobIds.some((id) => !parsePositiveInteger(id))
      || new Set(value.failedJobIds).size !== value.failedJobIds.length) fail('invalid_scope');

  let requiredIdentity;
  if (isRecord(value.requiredIdentity) && value.requiredIdentity.type === 'workflow') {
    assertExactKeys(value.requiredIdentity, new Set(['type', 'repositoryId', 'path', 'ref', 'sha']), 'invalid_scope');
    if (!parsePositiveInteger(value.requiredIdentity.repositoryId)
        || typeof value.requiredIdentity.path !== 'string'
        || normalizePaths([value.requiredIdentity.path])[0] !== value.requiredIdentity.path
        || !value.requiredIdentity.path.toLowerCase().startsWith('.github/workflows/')
        || typeof value.requiredIdentity.ref !== 'string' || value.requiredIdentity.ref.length === 0
        || value.requiredIdentity.ref.length > 255 || /[\x00-\x1f\x7f]/.test(value.requiredIdentity.ref)
        || typeof value.requiredIdentity.sha !== 'string' || !SHA_PATTERN.test(value.requiredIdentity.sha)) fail('invalid_scope');
    requiredIdentity = Object.freeze({
      type: 'workflow',
      repositoryId: value.requiredIdentity.repositoryId,
      path: value.requiredIdentity.path,
      ref: value.requiredIdentity.ref,
      sha: value.requiredIdentity.sha.toLowerCase(),
    });
  } else if (isRecord(value.requiredIdentity) && value.requiredIdentity.type === 'check') {
    assertExactKeys(value.requiredIdentity, new Set(['type', 'context', 'appId']), 'invalid_scope');
    if (typeof value.requiredIdentity.context !== 'string' || value.requiredIdentity.context.length === 0
        || value.requiredIdentity.context.length > 255 || /[\x00-\x1f\x7f]/.test(value.requiredIdentity.context)
        || (value.requiredIdentity.appId !== null && !parsePositiveInteger(value.requiredIdentity.appId))) fail('invalid_scope');
    requiredIdentity = Object.freeze({
      type: 'check',
      context: value.requiredIdentity.context,
      appId: value.requiredIdentity.appId,
    });
  } else {
    fail('invalid_scope');
  }

  return Object.freeze({
    workflowId: value.workflowId,
    runId: value.runId,
    runAttempt: value.runAttempt,
    failedJobIds: Object.freeze([...value.failedJobIds].sort((left, right) => left - right)),
    requiredIdentity,
  });
}

function normalizeScope(scope, expectedRepositoryId) {
  const allowedKeys = new Set(['repositoryId', 'prNumber', 'baseSha', 'headSha', 'mergeSha', 'capability', 'paths', 'testedSha', 'actionTarget']);
  assertExactKeys(scope, allowedKeys, 'invalid_scope');
  if (!parsePositiveInteger(scope.repositoryId) || scope.repositoryId !== expectedRepositoryId) fail('invalid_scope');
  if (!parsePositiveInteger(scope.prNumber)) fail('invalid_scope');
  if (!SHA_PATTERN.test(scope.baseSha) || !SHA_PATTERN.test(scope.headSha)) fail('invalid_scope');
  if (scope.mergeSha !== null && !SHA_PATTERN.test(scope.mergeSha)) fail('invalid_scope');
  if (typeof scope.capability !== 'string' || !APPROVAL_CAPABILITIES.has(scope.capability)) fail('invalid_scope');
  if (scope.capability === 'actions:rerun') {
    if (!SHA_PATTERN.test(scope.testedSha) || !Object.hasOwn(scope, 'actionTarget')) fail('invalid_scope');
  } else if (Object.hasOwn(scope, 'testedSha') || Object.hasOwn(scope, 'actionTarget')) {
    fail('invalid_scope');
  }
  return Object.freeze({
    repositoryId: scope.repositoryId,
    prNumber: scope.prNumber,
    baseSha: scope.baseSha.toLowerCase(),
    headSha: scope.headSha.toLowerCase(),
    mergeSha: scope.mergeSha === null ? null : scope.mergeSha.toLowerCase(),
    capability: scope.capability,
    paths: Object.freeze(normalizePaths(scope.paths)),
    ...(scope.capability === 'actions:rerun' ? { testedSha: scope.testedSha.toLowerCase() } : {}),
    ...(scope.capability === 'actions:rerun' ? { actionTarget: normalizeActionTarget(scope.actionTarget) } : {}),
  });
}

function sameScope(left, right) {
  return left.repositoryId === right.repositoryId
    && left.prNumber === right.prNumber
    && left.baseSha === right.baseSha
    && left.headSha === right.headSha
    && left.mergeSha === right.mergeSha
    && left.capability === right.capability
    && left.testedSha === right.testedSha
    && canonicalJson(left.actionTarget) === canonicalJson(right.actionTarget)
    && left.paths.length === right.paths.length
    && left.paths.every((path, index) => path === right.paths[index]);
}

function validateDeviceResponse(value) {
  if (!isRecord(value)
    || typeof value.device_code !== 'string' || value.device_code.length < 1 || value.device_code.length > 4096
    || typeof value.user_code !== 'string' || !/^[A-Z0-9-]{4,32}$/i.test(value.user_code)
    || typeof value.verification_uri !== 'string'
    || !Number.isSafeInteger(value.expires_in) || value.expires_in < 1 || value.expires_in > 3600
    || !Number.isSafeInteger(value.interval) || value.interval < 1 || value.interval > 60) {
    fail('invalid_device_response');
  }

  let uri;
  try {
    uri = new URL(value.verification_uri);
  } catch {
    fail('invalid_device_response');
  }
  if (uri.origin !== GITHUB_ORIGIN || uri.pathname !== '/login/device' || uri.search || uri.hash) {
    fail('invalid_device_response');
  }
  return { ...value, verification_uri: uri.href };
}

export function createGitHubAuthProvider(options) {
  const allowedOptions = new Set([
    'appId',
    'appClientId',
    'installationId',
    'repositoryId',
    'getAppPrivateKey',
    'trustedApproverIds',
    'fetchImpl',
    'prompt',
    'clock',
  ]);
  assertExactKeys(options, allowedOptions);

  const {
    appId,
    appClientId,
    installationId,
    repositoryId,
    getAppPrivateKey,
    trustedApproverIds,
    fetchImpl = globalThis.fetch,
    prompt,
    clock = { now: Date.now, sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)) },
  } = options;

  if (!parsePositiveInteger(appId)
    || typeof appClientId !== 'string' || appClientId.length < 1 || appClientId.length > 200
    || !parsePositiveInteger(installationId)
    || !parsePositiveInteger(repositoryId)
    || typeof getAppPrivateKey !== 'function'
    || !Array.isArray(trustedApproverIds)
    || trustedApproverIds.some((id) => !parsePositiveInteger(id))
    || typeof fetchImpl !== 'function'
    || typeof prompt !== 'function'
    || !isRecord(clock) || typeof clock.now !== 'function' || typeof clock.sleep !== 'function') {
    fail('invalid_configuration');
  }

  const trustedIds = new Set(trustedApproverIds);
  let authenticatedPrincipal;
  let userAccessToken;
  const approvalRecords = new WeakMap();

  async function authenticateApprover() {
    if (prompt.isTTY !== true) fail('interactive_tty_required');

    let deviceResponse;
    try {
      const response = await safeFetch(fetchImpl, GITHUB_ORIGIN + '/login/device/code', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: appClientId }).toString(),
      });
      if (!response.ok) fail(mapHttpError(response));
      deviceResponse = validateDeviceResponse(await readJson(response));
    } catch (error) {
      if (error instanceof GitHubAuthProviderError) throw error;
      fail('authorization_failed');
    }

    const deadline = clock.now() + deviceResponse.expires_in * 1000;
    const promptAccepted = await prompt({
      type: 'device-code',
      verificationUri: deviceResponse.verification_uri,
      userCode: deviceResponse.user_code,
      expiresAt: new Date(deadline).toISOString(),
    });
    if (promptAccepted !== true) fail('authorization_cancelled');

    let interval = deviceResponse.interval * 1000;
    let accessToken;
    while (clock.now() + interval <= deadline) {
      await clock.sleep(interval);
      if (clock.now() >= deadline) break;

      const response = await safeFetch(fetchImpl, GITHUB_ORIGIN + '/login/oauth/access_token', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: appClientId,
          device_code: deviceResponse.device_code,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        }).toString(),
      });
      if (!response.ok) fail(mapHttpError(response));
      const result = await readJson(response);
      if (typeof result.access_token === 'string' && result.access_token.length > 0 && result.access_token.length <= 8192) {
        accessToken = result.access_token;
        break;
      }
      if (result.error === 'authorization_pending') continue;
      if (result.error === 'slow_down') {
        interval += 5000;
        continue;
      }
      if (result.error === 'access_denied') fail('authorization_cancelled');
      if (result.error === 'expired_token') fail('device_flow_expired');
      fail('authorization_failed');
    }
    if (!accessToken) fail('device_flow_expired');

    const principal = await requestJson(fetchImpl, API_ORIGIN + '/user', {
      method: 'GET',
      headers: apiHeaders({ Authorization: 'Bearer ' + accessToken }),
    });
    if (!isRecord(principal) || !parsePositiveInteger(principal.id)
      || typeof principal.login !== 'string' || !/^[A-Za-z0-9-]{1,39}$/.test(principal.login)) {
      fail('invalid_response');
    }
    userAccessToken = accessToken;
    authenticatedPrincipal = Object.freeze({ id: principal.id, login: principal.login });
    return authenticatedPrincipal;
  }

  async function getInstallationToken(capability) {
    if (typeof capability !== 'string' || !Object.hasOwn(CAPABILITY_PERMISSIONS, capability)) fail('invalid_capability');
    let privateKeyValue;
    try {
      privateKeyValue = await getAppPrivateKey();
    } catch {
      fail('app_key_unavailable');
    }
    if (typeof privateKeyValue !== 'string' && !Buffer.isBuffer(privateKeyValue) && !isRecord(privateKeyValue)) {
      fail('app_key_unavailable');
    }
    const jwt = createAppJwt(appId, privateKeyValue, clock.now());
    const permissions = { ...CAPABILITY_PERMISSIONS[capability] };
    const tokenResponse = await requestJson(fetchImpl, API_ORIGIN + '/app/installations/' + installationId + '/access_tokens', {
      method: 'POST',
      headers: apiHeaders({ Authorization: 'Bearer ' + jwt, 'Content-Type': 'application/json' }),
      body: JSON.stringify({ repository_ids: [repositoryId], permissions }),
    });

    if (!isRecord(tokenResponse)
      || typeof tokenResponse.token !== 'string' || tokenResponse.token.length === 0 || tokenResponse.token.length > 8192
      || typeof tokenResponse.expires_at !== 'string'
      || !Number.isFinite(Date.parse(tokenResponse.expires_at))
      || Date.parse(tokenResponse.expires_at) <= clock.now()
      || !isRecord(tokenResponse.permissions)
      || canonicalJson(tokenResponse.permissions) !== canonicalJson(permissions)) {
      fail('token_permissions_mismatch');
    }
    if (tokenResponse.repository_selection !== 'selected'
      || (Array.isArray(tokenResponse.repositories)
        && (tokenResponse.repositories.length !== 1
          || tokenResponse.repositories[0]?.id !== repositoryId))) {
      fail('installation_scope_mismatch');
    }
    return tokenResponse.token;
  }

  async function requestApproval(inputScope) {
    if (prompt.isTTY !== true) fail('interactive_tty_required');
    if (!authenticatedPrincipal || !userAccessToken) fail('approver_not_authenticated');
    if (!trustedIds.has(authenticatedPrincipal.id)) fail('approver_not_trusted');

    const scope = normalizeScope(inputScope, repositoryId);
    const repository = await requestJson(fetchImpl, API_ORIGIN + '/repositories/' + repositoryId, {
      method: 'GET',
      headers: apiHeaders({ Authorization: 'Bearer ' + userAccessToken }),
    });
    if (!isRecord(repository) || repository.id !== repositoryId || !isRecord(repository.permissions)
      || (repository.permissions.push !== true && repository.permissions.admin !== true)) {
      fail('repository_write_required');
    }

    const expiresAtMs = clock.now() + APPROVAL_TTL_MS;
    const expiresAt = new Date(expiresAtMs).toISOString();
    const accepted = await prompt({
      type: 'approval',
      repositoryId,
      repository: typeof repository.full_name === 'string' ? repository.full_name : String(repositoryId),
      prNumber: scope.prNumber,
      revision: { baseSha: scope.baseSha, headSha: scope.headSha, mergeSha: scope.mergeSha },
      capability: scope.capability,
      paths: [...scope.paths],
      ...(scope.testedSha ? { testedSha: scope.testedSha } : {}),
      ...(scope.actionTarget ? { actionTarget: scope.actionTarget } : {}),
      approverId: authenticatedPrincipal.id,
      expiresAt,
    });
    if (accepted !== true) fail('approval_cancelled');

    const approval = Object.create(null);
    Object.defineProperty(approval, 'toJSON', {
      enumerable: false,
      value() {
        fail('invalid_approval');
      },
    });
    Object.freeze(approval);
    approvalRecords.set(approval, {
      id: randomUUID(),
      scope,
      approverId: authenticatedPrincipal.id,
      expiresAtMs,
      consumed: false,
    });
    return approval;
  }

  function consumeApproval(approval, expectedScope) {
    const record = isRecord(approval) ? approvalRecords.get(approval) : undefined;
    if (!record) fail('invalid_approval');
    const normalizedExpectedScope = normalizeScope(expectedScope, repositoryId);
    if (!sameScope(record.scope, normalizedExpectedScope)) fail('approval_scope_mismatch');
    if (clock.now() >= record.expiresAtMs) fail('approval_expired');
    if (record.consumed) fail('approval_replayed');
    if (!authenticatedPrincipal || record.approverId !== authenticatedPrincipal.id) fail('invalid_approval');
    record.consumed = true;
  }

  return Object.freeze({ authenticateApprover, getInstallationToken, requestApproval, consumeApproval });
}
