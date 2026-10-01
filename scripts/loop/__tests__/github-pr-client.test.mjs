import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createGitHubPrClient, GitHubPrClientError } from '../github-pr-client.mjs';

const OWNER = 'octo';
const REPO = 'shop';
const REPOSITORY = OWNER + '/' + REPO;
const REPOSITORY_ID = 7654321;
const PR_NUMBER = 27;
const BASE_SHA = 'a'.repeat(40);
const HEAD_SHA = 'b'.repeat(40);
const MERGE_SHA = 'c'.repeat(40);
const TESTED_SHA = 'd'.repeat(40);
const TOKEN = 'ghs_test_observe_secret';
const WORKFLOW_SHA = 'e'.repeat(40);

function jsonResponse(status, value, headers = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function apiUrl(path) {
  return 'https://api.github.com' + path;
}

function createHarness(options = {}) {
  const calls = [];
  const tokens = [];
  let prReads = 0;
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(input);
    const request = { url, init };
    calls.push(request);
    const overridden = await options.route?.(request, { calls, nextPrRead: () => ++prReads });
    if (overridden) return overridden;

    if (url.pathname === '/graphql') return jsonResponse(200, {
      data: { repository: { pullRequest: {
        baseRefName: 'main',
        baseRefOid: typeof options.graphBaseSha === 'function' ? options.graphBaseSha(prReads) : options.graphBaseSha ?? BASE_SHA,
        headRefName: 'feature/loop',
        headRefOid: options.graphHeadSha ?? HEAD_SHA,
        potentialMergeCommit: options.noMerge ? null : { oid: options.graphMergeSha ?? MERGE_SHA },
        mergeable: options.mergeable ?? 'MERGEABLE',
        isDraft: false,
        state: 'OPEN',
        baseRepository: { databaseId: REPOSITORY_ID, nameWithOwner: REPOSITORY, defaultBranchRef: { name: 'main' } },
        headRepository: { databaseId: REPOSITORY_ID, nameWithOwner: REPOSITORY },
      } } },
    });

    if (url.pathname === '/repos/' + REPOSITORY + '/pulls/' + PR_NUMBER) {
      const n = ++prReads;
      const changed = options.changeTupleAfterPrReads && n > options.changeTupleAfterPrReads;
      const baseSha = changed ? 'f'.repeat(40) : BASE_SHA;
      return jsonResponse(200, {
        number: PR_NUMBER,
        state: 'open',
        draft: false,
        updated_at: '2026-09-28T08:00:00Z',
        base: { ref: 'main', sha: baseSha, repo: { id: REPOSITORY_ID, full_name: REPOSITORY } },
        head: { ref: 'feature/loop', sha: HEAD_SHA, repo: { id: REPOSITORY_ID, full_name: REPOSITORY } },
      });
    }
    if (url.pathname === '/repos/' + REPOSITORY) return jsonResponse(200, {
      id: REPOSITORY_ID,
      full_name: REPOSITORY,
      default_branch: 'main',
    });
    if (url.pathname === '/repos/' + REPOSITORY + '/branches/main/protection') return jsonResponse(404, { message: 'not protected' });
    if (url.pathname === '/repos/' + REPOSITORY + '/rulesets') return jsonResponse(200, []);
    if (url.pathname.endsWith('/check-runs')) return jsonResponse(200, { total_count: 0, check_runs: [] });
    if (url.pathname.endsWith('/status')) return jsonResponse(200, { sha: url.pathname.split('/').at(-2), statuses: [] });
    if (url.pathname.endsWith('/actions/runs')) return jsonResponse(200, { total_count: 0, workflow_runs: [] });
    if (/\/actions\/runs\/\d+\/jobs$/.test(url.pathname)) return jsonResponse(200, { total_count: 0, jobs: [] });
    if (url.pathname.endsWith('/actions/jobs/999/logs')) {
      return new Response('plain log', { status: 200, headers: { 'content-type': 'text/plain' } });
    }
    if (url.pathname.endsWith('/reviews')) return jsonResponse(200, []);
    if (url.pathname.endsWith('/comments')) return jsonResponse(200, []);
    return jsonResponse(404, { message: 'not found' });
  };

  const client = createGitHubPrClient({
    repository: REPOSITORY,
    getToken: async (capability) => {
      tokens.push(capability);
      return TOKEN;
    },
    downloadHostAllowlist: options.downloadHostAllowlist ?? ['logs.example.test'],
    fetchImpl,
  });
  return { client, calls, tokens };
}

