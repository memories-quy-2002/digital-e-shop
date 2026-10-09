import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runSourceShaProbe } from '../stage1-source-sha-probe-cli.mjs';
import {
  fetchUpstreamWorkflowRun,
  fetchWorkflowRunPullRequests,
  inspectWorkflowSourceShaEvidence,
  normalizeSourceShaProbeErrorCode,
} from '../stage1-source-sha-probe.mjs';
import { serializeWorkflowSourceDescriptor } from '../workflow-source-descriptor.mjs';

const repository = 'memories-quy-2002/digital-e-shop';
const owner = 'memories-quy-2002';
const expected = Object.freeze({
  repository,
  repositoryId: 743050379,
  workflowId: 368298853,
  path: '.github/workflows/loop-foundation.yml',
});
const testedSha = 'e'.repeat(40);
const sourceSha = 'b'.repeat(40);
const baseSha = 'c'.repeat(40);
const mergeSha = 'a'.repeat(40);
const headBranch = 'feature/stage-1-attestation';

function workflowRun(overrides = {}) {
  return {
    repository: { id: expected.repositoryId },
    id: 12345,
    workflow_id: expected.workflowId,
    path: expected.path,
    event: 'pull_request',
    run_attempt: 2,
    head_sha: mergeSha,
    head_branch: headBranch,
    created_at: '2026-10-07T12:00:00.000Z',
    updated_at: '2026-10-07T12:05:00.000Z',
    ...overrides,
  };
}

function eventPayload(overrides = {}) {
  return {
    repository: { id: expected.repositoryId, full_name: repository },
    workflow_run: {
      id: 12345,
      workflow_id: expected.workflowId,
      path: expected.path,
      event: 'pull_request',
      run_attempt: 2,
      head_sha: mergeSha,
      head_branch: headBranch,
      ...overrides,
    },
  };
}

function pullRequest(overrides = {}) {
  return {
    number: 27,
    base: { ref: 'main', sha: baseSha, repo: { id: expected.repositoryId, full_name: repository } },
    head: { ref: headBranch, sha: testedSha, repo: { id: expected.repositoryId, full_name: repository } },
    merge_commit_sha: mergeSha,
    ...overrides,
  };
}

function certificateClaims({ run = workflowRun(), snapshot = {
  repositoryId: expected.repositoryId,
  number: 27,
  baseSha,
  headSha: testedSha,
  mergeSha,
}, ...overrides } = {}) {
  const runAttempt = run.run_attempt ?? run.runAttempt;
  const testedRevision = run.head_sha ?? run.testedSha;
  const workflowRef = `refs/pull/${snapshot.number}/merge`;
  const signerUri = `https://github.com/${repository}/${expected.path}@${workflowRef}`;
  const descriptor = serializeWorkflowSourceDescriptor({
    repositoryId: expected.repositoryId,
    workflowId: expected.workflowId,
    workflowPath: expected.path,
    workflowRef,
    runId: run.id,
    runAttempt,
    eventName: 'pull_request',
    testedSha: testedRevision.toLowerCase(),
    pullRequest: {
      number: snapshot.number,
      baseSha: snapshot.baseSha,
      headSha: snapshot.headSha,
      mergeSha: snapshot.mergeSha,
    },
  });
  const descriptorSha256 = createHash('sha256').update(descriptor).digest('hex');
  return {
    repositoryId: expected.repositoryId,
    issuer: 'https://token.actions.githubusercontent.com',
    sourceRepositoryIdentifier: String(expected.repositoryId),
    githubWorkflowRepository: repository,
    workflowPath: expected.path,
    githubWorkflowRef: workflowRef,
    githubWorkflowSHA: sourceSha,
    buildSignerDigest: sourceSha,
    workflowId: expected.workflowId,
    testedSha: testedRevision,
    runId: run.id,
    runAttempt,
    subjectAlternativeName: { type: 'URI', value: signerUri },
    buildSignerURI: signerUri,
    runInvocationURI: `https://github.com/${repository}/actions/runs/${run.id}/attempts/${runAttempt}`,
    subjectName: 'digital-e-loop-workflow-source.json',
    subjectDigest: descriptorSha256,
    descriptorSha256,
    verifiedTimestamps: ['2026-10-07T12:02:00.000Z'],
    ...overrides,
  };
}

