import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it } from 'node:test';
import { runSourceShaProbe } from '../stage1-source-sha-probe-cli.mjs';
import {
  fetchUpstreamWorkflowRun,
  summarizeWorkflowSourceShaEvidence,
} from '../stage1-source-sha-probe.mjs';

const expected = Object.freeze({
  repositoryId: 743050379,
  workflowId: 368298853,
  path: '.github/workflows/loop-foundation.yml',
});
const testedSha = 'a'.repeat(40);
const sourceSha = 'b'.repeat(40);

function evidence({ event = {}, apiRun = {} } = {}) {
  return summarizeWorkflowSourceShaEvidence({ event, apiRun, expected });
}

function matchingInputs() {
  return {
    event: {
      repository: { id: expected.repositoryId },
      workflow_run: {
        id: 12345,
        run_attempt: 2,
        workflow_id: expected.workflowId,
        path: expected.path,
        head_sha: testedSha,
      },
    },
    apiRun: {
      repository: { id: expected.repositoryId },
      id: 12345,
      run_attempt: 2,
      workflow_id: expected.workflowId,
      path: expected.path,
      head_sha: testedSha,
    },
  };
}

it('reports unavailable when matching run evidence has no source SHA candidate', () => {
  const inputs = matchingInputs();
  assert.deepEqual(evidence(inputs), {
    status: 'source_sha_unavailable',
    runId: 12345,
    runAttempt: 2,
    workflowId: expected.workflowId,
    path: expected.path,
    testedSha,
    eventSourceSha: null,
    apiSourceSha: null,
  });
});

it('reports a matching valid source SHA candidate from event and API', () => {
  const inputs = matchingInputs();
  inputs.event.workflow_run.workflow_sha = sourceSha;
  inputs.apiRun.workflow_source_sha = sourceSha.toUpperCase();
  const result = evidence(inputs);
  assert.equal(result.status, 'candidate_present');
  assert.equal(result.eventSourceSha, sourceSha);
  assert.equal(result.apiSourceSha, sourceSha);
});

it('rejects conflicting source SHA candidates', () => {
  const inputs = matchingInputs();
  inputs.event.workflow_run.source_sha = sourceSha;
  inputs.apiRun.source_sha = 'c'.repeat(40);
  assert.equal(evidence(inputs).status, 'source_sha_mismatch');
});

it('returns a metadata-free not-target result for wrong repository or workflow identity', () => {
  const mutations = [
    (inputs) => { inputs.event.repository.id += 1; },
    (inputs) => { inputs.apiRun.repository.id += 1; },
    (inputs) => { inputs.event.workflow_run.workflow_id += 1; },
    (inputs) => { inputs.event.workflow_run.path = 'other.yml'; },
    (inputs) => { inputs.apiRun.workflow_id += 1; },
    (inputs) => { inputs.apiRun.path = 'other.yml'; },
  ];

  for (const mutate of mutations) {
    const inputs = matchingInputs();
    inputs.event.workflow_run.workflow_sha = sourceSha;
    mutate(inputs);
    assert.deepEqual(evidence(inputs), { status: 'not_target' });
  }
});

it('rejects a different run ID, attempt, or tested SHA', () => {
  const mutations = [
    (inputs) => { inputs.apiRun.id += 1; },
    (inputs) => { inputs.apiRun.run_attempt += 1; },
    (inputs) => { inputs.apiRun.head_sha = 'c'.repeat(40); },
    (inputs) => { delete inputs.event.workflow_run.run_attempt; },
  ];

  for (const mutate of mutations) {
    const inputs = matchingInputs();
    mutate(inputs);
    assert.equal(evidence(inputs).status, 'run_identity_mismatch');
  }
});

it('rejects malformed source SHA candidates', () => {
  const inputs = matchingInputs();
  inputs.event.workflow_run.workflow_sha = 'not-a-sha';
  assert.equal(evidence(inputs).status, 'source_sha_mismatch');
});