function prResponse(overrides = {}) {
  return {
    number: PR_NUMBER,
    state: 'open',
    draft: false,
    updated_at: '2026-09-28T08:00:00Z',
    base: { ref: 'main', sha: BASE_SHA, repo: { id: REPOSITORY_ID, full_name: REPOSITORY } },
    head: { ref: 'feature/loop', sha: HEAD_SHA, repo: { id: REPOSITORY_ID, full_name: REPOSITORY } },
    ...overrides,
  };
}

function checkRun(overrides = {}) {
  return {
    id: 123,
    head_sha: HEAD_SHA,
    name: 'CI required',
    status: 'completed',
    conclusion: 'failure',
    completed_at: '2026-09-28T08:05:00Z',
    check_suite: { id: 88 },
    app: { id: 71, slug: 'github-actions' },
    output: { title: 'TOKEN=ghs_super_secret_value', summary: 'Test failed at test/example.mjs:4' },
    ...overrides,
  };
}

function requiredWorkflow(overrides = {}) {
  return {
    repositoryId: REPOSITORY_ID,
    path: '.github/workflows/ci.yml',
    ref: 'main',
    sha: WORKFLOW_SHA,
    ...overrides,
  };
}

function storedZip(path, text) {
  const name = Buffer.from(path);
  const content = Buffer.from(text);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 6);
  local.writeUInt16LE(0, 8);
  local.writeUInt32LE(content.length, 18);
  local.writeUInt32LE(content.length, 22);
  local.writeUInt16LE(name.length, 26);
  const localEntry = Buffer.concat([local, name, content]);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0, 8);
  central.writeUInt16LE(0, 10);
  central.writeUInt32LE(content.length, 20);
  central.writeUInt32LE(content.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(0, 42);
  const centralEntry = Buffer.concat([central, name]);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(centralEntry.length, 12);
  end.writeUInt32LE(localEntry.length, 16);
  return Buffer.concat([localEntry, centralEntry, end]);
}