function inspect(inputs = {}) {
  const {
    event = eventPayload(),
    apiRun = workflowRun(),
    pullRequests = [pullRequest()],
    pullRequestsComplete = true,
    claims = certificateClaims({ run: apiRun }),
    inspectAttestation = async () => claims,
  } = inputs;
  return inspectWorkflowSourceShaEvidence({ event, apiRun, pullRequests, pullRequestsComplete, expected: inputs.expected ?? expected, inspectAttestation });
}

it('reports unavailable for push and old runs', async () => {
  let attestationReads = 0;
  const pushedRun = workflowRun({ event: 'push' });
  const pushed = await inspect({
    event: eventPayload({ event: 'push' }),
    apiRun: pushedRun,
    inspectAttestation: async () => { attestationReads += 1; return certificateClaims({ run: pushedRun }); },
  });
  assert.equal(pushed.status, 'unavailable');
  assert.equal(pushed.sourceShaCandidate, null);

  const oldRun = workflowRun();
  const old = await inspect({
    apiRun: oldRun,
    inspectAttestation: async () => { attestationReads += 1; return null; },
  });
  assert.equal(old.status, 'unavailable');
  assert.equal(old.sourceShaCandidate, null);
  assert.equal(attestationReads, 1, 'push runs must not invoke the attestation verifier');
});

it('reports a certificate-backed candidate for the exact PR run and attempt', async () => {
  let observed;
  const result = await inspect({
    inspectAttestation: async (value) => {
      observed = value;
      return certificateClaims({ run: value.run, snapshot: value.snapshot });
    },
  });

  assert.deepEqual(result, {
    status: 'candidate_present',
    runId: 12345,
    runAttempt: 2,
    workflowId: expected.workflowId,
    path: expected.path,
    testedSha: mergeSha,
    sourceShaCandidate: sourceSha,
  });
  assert.equal(Object.isFrozen(result), true);
  assert.deepEqual(Object.keys(result), [
    'status', 'runId', 'runAttempt', 'workflowId', 'path', 'testedSha', 'sourceShaCandidate',
  ]);
  assert.equal(observed.identity.sha, undefined, 'probe must not receive an allowlisted SHA');
  assert.equal(observed.identity.ref, 'refs/pull/27/merge');
  assert.equal(observed.run.id, 12345);
  assert.equal(observed.run.runAttempt, 2);
  assert.equal(observed.snapshot.baseSha, baseSha);
});

it('rejects duplicate or stale PR associations before certificate inspection', async () => {
  let verifierCalls = 0;
  const duplicate = await inspect({
    pullRequests: [pullRequest(), pullRequest({ number: 28 })],
    inspectAttestation: async () => { verifierCalls += 1; return certificateClaims(); },
  });
  assert.equal(duplicate.status, 'unavailable');
  assert.equal(duplicate.sourceShaCandidate, null);

  const stale = await inspect({
    pullRequests: [pullRequest({
      head: { ref: headBranch, sha: 'f'.repeat(40), repo: { id: expected.repositoryId, full_name: repository } },
      merge_commit_sha: 'd'.repeat(40),
    })],
    inspectAttestation: async () => { verifierCalls += 1; return certificateClaims(); },
  });
  assert.equal(stale.status, 'unavailable');
  assert.equal(stale.sourceShaCandidate, null);
  assert.equal(verifierCalls, 0);
});