it('returns a frozen allowlisted result without mutating or exposing input fields', () => {
  const inputs = matchingInputs();
  inputs.event.prompt = 'private';
  inputs.apiRun.log_url = 'https://example.invalid/private';
  const result = evidence(inputs);
  assert.equal(Object.isFrozen(result), true);
  assert.deepEqual(Object.keys(result), [
    'status', 'runId', 'runAttempt', 'workflowId', 'path', 'testedSha', 'eventSourceSha', 'apiSourceSha',
  ]);
  assert.equal('prompt' in result, false);
  assert.equal('log_url' in result, false);
  assert.equal(inputs.event.prompt, 'private');
});

it('fetches only the fixed upstream run with the expected headers and manual redirects', async () => {
  let request;
  const run = { id: 12345 };
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
  assert.deepEqual(request[1], {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer secret-token',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    redirect: 'manual',
  });
});

it('rejects invalid run IDs before making a request', async () => {
  let requestCount = 0;
  for (const runId of [0, -1, '12345', Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(
      fetchUpstreamWorkflowRun({
        runId,
        token: 'secret-token',
        fetchImpl: async () => { requestCount += 1; },
      }),
      (error) => error.code === 'upstream_run_transport_error',
    );
  }
  assert.equal(requestCount, 0);
});

it('rejects redirects and HTTP errors without exposing response bodies or token', async () => {
  for (const response of [
    { ok: false, status: 302, json: async () => ({ secret: 'private-body' }) },
    { ok: false, status: 500, json: async () => ({ secret: 'private-body' }) },
  ]) {
    await assert.rejects(
      fetchUpstreamWorkflowRun({ runId: 12345, token: 'secret-token', fetchImpl: async () => response }),
      (error) => error.code === 'upstream_run_http_error'
        && !error.message.includes('private-body')
        && !error.message.includes('secret-token'),
    );
  }
});

it('maps malformed JSON and transport failures to bounded error codes', async () => {
  await assert.rejects(
    fetchUpstreamWorkflowRun({
      runId: 12345,
      token: 'secret-token',
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw new Error('private-body'); } }),
    }),
    (error) => error.code === 'upstream_run_invalid_json' && !error.message.includes('private-body'),
  );

  await assert.rejects(
    fetchUpstreamWorkflowRun({
      runId: 12345,
      token: 'secret-token',
      fetchImpl: async () => { throw new Error('secret-token transport detail'); },
    }),
    (error) => error.code === 'upstream_run_transport_error'
      && !error.message.includes('secret-token')
      && !error.message.includes('transport detail'),
  );
});

it('does not inspect an event from a different repository', async () => {
  assert.equal(await runSourceShaProbe({ GITHUB_REPOSITORY: 'someone/else' }), null);
});

it('silently ignores a workflow_run event outside the configured target', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'source-sha-probe-'));
  const eventPath = join(directory, 'event.json');
  try {
    await writeFile(eventPath, JSON.stringify({
      repository: { id: expected.repositoryId },
      workflow_run: { id: 12345, workflow_id: expected.workflowId + 1, path: expected.path },
    }));
    assert.equal(await runSourceShaProbe({
      GITHUB_REPOSITORY: 'memories-quy-2002/digital-e-shop',
      GITHUB_EVENT_PATH: eventPath,
    }), null);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it('rejects a target event without a positive safe run ID using a bounded code', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'source-sha-probe-'));
  const eventPath = join(directory, 'event.json');
  try {
    await writeFile(eventPath, JSON.stringify({
      repository: { id: expected.repositoryId },
      workflow_run: { id: '12345', workflow_id: expected.workflowId, path: expected.path },
    }));
    await assert.rejects(
      runSourceShaProbe({
        GITHUB_REPOSITORY: 'memories-quy-2002/digital-e-shop',
        GITHUB_EVENT_PATH: eventPath,
      }),
      (error) => error.code === 'event_invalid',
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
