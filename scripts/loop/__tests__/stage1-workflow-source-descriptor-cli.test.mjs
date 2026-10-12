import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { it } from 'node:test';

import { createStage1DispatchDescriptor, writeStage1DispatchDescriptor } from '../stage1-workflow-source-descriptor-cli.mjs';

const baseSha = 'a'.repeat(40);
const headSha = 'b'.repeat(40);
const mergeSha = 'c'.repeat(40);
const environment = {
  GITHUB_REPOSITORY: 'memories-quy-2002/digital-e-shop', GITHUB_REPOSITORY_ID: '743050379',
  GITHUB_API_URL: 'https://api.github.com/', GITHUB_REF: 'refs/heads/main',
  GITHUB_WORKFLOW_REF: 'memories-quy-2002/digital-e-shop/.github/workflows/stage1-trusted-retry.yml@refs/heads/main',
  GITHUB_SHA: baseSha, GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '2',
};
const event = { inputs: { app_id: '15368', base_sha: baseSha, check_run_id: '42', context: 'client',
  head_sha: headSha, merge_sha: mergeSha, policy_fingerprint: 'd'.repeat(64), pr_number: '17',
  request_id: '1'.repeat(32), tested_sha: mergeSha } };
const run = { id: 123, run_attempt: 2, repository: { id: 743050379 }, workflow_id: 77,
  event: 'workflow_dispatch', path: '.github/workflows/stage1-trusted-retry.yml@refs/heads/main',
  head_sha: baseSha, actor: { id: 9988, login: 'digital-e-loop-runner[bot]' } };

it('builds the canonical v2 source descriptor from exact dispatch inputs and run metadata', () => {
  const bytes = createStage1DispatchDescriptor({ environment, event, run });
  const descriptor = JSON.parse(bytes.toString('utf8'));
  assert.equal(descriptor.schemaVersion, 2);
  assert.equal(descriptor.testedSha, baseSha);
  assert.deepEqual(descriptor.dispatchTarget, { number: 17, baseSha, headSha, mergeSha, testedSha: mergeSha,
    context: 'client', appId: 15368, checkRunId: 42, policyFingerprint: 'd'.repeat(64),
    requestId: '1'.repeat(32), actorId: 9988, actorLogin: 'digital-e-loop-runner[bot]' });
});

it('rejects mismatched run identity, source ref, actor, and inputs', () => {
  for (const input of [
    { run: { ...run, id: 124 } },
    { run: { ...run, head_sha: headSha } },
    { run: { ...run, actor: { id: 4, login: 'other[bot]' } } },
    { environment: { ...environment, GITHUB_REF: 'refs/heads/feature' } },
    { event: { inputs: { ...event.inputs, context: 'other' } } },
    { event: { inputs: { ...event.inputs, extra: 'unexpected' } } },
  ]) assert.throws(() => createStage1DispatchDescriptor({ environment: input.environment ?? environment,
    event: input.event ?? event, run: input.run ?? run }));
});

it('retrieves only the current workflow run and writes a private bounded descriptor', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'stage1-descriptor-cli-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const eventPath = path.join(root, 'event.json');
  const outputPath = path.join(root, 'output.txt');
  const runnerTemp = path.join(root, 'runner');
  await mkdir(runnerTemp);
  await writeFile(eventPath, JSON.stringify(event));
  const calls = [];
  const result = await writeStage1DispatchDescriptor({ environment: { ...environment, STAGE1_GITHUB_TOKEN: 'ghs-never-log',
    GITHUB_EVENT_PATH: eventPath, GITHUB_OUTPUT: outputPath, RUNNER_TEMP: runnerTemp },
  fetchImpl: async (url, init) => { calls.push({ url, init }); return new Response(JSON.stringify(run), { status: 200 }); } });
  assert.deepEqual(calls.map(({ url, init }) => [url.href, init.method]), [
    ['https://api.github.com/repos/memories-quy-2002/digital-e-shop/actions/runs/123', 'GET'],
  ]);
  assert.equal((await readFile(result.descriptorPath, 'utf8')).includes('ghs-never-log'), false);
  assert.equal((await readFile(outputPath, 'utf8')).trim(), `sha256=${result.digest}`);
});
