import { describe, expect, it, vi } from 'vitest';

import { createGitHubAppAuth, GitHubAppAuthError } from '../src/github/app-auth';
import { createGitHubApiClient, GitHubApiError } from '../src/github/api';
import { createGitHubObserver } from '../src/github/observer';

const repositoryId = 123456;
const appId = 5130911;
const installationId = 166381027;
const fixedNow = Date.UTC(2026, 9, 1, 0, 0, 0);

async function privateKeyPem(): Promise<string> {
  const pair = await crypto.subtle.generateKey({
    name: 'RSASSA-PKCS1-v1_5',
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: 'SHA-256',
  }, true, ['sign', 'verify']);
  const encoded = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  let binary = '';
  for (const byte of encoded) binary += String.fromCharCode(byte);
  const base64 = btoa(binary).match(/.{1,64}/gu)?.join('\n') ?? '';
  return '-----BEGIN PRIVATE KEY-----\n' + base64 + '\n-----END PRIVATE KEY-----';
}

function tokenResponse(permissions: Record<string, string>, token = 'ghs_test_installation_token'): Response {
  return Response.json({
    token,
    expires_at: new Date(fixedNow + 60 * 60 * 1000).toISOString(),
    permissions,
    repository_selection: 'selected',
  });
}

const baseSha = 'a'.repeat(40);
const headSha = 'b'.repeat(40);
const mergeSha = 'c'.repeat(40);
const workflowSha = 'd'.repeat(40);
const repository = 'memories-quy-2002/digital-e-shop';

function prSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    number: 264,
    state: 'open',
    draft: false,
    merge_commit_sha: mergeSha,
    updated_at: '2026-10-01T00:00:00.000Z',
    base: { ref: 'main', sha: baseSha, repo: { id: repositoryId, full_name: repository } },
    head: { ref: 'feature/stage0', sha: headSha, repo: { id: repositoryId, full_name: repository } },
    ...overrides,
  };
}

function basePolicyFiles() {
  return {
    'protected-paths.yml': { schemaVersion: 1, high: ['scripts/loop/**'], critical: [] },
    'risk-rules.yml': {
      schemaVersion: 1,
      low: ['docs/**'],
      medium: ['client/src/**', 'server/src/**'],
      high: ['scripts/loop/**'],
      criticalActions: [
        'production_secret_access',
        'production_db_mutation',
        'branch_protection_bypass',
        'direct_push_main',
        'disable_security_checks',
        'production_deployment_promotion',
      ],
    },
    'stop-conditions.yml': {
      schemaVersion: 1,
      maxIterations: 5,
      maxSameFailure: 2,
      maxFlakyRetries: 3,
      maxChangedFiles: 25,
      maxChangedLines: 1000,
      maxWallClockSeconds: 1800,
      tokenLimit: null,
      ciRunLimit: null,
    },
  };
}

function encodedContent(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return { encoding: 'base64', content: btoa(binary) };
}