it('ignores raw workflow_sha fields and statement predicates', async () => {
  const result = await inspect({
    event: eventPayload({ workflow_sha: 'e'.repeat(40), source_sha: 'invalid' }),
    apiRun: workflowRun({ workflow_sha: 'f'.repeat(40), workflow_source_sha: 'invalid' }),
    claims: certificateClaims({
      run: workflowRun(),
      statement: { predicate: { sourceSha: 'e'.repeat(40), sourceRepositoryDigest: 'attacker-controlled' } },
    }),
  });
  assert.equal(result.status, 'candidate_present');
  assert.equal(result.sourceShaCandidate, sourceSha);
  assert.equal(JSON.stringify(result).includes('statement'), false);
  assert.equal(Object.hasOwn(result, 'sourceSha'), false);
});

it('returns unavailable when signed certificate claims do not bind to the current run', async () => {
  const result = await inspect({
    claims: certificateClaims({ run: workflowRun(), runAttempt: 1 }),
  });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.sourceShaCandidate, null);
});

it('fetches only the fixed upstream run with bounded headers and manual redirects', async () => {
  let request;
  const run = workflowRun();
  const result = await fetchUpstreamWorkflowRun({
    runId: 12345,
    token: 'secret-token',
    fetchImpl: async (...args) => {
      request = args;
      return { ok: true, status: 200, json: async () => run };
    },
  });

  assert.deepEqual(result, run);
  assert.equal(request[0], 'https://api.github.com/repos/memories-quy-2002/digital-e-shop/actions/runs/12345');
  assert.equal(request[1].headers.Authorization, 'Bearer secret-token');
  assert.equal(request[1].redirect, 'manual');
});

it('looks up one page of PRs with the URL-encoded head branch and rejects pagination', async () => {
  let request;
  const pullRequests = [pullRequest()];
  const result = await fetchWorkflowRunPullRequests({
    headBranch,
    token: 'secret-token',
    fetchImpl: async (...args) => {
      request = args;
      return { ok: true, status: 200, headers: new Headers(), json: async () => pullRequests };
    },
  });
  const url = new URL(request[0]);
  assert.equal(url.pathname, '/repos/memories-quy-2002/digital-e-shop/pulls');
  assert.equal(url.searchParams.get('state'), 'all');
  assert.equal(url.searchParams.get('head'), `${owner}:${headBranch}`);
  assert.equal(url.searchParams.get('per_page'), '100');
  assert.equal(result.complete, true);
  assert.deepEqual(result.pullRequests, pullRequests);

  const paginated = await fetchWorkflowRunPullRequests({
    headBranch,
    token: 'secret-token',
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ link: '<https://api.github.com/next>; rel="next"' }),
      json: async () => pullRequests,
    }),
  });
  assert.equal(paginated.complete, false);
});