describe('strict GitHub PR read adapter', () => {
  it('pins repository identity and cross-checks REST PR revisions with GraphQL', async () => {
    const { client, calls, tokens } = createHarness();

    const snapshot = await client.getPullRequest(PR_NUMBER);

    assert.equal(snapshot.repository, REPOSITORY);
    assert.equal(snapshot.repositoryId, REPOSITORY_ID);
    assert.equal(snapshot.baseSha, BASE_SHA);
    assert.equal(snapshot.headSha, HEAD_SHA);
    assert.equal(snapshot.mergeSha, MERGE_SHA);
    assert.equal(snapshot.mergeability, 'MERGEABLE');
    assert.deepEqual(tokens, ['observe', 'observe']);
    assert.ok(calls.every((call) => call.url.origin === 'https://api.github.com'));
    assert.ok(calls.every((call) => call.init.redirect === 'manual'));
    assert.ok(calls.every((call) => call.init.headers.Authorization === 'Bearer ' + TOKEN));
    assert.ok(calls.every((call) => call.init.headers['X-GitHub-Api-Version'] === '2026-03-10'));
  });

  it('collects bounded changed-file evidence against one fresh PR revision tuple', async () => {
    const { client, calls, tokens } = createHarness({
      route: ({ url }) => url.pathname.endsWith('/pulls/' + PR_NUMBER + '/files')
        ? jsonResponse(200, [
          { filename: '.github/workflows/ci.yml', status: 'modified' },
          { filename: 'src/app.mjs', status: 'modified' },
        ])
        : undefined,
    });
    await client.getPullRequest(PR_NUMBER);

    const files = await client.getPullRequestFiles(PR_NUMBER);

    assert.equal(files.status, 'current');
    assert.equal(files.collectionStatus, 'complete');
    assert.equal(files.snapshot.headSha, HEAD_SHA);
    assert.deepEqual(files.files.map((file) => file.filename), ['.github/workflows/ci.yml', 'src/app.mjs']);
    assert.ok(calls.some((call) => call.url.pathname === '/repos/' + REPOSITORY + '/pulls/' + PR_NUMBER + '/files'));
    assert.ok(tokens.every((capability) => capability === 'observe'));
  });

  it('marks changed-file evidence stale when the PR tuple changes during pagination', async () => {
    const { client } = createHarness({
      changeTupleAfterPrReads: 2,
      graphBaseSha: (prReads) => prReads > 2 ? 'f'.repeat(40) : BASE_SHA,
      route: ({ url }) => url.pathname.endsWith('/pulls/' + PR_NUMBER + '/files')
        ? jsonResponse(200, [{ filename: 'src/app.mjs', status: 'modified' }])
        : undefined,
    });
    await client.getPullRequest(PR_NUMBER);

    const files = await client.getPullRequestFiles(PR_NUMBER);

    assert.equal(files.status, 'stale');
    assert.equal(files.reasonCode, 'pr_tuple_changed');
    assert.deepEqual(files.files, []);
  });

  it('rejects non-GitHub origins and repository identity mismatches', async () => {
    assert.throws(
      () => createGitHubPrClient({ repository: REPOSITORY, getToken: async () => TOKEN, apiOrigin: 'http://attacker.test' }),
      (error) => error instanceof GitHubPrClientError && error.code === 'invalid_configuration',
    );
    assert.throws(
      () => createGitHubPrClient({ repository: REPOSITORY, getToken: async () => TOKEN, graphqlOrigin: 'https://attacker.test/graphql' }),
      (error) => error instanceof GitHubPrClientError && error.code === 'invalid_configuration',
    );

    const { client } = createHarness({
      route: ({ url }) => url.pathname.endsWith('/pulls/' + PR_NUMBER)
        ? jsonResponse(200, prResponse({ base: { ref: 'main', sha: BASE_SHA, repo: { id: 9, full_name: 'attacker/repo' } } }))
        : undefined,
    });
    await assert.rejects(client.getPullRequest(PR_NUMBER), (error) => error.code === 'repository_mismatch');
  });

  it('refuses API redirects without forwarding credentials to another host', async () => {
    const { client, calls } = createHarness({
      route: ({ url }) => url.pathname.endsWith('/pulls/' + PR_NUMBER)
        ? new Response(null, { status: 302, headers: { location: 'https://attacker.test/steal' } })
        : undefined,
    });

    await assert.rejects(client.getPullRequest(PR_NUMBER), (error) => error.code === 'redirect_rejected');
    assert.equal(calls.length, 2);
    assert.ok(calls.every((call) => call.url.origin === 'https://api.github.com'));
    assert.equal(calls[0].url.origin, 'https://api.github.com');
    assert.equal(calls[0].init.redirect, 'manual');
  });

  it('marks unrelated tested SHAs stale without making check API calls', async () => {
    const { client, calls } = createHarness();
    await client.getPullRequest(PR_NUMBER);
    const before = calls.length;

    const result = await client.getCommitCheckRuns(TESTED_SHA);

    assert.equal(result.status, 'stale');
    assert.equal(result.reasonCode, 'tested_sha_mismatch');
    assert.equal(result.observations.length, 0);
    assert.equal(calls.slice(before).some((call) => call.url.pathname.endsWith('/check-runs')), false);
  });

  it('returns normalized failures bound to base, head, merge, and tested SHAs', async () => {
    const { client } = createHarness({
      route: ({ url }) => url.pathname.endsWith('/check-runs')
        ? jsonResponse(200, { total_count: 1, check_runs: [checkRun()] })
        : undefined,
    });
    await client.getPullRequest(PR_NUMBER);

    const result = await client.getCommitCheckRuns(HEAD_SHA);

    assert.equal(result.collectionStatus, 'complete');
    const failure = result.observations.find((item) => item.checkId === 'check:123');
    assert.ok(failure);
    assert.equal(failure.headSha, HEAD_SHA);
    assert.equal(failure.baseSha, BASE_SHA);
    assert.equal(failure.mergeSha, MERGE_SHA);
    assert.equal(failure.testedSha, HEAD_SHA);
    assert.equal(failure.requiredCheckKey, 'CI required|app:71');
    assert.match(failure.failureFingerprint, /^[a-f0-9]{64}$/);
    assert.equal(JSON.stringify(failure).includes('ghs_super_secret_value'), false);
  });

  it('marks a paginated check collection incomplete when a later page fails', async () => {
    const { client, calls } = createHarness({
      route: ({ url }) => {
        if (!url.pathname.endsWith('/check-runs')) return undefined;
        if (url.searchParams.get('page') === '2') return jsonResponse(403, { message: 'private error body' });
        return jsonResponse(200, { total_count: 1, check_runs: [checkRun({ conclusion: 'success' })] }, {
          link: '<' + apiUrl(url.pathname + '?per_page=100&page=2') + '>; rel="next"',
        });
      },
    });
    await client.getPullRequest(PR_NUMBER);

    const result = await client.getCommitCheckRuns(HEAD_SHA);

    assert.equal(result.collectionStatus, 'incomplete');
    assert.equal(result.checkCollectionComplete, false);
    assert.equal(result.observations.length, 1);
    assert.equal(calls.some((call) => call.url.searchParams.get('page') === '2'), true);
  });

  it('uses the current GraphQL merge SHA and never accepts an obsolete REST-only merge SHA', async () => {
    const { client } = createHarness({ noMerge: true });
    const snapshot = await client.getPullRequest(PR_NUMBER);
    assert.equal(snapshot.mergeSha, null);
    assert.equal(snapshot.mergeability, 'UNKNOWN');

    const result = await client.getCommitCheckRuns(MERGE_SHA);
    assert.equal(result.status, 'stale');
    assert.equal(result.reasonCode, 'tested_sha_mismatch');
  });

  it('loads branch protection and active rulesets, preserving exact required check and workflow identities', async () => {
    const { client } = createHarness({
      route: ({ url }) => {
        if (url.pathname.endsWith('/branches/main/protection')) {
          return jsonResponse(200, { required_status_checks: {
            contexts: ['legacy CI'],
            checks: [{ context: 'CI required', app_id: 71 }],
          } });
        }
        if (url.pathname.endsWith('/rulesets')) return jsonResponse(200, [{ id: 441 }]);
        if (url.pathname.endsWith('/rulesets/441')) return jsonResponse(200, {
          id: 441,
          target: 'branch',
          enforcement: 'active',
          conditions: { ref_name: { include: ['refs/heads/main'], exclude: [] } },
          rules: [{ type: 'required_workflows', parameters: { workflows: [{
            repository_id: REPOSITORY_ID,
            path: '.github/workflows/ci.yml',
            ref: 'main',
            sha: WORKFLOW_SHA,
          }] } }],
        });
        return undefined;
      },
    });
    await client.getPullRequest(PR_NUMBER);

    const snapshot = await client.getRequiredCheckSnapshot({ baseRef: 'main', headSha: HEAD_SHA });

    assert.equal(snapshot.collectionStatus, 'complete');
    assert.deepEqual(snapshot.requiredChecks, [
      { context: 'CI required', appId: 71 },
      { context: 'legacy CI', appId: null },
    ]);
    assert.deepEqual(snapshot.requiredWorkflows, [requiredWorkflow()]);
    assert.match(snapshot.policyFingerprint, /^[a-f0-9]{64}$/);
  });

  it('does not duplicate a fine-grained required check as a legacy context', async () => {
    const { client } = createHarness({
      route: ({ url }) => {
        if (url.pathname.endsWith('/branches/main/protection')) {
          return jsonResponse(200, { required_status_checks: {
            contexts: ['client'],
            checks: [{ context: 'client', app_id: 15368 }],
          } });
        }
        return undefined;
      },
    });
    await client.getPullRequest(PR_NUMBER);

    const snapshot = await client.getRequiredCheckSnapshot({ baseRef: 'main', headSha: HEAD_SHA });

    assert.deepEqual(snapshot.requiredChecks, [
      { context: 'client', appId: 15368 },
    ]);
  });

  it('evaluates ruleset branch include and exclude patterns without dropping matching policy', async () => {
    const { client } = createHarness({
      route: ({ url }) => {
        if (url.pathname.endsWith('/rulesets')) return jsonResponse(200, [{ id: 501 }, { id: 502 }]);
        if (url.pathname.endsWith('/rulesets/501')) return jsonResponse(200, {
          id: 501,
          target: 'branch',
          enforcement: 'active',
          conditions: {
            ref_name: { include: ['refs/heads/main'], exclude: ['refs/heads/release/**'] },
            repository_name: { include: ['*'], exclude: [] },
          },
          rules: [{ type: 'required_status_checks', parameters: { required_status_checks: [{ context: 'main-check', integration_id: 70 }] } }],
        });
        if (url.pathname.endsWith('/rulesets/502')) return jsonResponse(200, {
          id: 502,
          target: 'branch',
          enforcement: 'active',
          conditions: { ref_name: { include: ['refs/heads/release/**'], exclude: [] } },
          rules: [{ type: 'required_status_checks', parameters: { required_status_checks: [{ context: 'release-only', integration_id: 70 }] } }],
        });
        return undefined;
      },
    });
    await client.getPullRequest(PR_NUMBER);

    const snapshot = await client.getRequiredCheckSnapshot({ baseRef: 'main', headSha: HEAD_SHA });

    assert.equal(snapshot.collectionStatus, 'complete');
    assert.deepEqual(snapshot.requiredChecks, [{ context: 'main-check', appId: 70 }]);
  });

  it('keeps required workflow evidence unavailable without source-SHA attestation, even for a matching-looking run', async () => {
    const { client } = createHarness({
      route: ({ url }) => url.pathname.endsWith('/actions/runs')
        ? jsonResponse(200, { total_count: 1, workflow_runs: [{
          id: 81,
          repository: { id: REPOSITORY_ID },
          path: '.github/workflows/ci.yml@main',
          head_sha: HEAD_SHA,
          status: 'completed',
          conclusion: 'success',
          run_attempt: 1,
        }] })
        : undefined,
    });
    await client.getPullRequest(PR_NUMBER);

    const evidence = await client.getRequiredWorkflowEvidence(requiredWorkflow(), HEAD_SHA);

    assert.equal(evidence.status, 'unavailable');
    assert.equal(evidence.reasonCode, 'workflow_source_sha_unattested');
    assert.equal(evidence.testedSha, HEAD_SHA);
    assert.equal(evidence.sourceSha, null);
    assert.equal(evidence.requiredWorkflowKey, 'workflow|repo:7654321|path:.github%2Fworkflows%2Fci.yml|ref:main|sha:' + WORKFLOW_SHA);
  });

  it('does not treat a truncated page without a next link as a complete workflow collection', async () => {
    const { client } = createHarness({
      route: ({ url }) => url.pathname.endsWith('/actions/runs')
        ? jsonResponse(200, { total_count: 2, workflow_runs: [{
          id: 82,
          repository: { id: REPOSITORY_ID },
          path: '.github/workflows/ci.yml@main',
          head_sha: HEAD_SHA,
          status: 'completed',
          conclusion: 'success',
          run_attempt: 1,
        }] })
        : undefined,
    });
    await client.getPullRequest(PR_NUMBER);

    const result = await client.getWorkflowRuns(HEAD_SHA);

    assert.equal(result.collectionStatus, 'incomplete');
    assert.equal(result.checkCollectionComplete, false);
    assert.equal(result.runs.length, 1);
  });

  it('marks required policy unavailable when a ruleset source is inaccessible or a workflow lacks its source SHA', async () => {
    const inaccessible = createHarness({
      route: ({ url }) => {
        if (url.pathname.endsWith('/rulesets')) return jsonResponse(200, [{ id: 442 }]);
        if (url.pathname.endsWith('/rulesets/442')) return jsonResponse(403, { message: 'not visible' });
        return undefined;
      },
    });
    await inaccessible.client.getPullRequest(PR_NUMBER);
    const hiddenPolicy = await inaccessible.client.getRequiredCheckSnapshot({ baseRef: 'main', headSha: HEAD_SHA });
    assert.equal(hiddenPolicy.collectionStatus, 'unavailable');

    const missingSha = createHarness({
      route: ({ url }) => {
        if (url.pathname.endsWith('/rulesets')) return jsonResponse(200, [{ id: 443 }]);
        if (url.pathname.endsWith('/rulesets/443')) return jsonResponse(200, {
          id: 443,
          target: 'branch',
          enforcement: 'active',
          rules: [{ type: 'required_workflows', parameters: { workflows: [{
            repository_id: REPOSITORY_ID,
            path: '.github/workflows/ci.yml',
            ref: 'main',
          }] } }],
        });
        return undefined;
      },
    });
    await missingSha.client.getPullRequest(PR_NUMBER);
    const malformedPolicy = await missingSha.client.getRequiredCheckSnapshot({ baseRef: 'main', headSha: HEAD_SHA });
    assert.equal(malformedPolicy.collectionStatus, 'unavailable');
    assert.deepEqual(malformedPolicy.requiredWorkflows, []);
  });

  it('marks policy unavailable when a cross-repository required workflow source cannot be read', async () => {
    const { client } = createHarness({
      route: ({ url }) => {
        if (url.pathname.endsWith('/rulesets')) return jsonResponse(200, [{ id: 445 }]);
        if (url.pathname.endsWith('/rulesets/445')) return jsonResponse(200, {
          id: 445,
          target: 'branch',
          enforcement: 'active',
          conditions: { ref_name: { include: ['refs/heads/main'], exclude: [] } },
          rules: [{ type: 'required_workflows', parameters: { workflows: [{
            repository_id: 112233,
            path: '.github/workflows/shared.yml',
            ref: 'main',
            sha: WORKFLOW_SHA,
          }] } }],
        });
        if (url.pathname === '/repositories/112233') return jsonResponse(404, { message: 'not readable' });
        return undefined;
      },
    });
    await client.getPullRequest(PR_NUMBER);

    const snapshot = await client.getRequiredCheckSnapshot({ baseRef: 'main', headSha: HEAD_SHA });

    assert.equal(snapshot.collectionStatus, 'unavailable');
    assert.equal(snapshot.requiredWorkflows.length, 1);
  });

  it('marks ruleset applicability unavailable when the configured default branch cannot be verified', async () => {
    const { client } = createHarness({
      route: ({ url }) => {
        if (url.pathname === '/repos/' + REPOSITORY) return jsonResponse(200, { id: REPOSITORY_ID, full_name: REPOSITORY });
        if (url.pathname.endsWith('/rulesets')) return jsonResponse(200, [{ id: 444 }]);
        if (url.pathname.endsWith('/rulesets/444')) return jsonResponse(200, {
          id: 444,
          target: 'branch',
          enforcement: 'active',
          conditions: { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } },
          rules: [{ type: 'required_status_checks', parameters: { required_status_checks: [{ context: 'default-only', integration_id: 70 }] } }],
        });
        return undefined;
      },
    });
    await client.getPullRequest(PR_NUMBER);

    const snapshot = await client.getRequiredCheckSnapshot({ baseRef: 'main', headSha: HEAD_SHA });

    assert.equal(snapshot.collectionStatus, 'unavailable');
  });

  it('discards mixed-SHA observations when the PR tuple changes during collection', async () => {
    const { client } = createHarness({
      changeTupleAfterPrReads: 2,
      graphBaseSha: (prReads) => prReads > 2 ? 'f'.repeat(40) : BASE_SHA,
    });
    await client.getPullRequest(PR_NUMBER);

    const result = await client.getCommitCheckRuns(HEAD_SHA);

    assert.equal(result.status, 'stale');
    assert.equal(result.reasonCode, 'pr_tuple_changed');
    assert.deepEqual(result.observations, []);
  });

  it('rejects oversized GitHub JSON payloads with a stable typed error', async () => {
    const { client } = createHarness({
      route: ({ url }) => url.pathname.endsWith('/pulls/' + PR_NUMBER)
        ? new Response('{}', { status: 200, headers: { 'content-length': '2000000' } })
        : undefined,
    });
    await assert.rejects(client.getPullRequest(PR_NUMBER),
      (error) => error instanceof GitHubPrClientError && error.code === 'response_too_large');
  });

  it('maps authentication, permission, rate-limit, and network failures to stable typed errors', async () => {
    for (const [status, headers, code] of [
      [401, {}, 'unauthorized'],
      [403, {}, 'forbidden'],
      [403, { 'x-ratelimit-remaining': '0' }, 'rate_limited'],
      [429, {}, 'rate_limited'],
    ]) {
      const { client } = createHarness({
        route: ({ url }) => url.pathname.endsWith('/pulls/' + PR_NUMBER)
          ? jsonResponse(status, { message: 'do not echo this response' }, headers)
          : undefined,
      });
      await assert.rejects(client.getPullRequest(PR_NUMBER), (error) => error.code === code && !error.message.includes('response'));
    }
    const { client } = createHarness({
      route: ({ url }) => url.pathname.endsWith('/pulls/' + PR_NUMBER) ? Promise.reject(new Error(TOKEN)) : undefined,
    });
    await assert.rejects(client.getPullRequest(PR_NUMBER),
      (error) => error instanceof GitHubPrClientError && error.code === 'network_error' && !error.message.includes(TOKEN));
  });

  it('returns only review metadata and never returns review or comment bodies', async () => {
    const { client } = createHarness({
      route: ({ url }) => {
        if (url.pathname.endsWith('/reviews')) return jsonResponse(200, [{
          id: 5,
          user: { id: 91, login: 'reviewer' },
          state: 'COMMENTED',
          submitted_at: '2026-09-28T08:10:00Z',
          commit_id: HEAD_SHA,
          body: 'private review body',
        }]);
        if (url.pathname.endsWith('/comments')) return jsonResponse(200, [{
          id: 7,
          pull_request_review_id: 5,
          user: { id: 91, login: 'reviewer' },
          created_at: '2026-09-28T08:11:00Z',
          updated_at: '2026-09-28T08:11:00Z',
          commit_id: HEAD_SHA,
          path: 'scripts/loop/github-pr-client.mjs',
          line: 12,
          body: 'private comment body',
        }]);
        return undefined;
      },
    });

    const metadata = await client.getReviewMetadata(PR_NUMBER);
    const serialized = JSON.stringify(metadata);

    assert.equal(metadata.reviews[0].author.login, 'reviewer');
    assert.equal(metadata.reviewComments[0].path, 'scripts/loop/github-pr-client.mjs');
    assert.equal(serialized.includes('private review body'), false);
    assert.equal(serialized.includes('private comment body'), false);
  });

  it('follows job-log redirects only to configured HTTPS hosts without auth or cookies, then redacts and truncates', async () => {
    const { client, calls } = createHarness({
      route: ({ url }) => {
        if (url.pathname.endsWith('/actions/jobs/999/logs')) return new Response(null, {
          status: 302,
          headers: { location: 'https://logs.example.test/download?token=signed-secret' },
        });
        if (url.origin === 'https://logs.example.test') return new Response('TOKEN=ghs_very_secret_token_value\nextra output', {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        });
        return undefined;
      },
    });

    const result = await client.getJobLog(999, { maxBytes: 20 });
    const download = calls.find((call) => call.url.origin === 'https://logs.example.test');

    assert.ok(download);
    assert.equal(download.init.headers.Authorization, undefined);
    assert.equal(download.init.headers.Cookie, undefined);
    assert.equal(JSON.stringify(result).includes('signed-secret'), false);
    assert.equal(JSON.stringify(result).includes('ghs_very_secret_token_value'), false);
    assert.equal(result.truncated, true);
  });

  it('rejects unapproved log hosts and redirect chains', async () => {
    const offHost = createHarness({
      route: ({ url }) => url.pathname.endsWith('/actions/jobs/999/logs')
        ? new Response(null, { status: 302, headers: { location: 'https://attacker.test/download' } })
        : undefined,
    });
    await assert.rejects(offHost.client.getJobLog(999), (error) => error.code === 'log_redirect_rejected');

    const chain = createHarness({
      route: ({ url }) => {
        if (url.pathname.endsWith('/actions/jobs/999/logs')) {
          return new Response(null, { status: 302, headers: { location: 'https://logs.example.test/download' } });
        }
        if (url.origin === 'https://logs.example.test') {
          return new Response(null, { status: 302, headers: { location: 'https://logs.example.test/second' } });
        }
        return undefined;
      },
    });
    await assert.rejects(chain.client.getJobLog(999), (error) => error.code === 'redirect_rejected');
  });

  it('reads bounded ZIP job logs and redacts secrets before returning entries', async () => {
    const archive = storedZip('job/1.txt', 'Authorization: Bearer ghs_zip_secret_value\nRun failed');
    const { client } = createHarness({
      route: ({ url }) => {
        if (url.pathname.endsWith('/actions/jobs/999/logs')) return new Response(null, {
          status: 302,
          headers: { location: 'https://logs.example.test/archive.zip' },
        });
        if (url.origin === 'https://logs.example.test') return new Response(archive, {
          status: 200,
          headers: { 'content-type': 'application/zip' },
        });
        return undefined;
      },
    });

    const result = await client.getJobLog(999);

    assert.equal(result.files.length, 1);
    assert.equal(result.files[0].path, 'job/1.txt');
    assert.equal(result.files[0].text.includes('ghs_zip_secret_value'), false);
    assert.equal(result.files[0].text.includes('Authorization: [REDACTED]'), true);
  });
});