function observerFixture(options: {
  pullRequests?: Array<Record<string, unknown>>;
  checkRuns?: (sha: string) => unknown[];
  rulesets?: unknown[];
  branchProtection?: unknown;
  failProtection?: boolean;
} = {}) {
  let pullRequestIndex = 0;
  const policyFiles = basePolicyFiles();
  const api = {
    repository,
    repositoryId,
    requestCount: 0,
    requestLimit: 40,
    getPullRequest: vi.fn(async (_number: number) => {
      const values = options.pullRequests ?? [prSnapshot()];
      const value = values[Math.min(pullRequestIndex, values.length - 1)];
      pullRequestIndex += 1;
      return value;
    }),
    getRepository: vi.fn(async () => ({ id: repositoryId, default_branch: 'main' })),
    getRepositoryById: vi.fn(async (id: number) => ({ id, full_name: repository })),
    getBranchProtection: vi.fn(async () => {
      if (options.failProtection) throw new Error('sensitive api failure');
      return options.branchProtection ?? {
        required_status_checks: {
          checks: [{ context: 'required-ci', app_id: 15368 }],
          contexts: ['required-ci'],
          strict: true,
        },
      };
    }),
    getRuleset: vi.fn(async (id: number) => (options.rulesets ?? []).find((item) => (
      typeof item === 'object' && item !== null && (item as { id?: number }).id === id
    )) ?? null),
    getPolicyFile: vi.fn(async (path: string, ref: string) => {
      expect(ref).toBe(baseSha);
      return encodedContent(policyFiles[path as keyof typeof policyFiles]);
    }),
    listRulesets: vi.fn(async () => ({
      items: options.rulesets ?? [],
      collectionStatus: 'complete' as const,
      pageCount: 1,
      itemCount: (options.rulesets ?? []).length,
    })),
    listCommitCheckRuns: vi.fn(async (sha: string) => ({
      items: options.checkRuns?.(sha) ?? [{
        id: sha === mergeSha ? 101 : 102,
        name: 'required-ci',
        app: { id: 15368 },
        head_sha: sha,
        status: 'completed',
        conclusion: 'success',
      }],
      collectionStatus: 'complete' as const,
      pageCount: 1,
      itemCount: 1,
    })),
    listCommitStatuses: vi.fn(async () => ({
      items: [],
      collectionStatus: 'complete' as const,
      pageCount: 1,
      itemCount: 0,
    })),
    listWorkflowRuns: vi.fn(async (sha: string) => ({
      items: [{
        id: 700,
        path: '.github/workflows/required.yml@main',
        repository: { id: repositoryId },
        head_sha: sha,
      }],
      collectionStatus: 'complete' as const,
      pageCount: 1,
      itemCount: 1,
    })),
    listPullRequestFiles: vi.fn(async () => ({
      items: [{ filename: 'client/src/App.tsx', status: 'modified' }],
      collectionStatus: 'complete' as const,
      pageCount: 1,
      itemCount: 1,
    })),
    listPullRequestReviews: vi.fn(async () => ({
      items: [{ state: 'APPROVED' }, { state: 'CHANGES_REQUESTED' }],
      collectionStatus: 'complete' as const,
      pageCount: 1,
      itemCount: 2,
    })),
    listPullRequestReviewComments: vi.fn(async () => ({
      items: [{ body: 'must not be retained' }],
      collectionStatus: 'complete' as const,
      pageCount: 1,
      itemCount: 1,
    })),
    listPullRequestIssueComments: vi.fn(async () => ({
      items: [{ body: 'must not be retained' }],
      collectionStatus: 'complete' as const,
      pageCount: 1,
      itemCount: 1,
    })),
    listOpenPullRequests: vi.fn(async () => ({ items: [], hasNext: false, pageCount: 1 as const })),
  };
  const configuration = {
    appId,
    installationId,
    repositoryId,
    repository,
    privateKey: 'not-used-by-injected-api',
    checkRunName: 'Loop Engineering Stage 0',
  };
  return { api, observer: createGitHubObserver(configuration, api) };
}

