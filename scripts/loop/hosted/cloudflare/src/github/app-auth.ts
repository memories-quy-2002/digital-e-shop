export type GitHubCapability = 'observe' | 'report';

export interface GitHubAppCredentials {
  appId: number;
  installationId: number;
  repositoryId: number;
  privateKey: string;
}

export type FetchImplementation = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class GitHubAppAuthError extends Error {
  readonly code:
    | 'configuration_invalid'
    | 'app_key_invalid'
    | 'token_request_failed'
    | 'token_request_unauthorized'
    | 'token_request_forbidden'
    | 'token_request_not_found'
    | 'token_request_unprocessable'
    | 'token_request_rate_limited'
    | 'token_response_invalid'
    | 'token_request_network_error'
    | 'token_request_timeout'
    | 'token_request_redirect_rejected'
    | `token_request_http_${number}`;

  constructor(code: GitHubAppAuthError['code']) {
    super(code);
    this.name = 'GitHubAppAuthError';
    this.code = code;
  }
}

const API_ORIGIN = 'https://api.github.com';
const API_VERSION = '2026-03-10';
export const GITHUB_USER_AGENT = 'Digital-E-Loop-Stage0';
const MAX_KEY_LENGTH = 32 * 1024;
const MAX_TOKEN_RESPONSE_BYTES = 32 * 1024;
const MAX_INSTALLATION_TOKEN_LENGTH = 4096;
const READ_PERMISSIONS = Object.freeze({
  contents: 'read',
  pull_requests: 'read',
  checks: 'read',
  actions: 'read',
  administration: 'read',
});
const REPORT_PERMISSIONS = Object.freeze({ checks: 'write' });
const TOKEN_CACHE_SKEW_MS = 60 * 1000;