it('does not inspect events from another repository and returns only bounded metadata', async () => {
  assert.equal(await runSourceShaProbe({ GITHUB_REPOSITORY: 'someone/else' }), null);

  const directory = await mkdtemp(join(tmpdir(), 'source-sha-probe-'));
  const eventPath = join(directory, 'event.json');
  try {
    await writeFile(eventPath, JSON.stringify(eventPayload()));
    const result = await runSourceShaProbe({
      GITHUB_REPOSITORY: repository,
      GITHUB_EVENT_PATH: eventPath,
      GITHUB_TOKEN: 'secret-token',
    }, {
      fetchImpl: async (url) => String(url).includes('/actions/runs/')
        ? { ok: true, status: 200, json: async () => workflowRun() }
        : { ok: true, status: 200, headers: new Headers(), json: async () => [pullRequest()] },
      inspectAttestation: async ({ run, snapshot }) => certificateClaims({ run, snapshot, statement: { predicate: { secret: 'private' } } }),
    });
    assert.equal(result.status, 'candidate_present');
    assert.equal(JSON.stringify(result).includes('private'), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it('assigns a fixed reason code to each existing probe refusal', async () => {
  const cases = [
    ['probe_identity_mismatch', { event: eventPayload({ workflow_id: 1 }) }],
    ['probe_run_mismatch', { apiRun: workflowRun({ run_attempt: 3 }) }],
    ['probe_event_unsupported', { event: eventPayload({ event: 'push' }), apiRun: workflowRun({ event: 'push' }) }],
    ['probe_pr_lookup_invalid', { event: eventPayload({ head_branch: '' }), apiRun: workflowRun({ head_branch: '' }) }],
    ['probe_pr_lookup_incomplete', { pullRequestsComplete: false }],
    ['probe_pr_missing', { pullRequests: [] }],
    ['probe_pr_ambiguous', { pullRequests: [pullRequest(), pullRequest({ number: 28 })] }],
    ['probe_pr_tuple_mismatch', { pullRequests: [pullRequest({ merge_commit_sha: 'd'.repeat(40) })] }],
    ['probe_run_timestamps_invalid', { apiRun: workflowRun({ created_at: 'invalid' }) }],
    ['probe_descriptor_invalid', {
      expected: { ...expected, path: '.github/workflows/bad name.yml' },
      event: { ...eventPayload(), workflow_run: { ...eventPayload().workflow_run, path: '.github/workflows/bad name.yml' } },
      apiRun: workflowRun({ path: '.github/workflows/bad name.yml' }),
    }],
    ['probe_attestation_provider_unavailable', { inspectAttestation: null }],
    ['probe_claims_mismatch', { claims: null }],
  ];

  for (const [reasonCode, inputs] of cases) {
    const result = await inspect(inputs);
    assert.equal(result.status, 'unavailable', reasonCode);
    assert.equal(result.sourceShaCandidate, null, reasonCode);
    assert.equal(result.reasonCode, reasonCode, reasonCode);
  }
});

it('keeps provider errors bounded and shares a fixed error-code allowlist', async () => {
  const sentinel = 'SECRET_SENTINEL_message_stack_cause_code';
  const error = Object.assign(new Error(sentinel), {
    code: sentinel,
    stack: sentinel,
    cause: new Error(sentinel),
  });
  const result = await inspect({ inspectAttestation: async () => { throw error; } });
  assert.equal(result.reasonCode, 'probe_attestation_failed');
  assert.equal(JSON.stringify(result).includes(sentinel), false);

  const known = await inspect({
    inspectAttestation: async () => { throw Object.assign(new Error(sentinel), { code: 'attestation_cli_failed' }); },
  });
  assert.equal(known.reasonCode, 'attestation_cli_failed');
  assert.equal(JSON.stringify(known).includes(sentinel), false);
  assert.equal(normalizeSourceShaProbeErrorCode({ code: 'attestation_cli_failed' }, 'event_invalid'), 'attestation_cli_failed');
  assert.equal(normalizeSourceShaProbeErrorCode({ code: sentinel }, 'event_invalid'), 'event_invalid');
  assert.equal(normalizeSourceShaProbeErrorCode({}, 'event_invalid'), 'event_invalid');
});

it('keeps CLI refusal exits bounded and ignores foreign repositories without output', async () => {
  const script = fileURLToPath(new URL('../stage1-source-sha-probe-cli.mjs', import.meta.url));
  const sentinel = 'SECRET_SENTINEL_cli_environment';
  const refused = spawnSync(process.execPath, [script], {
    encoding: 'utf8',
    env: { ...process.env, GITHUB_REPOSITORY: repository, GITHUB_EVENT_PATH: sentinel, GITHUB_TOKEN: sentinel },
  });
  assert.equal(refused.status, 1);
  assert.equal(refused.stderr.trim(), 'event_invalid');
  assert.equal(refused.stdout, '');
  assert.equal(`${refused.stdout}${refused.stderr}`.includes(sentinel), false);

  const ignored = spawnSync(process.execPath, [script], {
    encoding: 'utf8',
    env: { ...process.env, GITHUB_REPOSITORY: 'someone/else', GITHUB_EVENT_PATH: sentinel, GITHUB_TOKEN: sentinel },
  });
  assert.equal(ignored.status, 0);
  assert.equal(ignored.stdout, '');
  assert.equal(ignored.stderr, '');
});