describe('GitHub App authentication', () => {
  it('mints a short-lived App JWT and a repository-restricted read token', async () => {
    const pem = await privateKeyPem();
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => tokenResponse({
      metadata: 'read',
      contents: 'read',
      pull_requests: 'read',
      checks: 'read',
      actions: 'read',
      administration: 'read',
    }));
    const auth = createGitHubAppAuth({
      appId,
      installationId,
      repositoryId,
      privateKey: pem,
    }, { fetchImpl, now: () => fixedNow });

    const token = await auth.getInstallationToken('observe');

    expect(token).toBe('ghs_test_installation_token');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe('https://api.github.com/app/installations/' + installationId + '/access_tokens');
    expect(init?.method).toBe('POST');
    expect(init?.redirect).toBe('manual');
    expect(new Headers(init?.headers).get('user-agent')).toBe('Digital-E-Loop-Stage0');
    const jwt = new Headers(init?.headers).get('authorization')?.replace(/^Bearer /u, '');
    expect(jwt).toBeTruthy();
    const payload = JSON.parse(atob(jwt!.split('.')[1]!.replaceAll('-', '+').replaceAll('_', '/'))) as {
      iss: number;
      iat: number;
      exp: number;
    };
    expect(payload).toMatchObject({
      iss: appId,
      iat: Math.floor(fixedNow / 1000) - 60,
      exp: Math.floor(fixedNow / 1000) + 540,
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      repository_ids: [repositoryId],
      permissions: {
        contents: 'read',
        pull_requests: 'read',
        checks: 'read',
        actions: 'read',
        administration: 'read',
      },
    });
  });

  it('accepts the stateless GitHub App installation token format as an opaque secret', async () => {
    const pem = await privateKeyPem();
    const statelessToken = `ghs_${appId}_${'a'.repeat(180)}.${'b'.repeat(170)}.${'c'.repeat(170)}`;
    expect(statelessToken.length).toBeGreaterThan(512);
    expect(statelessToken).toContain('.');

    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => tokenResponse({
      metadata: 'read',
      contents: 'read',
      pull_requests: 'read',
      checks: 'read',
      actions: 'read',
      administration: 'read',
    }, statelessToken));
    const auth = createGitHubAppAuth({
      appId,
      installationId,
      repositoryId,
      privateKey: pem,
    }, { fetchImpl, now: () => fixedNow });

    await expect(auth.getInstallationToken('observe')).resolves.toBe(statelessToken);
  });

  it('classifies forbidden installation-token requests without exposing the response body', async () => {
    const pem = await privateKeyPem();
    const auth = createGitHubAppAuth({
      appId,
      installationId,
      repositoryId,
      privateKey: pem,
    }, {
      fetchImpl: async () => new Response('sensitive github response', { status: 403 }),
      now: () => fixedNow,
    });

    await expect(auth.getInstallationToken('observe')).rejects.toMatchObject({
      code: 'token_request_forbidden',
    } satisfies Partial<GitHubAppAuthError>);
  });

  it('reports an unclassified GitHub HTTP status without exposing its response body', async () => {
    const pem = await privateKeyPem();
    const auth = createGitHubAppAuth({ appId, installationId, repositoryId, privateKey: pem }, {
      fetchImpl: async () => new Response('sensitive github response', { status: 503 }),
      now: () => fixedNow,
    });

    await expect(auth.getInstallationToken('observe')).rejects.toMatchObject({
      code: 'token_request_http_503',
      message: 'token_request_http_503',
    });
  });

  it('classifies a rejected GitHub redirect without following it', async () => {
    const pem = await privateKeyPem();
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null, {
      status: 302,
      headers: { location: 'https://example.invalid/collect' },
    }));
    const auth = createGitHubAppAuth({ appId, installationId, repositoryId, privateKey: pem }, {
      fetchImpl,
      now: () => fixedNow,
    });

    await expect(auth.getInstallationToken('observe')).rejects.toMatchObject({
      code: 'token_request_redirect_rejected',
    });
    expect(fetchImpl.mock.calls[0]?.[1]?.redirect).toBe('manual');
  });

  it('distinguishes GitHub token request timeouts from other network errors', async () => {
    const pem = await privateKeyPem();
    const timedOutAuth = createGitHubAppAuth({ appId, installationId, repositoryId, privateKey: pem }, {
      fetchImpl: async () => { throw new DOMException('sensitive detail', 'TimeoutError'); },
      now: () => fixedNow,
    });
    const networkErrorAuth = createGitHubAppAuth({ appId, installationId, repositoryId, privateKey: pem }, {
      fetchImpl: async () => { throw new TypeError('sensitive network detail'); },
      now: () => fixedNow,
    });

    await expect(timedOutAuth.getInstallationToken('observe')).rejects.toMatchObject({
      code: 'token_request_timeout',
      message: 'token_request_timeout',
    });
    await expect(networkErrorAuth.getInstallationToken('observe')).rejects.toMatchObject({
      code: 'token_request_network_error',
      message: 'token_request_network_error',
    });
  });

  it('uses a separate checks:write token for the report capability only', async () => {
    const pem = await privateKeyPem();
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { permissions: Record<string, string> };
      return tokenResponse({ metadata: 'read', ...body.permissions });
    });
    const auth = createGitHubAppAuth({
      appId,
      installationId,
      repositoryId,
      privateKey: pem,
    }, { fetchImpl, now: () => fixedNow });

    await auth.getInstallationToken('report');

    expect(JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body))).toEqual({
      repository_ids: [repositoryId],
      permissions: { checks: 'write' },
    });
  });

  it('rejects malformed private keys without making an App API request', async () => {
    const fetchImpl = vi.fn();
    const auth = createGitHubAppAuth({
      appId,
      installationId,
      repositoryId,
      privateKey: 'not-a-private-key',
    }, { fetchImpl, now: () => fixedNow });

    await expect(auth.getInstallationToken('observe')).rejects.toMatchObject({ code: 'app_key_invalid' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('fixed GitHub read API client', () => {
  it('sends a descriptive User-Agent when reconciling open pull requests', async () => {
    const requestHeaders: Headers[] = [];
    const api = createGitHubApiClient({
      repository: 'memories-quy-2002/digital-e-shop',
      repositoryId,
      getToken: async () => 'ghs_test',
      fetchImpl: async (_input, init) => {
        requestHeaders.push(new Headers(init?.headers));
        return Response.json([]);
      },
    });

    await expect(api.listOpenPullRequests(1)).resolves.toMatchObject({ items: [], hasNext: false });
    expect(requestHeaders[0]?.get('user-agent')).toBe('Digital-E-Loop-Stage0');
  });

  it('preserves GitHub App auth failures instead of misclassifying them as network errors', async () => {
    const fetchImpl = vi.fn();
    const api = createGitHubApiClient({
      repository: 'memories-quy-2002/digital-e-shop',
      repositoryId,
      getToken: async () => { throw new GitHubAppAuthError('token_response_invalid'); },
      fetchImpl,
    });

    await expect(api.listOpenPullRequests(1)).rejects.toMatchObject({
      code: 'token_response_invalid',
    } satisfies Partial<GitHubAppAuthError>);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('classifies forbidden GitHub API responses separately from generic unavailability', async () => {
    const api = createGitHubApiClient({
      repository: 'memories-quy-2002/digital-e-shop',
      repositoryId,
      getToken: async () => 'ghs_test',
      fetchImpl: async () => new Response('forbidden', { status: 403 }),
    });

    await expect(api.listOpenPullRequests(1)).rejects.toMatchObject({
      code: 'forbidden',
    } satisfies Partial<GitHubApiError>);
  });

  it('rejects redirects on authenticated API calls', async () => {
    const api = createGitHubApiClient({
      repository: 'memories-quy-2002/digital-e-shop',
      repositoryId,
      getToken: async () => 'ghs_test',
      fetchImpl: async () => new Response(null, {
        status: 302,
        headers: { location: 'https://attacker.example/collect' },
      }),
    });

    await expect(api.getPullRequest(264)).rejects.toMatchObject({
      code: 'redirect_rejected',
    } satisfies Partial<GitHubApiError>);
  });

  it('rejects an oversized API response before JSON parsing', async () => {
    const api = createGitHubApiClient({
      repository: 'memories-quy-2002/digital-e-shop',
      repositoryId,
      getToken: async () => 'ghs_test',
      fetchImpl: async () => new Response('x'.repeat(1024 * 1024 + 1)),
    });

    await expect(api.getPullRequest(264)).rejects.toMatchObject({ code: 'response_too_large' });
  });

  it('rejects pagination links that leave the authenticated API origin', async () => {
    const api = createGitHubApiClient({
      repository: 'memories-quy-2002/digital-e-shop',
      repositoryId,
      getToken: async () => 'ghs_test',
      fetchImpl: async () => new Response(JSON.stringify([{ id: 1 }]), {
        headers: {
          link: '<https://attacker.example/pulls/264/reviews?page=2&per_page=100>; rel="next"',
        },
      }),
    });

    await expect(api.listPullRequestReviews(264)).rejects.toMatchObject({ code: 'pagination_rejected' });
  });
});

describe('read-only Stage 0 PR observation', () => {
  it('loads policy at the exact base SHA and binds both check collections to the PR tuple', async () => {
    const { api, observer } = observerFixture();

    const result = await observer.collect(264);

    expect(api.getPolicyFile).toHaveBeenCalledTimes(3);
    expect(api.getPolicyFile.mock.calls.every(([, ref]) => ref === baseSha)).toBe(true);
    expect(result.prSnapshot.headSha).toBe(headSha);
    expect(result.prSnapshot.mergeSha).toBe(mergeSha);
    expect(result.requiredCheckSnapshot.collectionStatus).toBe('complete');
    expect(result.requiredCheckSnapshot.requiredChecks).toEqual([{ context: 'required-ci', appId: 15368 }]);
    expect(result.checkCollectionComplete).toBe(true);
    expect(result.checkObservations).toHaveLength(1);
    expect(result.checkObservations[0]?.testedSha).toBe(mergeSha);
  });

  it('does not count required workflow metadata without a trusted source SHA attestation', async () => {
    const requiredWorkflows = [{
      repository_id: repositoryId,
      path: '.github/workflows/required.yml',
      ref: 'main',
      sha: workflowSha,
    }];
    const { observer } = observerFixture({
      rulesets: [{
        id: 5,
        target: 'branch',
        enforcement: 'active',
        conditions: { ref_name: { include: ['refs/heads/main'], exclude: [] } },
        rules: [{ type: 'required_workflows', parameters: { workflows: requiredWorkflows } }],
      }],
    });

    const result = await observer.collect(264);

    expect(result.requiredCheckSnapshot.requiredWorkflows).toHaveLength(1);
    expect(result.workflowEvidence).toEqual([{
      identity: {
        repositoryId,
        path: '.github/workflows/required.yml',
        ref: 'main',
        sha: workflowSha,
      },
      testedSha: mergeSha,
      status: 'unavailable',
      sourceSha: null,
      reasonCode: 'workflow_source_sha_unattested',
    }]);
  });

  it('marks the snapshot stale and discards checks if the PR tuple changes during collection', async () => {
    const { observer } = observerFixture({
      pullRequests: [prSnapshot(), prSnapshot({
        merge_commit_sha: 'e'.repeat(40),
      })],
    });

    const result = await observer.collect(264);

    expect(result.collectionStatus).toBe('incomplete');
    expect(result.reasonCode).toBe('pr_tuple_changed_during_observation');
    expect(result.checkObservations).toEqual([]);
  });

  it('keeps required check policy unavailable when branch protection cannot be read', async () => {
    const { observer } = observerFixture({ failProtection: true });

    const result = await observer.collect(264);

    expect(result.requiredCheckSnapshot.collectionStatus).toBe('unavailable');
    expect(result.checkCollectionComplete).toBe(false);
  });

  it('preserves duplicate required attempts so the decision core can wait on ambiguous evidence', async () => {
    const { observer } = observerFixture({
      checkRuns: (sha) => [
        { id: 201, name: 'required-ci', app: { id: 15368 }, head_sha: sha, status: 'completed', conclusion: 'success' },
        { id: 202, name: 'required-ci', app: { id: 15368 }, head_sha: sha, status: 'completed', conclusion: 'success' },
      ],
    });

    const result = await observer.collect(264);

    expect(result.checkCollectionComplete).toBe(true);
    expect(result.checkObservations).toHaveLength(2);
    expect(result.checkObservations.map((item) => item.requiredCheckKey)).toEqual([
      'required-ci|app:15368',
      'required-ci|app:15368',
    ]);
  });
});