interface CachedToken {
  value: string;
  expiresAt: number;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((total, part) => total + part.byteLength, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

function encodeDerLength(length: number): Uint8Array {
  if (length < 128) return Uint8Array.of(length);
  const bytes: number[] = [];
  let remaining = length;
  while (remaining > 0) {
    bytes.unshift(remaining & 0xff);
    remaining >>>= 8;
  }
  return Uint8Array.of(0x80 | bytes.length, ...bytes);
}

function der(tag: number, content: Uint8Array): Uint8Array {
  return concatBytes(Uint8Array.of(tag), encodeDerLength(content.byteLength), content);
}

function pemBytes(privateKey: string): Uint8Array {
  if (privateKey.length < 1 || privateKey.length > MAX_KEY_LENGTH) throw new GitHubAppAuthError('app_key_invalid');
  const match = /^-----BEGIN (PRIVATE KEY|RSA PRIVATE KEY)-----\s+([A-Za-z0-9+/=\r\n]+)\s+-----END \1-----\s*$/.exec(privateKey.trim());
  if (!match) throw new GitHubAppAuthError('app_key_invalid');
  const encoded = match[2].replace(/[\r\n]/g, '');
  if (encoded.length === 0 || encoded.length % 4 !== 0) throw new GitHubAppAuthError('app_key_invalid');
  try {
    const binary = atob(encoded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new GitHubAppAuthError('app_key_invalid');
  }
}

function toPkcs8(privateKey: string): ArrayBuffer {
  const match = /^-----BEGIN (PRIVATE KEY|RSA PRIVATE KEY)-----/.exec(privateKey.trim());
  const bytes = pemBytes(privateKey);
  if (match?.[1] === 'PRIVATE KEY') {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return copy.buffer as ArrayBuffer;
  }

  // GitHub App downloads commonly use PKCS#1; Web Crypto imports PKCS#8.
  const algorithmIdentifier = der(0x30, Uint8Array.of(
    0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01,
    0x05, 0x00,
  ));
  const privateKeyInfo = der(0x30, concatBytes(
    Uint8Array.of(0x02, 0x01, 0x00),
    algorithmIdentifier,
    der(0x04, bytes),
  ));
  const wrapped = new Uint8Array(privateKeyInfo.byteLength);
  wrapped.set(privateKeyInfo);
  return wrapped.buffer as ArrayBuffer;
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function parseConfiguration(config: GitHubAppCredentials): GitHubAppCredentials {
  if (!config || !isPositiveInteger(config.appId) || !isPositiveInteger(config.installationId)
      || !isPositiveInteger(config.repositoryId) || typeof config.privateKey !== 'string'
      || config.privateKey.length === 0 || config.privateKey.length > MAX_KEY_LENGTH) {
    throw new GitHubAppAuthError('configuration_invalid');
  }
  return config;
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const contentLength = response.headers.get('content-length');
  if (contentLength !== null) {
    const declaredLength = Number(contentLength);
    if (!Number.isSafeInteger(declaredLength) || declaredLength < 0 || declaredLength > MAX_TOKEN_RESPONSE_BYTES) {
      throw new GitHubAppAuthError('token_response_invalid');
    }
  }
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_TOKEN_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new GitHubAppAuthError('token_response_invalid');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = concatBytes(...chunks);
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new GitHubAppAuthError('token_response_invalid');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function tokenRequestError(status: number): GitHubAppAuthError {
  if (status === 401) return new GitHubAppAuthError('token_request_unauthorized');
  if (status === 403) return new GitHubAppAuthError('token_request_forbidden');
  if (status === 404) return new GitHubAppAuthError('token_request_not_found');
  if (status === 422) return new GitHubAppAuthError('token_request_unprocessable');
  if (status === 429) return new GitHubAppAuthError('token_request_rate_limited');
  return new GitHubAppAuthError(`token_request_http_${status}`);
}

function isOpaqueInstallationToken(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= MAX_INSTALLATION_TOKEN_LENGTH
    && !/[\x00-\x1f\x7f]/.test(value);
}

function validatePermissions(value: unknown, requested: Readonly<Record<string, string>>): boolean {
  if (!isRecord(value)) return false;
  return Object.entries(requested).every(([name, permission]) => value[name] === permission);
}

export function createGitHubAppAuth(
  inputConfig: GitHubAppCredentials,
  options: { fetchImpl?: FetchImplementation; now?: () => number } = {},
) {
  const config = parseConfiguration(inputConfig);
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const tokens = new Map<GitHubCapability, CachedToken>();
  let importedKey: Promise<CryptoKey> | undefined;

  function getSigningKey(): Promise<CryptoKey> {
    importedKey ??= crypto.subtle.importKey(
      'pkcs8',
      toPkcs8(config.privateKey),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    ).catch(() => {
      throw new GitHubAppAuthError('app_key_invalid');
    });
    return importedKey;
  }

  async function createAppJwt(): Promise<string> {
    const issuedAt = Math.floor(now() / 1000) - 60;
    const header = base64Url(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
    const payload = base64Url(new TextEncoder().encode(JSON.stringify({
      iat: issuedAt,
      exp: issuedAt + 600,
      iss: config.appId,
    })));
    const unsigned = header + '.' + payload;
    const signature = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      await getSigningKey(),
      new TextEncoder().encode(unsigned),
    );
    return unsigned + '.' + base64Url(new Uint8Array(signature));
  }

  async function mintToken(capability: GitHubCapability): Promise<CachedToken> {
    const permissions = capability === 'observe' ? READ_PERMISSIONS : REPORT_PERMISSIONS;
    const appJwt = await createAppJwt();
    const timeoutSignal = AbortSignal.timeout(10_000);
    let response: Response;
    try {
      response = await fetchImpl(API_ORIGIN + '/app/installations/' + config.installationId + '/access_tokens', {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: 'Bearer ' + appJwt,
          'Content-Type': 'application/json',
          'User-Agent': GITHUB_USER_AGENT,
          'X-GitHub-Api-Version': API_VERSION,
        },
        body: JSON.stringify({ repository_ids: [config.repositoryId], permissions }),
        redirect: 'manual',
        signal: timeoutSignal,
      });
    } catch (error) {
      const timedOut = timeoutSignal.aborted
        || (typeof error === 'object' && error !== null && 'name' in error && error.name === 'TimeoutError');
      throw new GitHubAppAuthError(timedOut ? 'token_request_timeout' : 'token_request_network_error');
    }
    if (response.redirected || (response.status >= 300 && response.status < 400)) {
      throw new GitHubAppAuthError('token_request_redirect_rejected');
    }
    if (!response.ok) throw tokenRequestError(response.status);

    const body = await readBoundedJson(response);
    if (!isRecord(body) || !isOpaqueInstallationToken(body.token)
        || typeof body.expires_at !== 'string' || !Number.isFinite(Date.parse(body.expires_at))
        || Date.parse(body.expires_at) <= now() + TOKEN_CACHE_SKEW_MS
        || !validatePermissions(body.permissions, permissions)) {
      throw new GitHubAppAuthError('token_response_invalid');
    }
    return { value: body.token, expiresAt: Date.parse(body.expires_at) };
  }

  return Object.freeze({
    async getInstallationToken(capability: GitHubCapability): Promise<string> {
      if (capability !== 'observe' && capability !== 'report') {
        throw new GitHubAppAuthError('configuration_invalid');
      }
      const cached = tokens.get(capability);
      if (cached && cached.expiresAt > now() + TOKEN_CACHE_SKEW_MS) return cached.value;
      const minted = await mintToken(capability);
      tokens.set(capability, minted);
      return minted.value;
    },
  });
}
