import { createHash } from 'node:crypto';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { serializeWorkflowSourceDescriptor } from './workflow-source-descriptor.mjs';

const REPOSITORY = 'memories-quy-2002/digital-e-shop';
const REPOSITORY_ID = 743050379;
const WORKFLOW_PATH = '.github/workflows/stage1-trusted-retry.yml';
const WORKFLOW_REF = 'refs/heads/main';
const ACTOR_LOGIN = 'digital-e-loop-runner[bot]';
const INPUT_KEYS = Object.freeze([
  'app_id', 'base_sha', 'check_run_id', 'context', 'head_sha', 'merge_sha', 'policy_fingerprint',
  'pr_number', 'request_id', 'tested_sha',
]);
const SHA = /^[a-f0-9]{40}$/i;
const POSITIVE = /^[1-9][0-9]{0,14}$/;

function fail() { throw new Error('stage1_source_descriptor_unavailable'); }
function isPositive(value) { return Number.isSafeInteger(value) && value > 0; }

export function createStage1DispatchDescriptor({ environment, event, run } = {}) {
  if (!environment || typeof environment !== 'object' || !event || typeof event !== 'object'
    || !run || typeof run !== 'object') fail();
  const apiUrl = new URL(environment.GITHUB_API_URL ?? '');
  if (environment.GITHUB_REPOSITORY !== REPOSITORY || Number(environment.GITHUB_REPOSITORY_ID) !== REPOSITORY_ID
    || apiUrl.origin !== 'https://api.github.com' || apiUrl.pathname !== '/' || apiUrl.search || apiUrl.hash
    || environment.GITHUB_REF !== WORKFLOW_REF
    || environment.GITHUB_WORKFLOW_REF !== `${REPOSITORY}/${WORKFLOW_PATH}@${WORKFLOW_REF}`
    || !SHA.test(environment.GITHUB_SHA ?? '') || !POSITIVE.test(environment.GITHUB_RUN_ID ?? '')
    || !POSITIVE.test(environment.GITHUB_RUN_ATTEMPT ?? '')) fail();

  const inputs = event.inputs;
  if (!inputs || Object.keys(inputs).length !== INPUT_KEYS.length
    || Object.keys(inputs).some((key) => !INPUT_KEYS.includes(key))) fail();
  const { app_id: appId, base_sha: baseSha, check_run_id: checkRunId, context, head_sha: headSha,
    merge_sha: mergeShaInput, policy_fingerprint: policyFingerprint, pr_number: prNumber,
    request_id: requestId, tested_sha: testedSha } = inputs;
  if (appId !== '15368' || !POSITIVE.test(prNumber ?? '') || !POSITIVE.test(checkRunId ?? '')
    || !SHA.test(baseSha ?? '') || !SHA.test(headSha ?? '') || (mergeShaInput !== '' && !SHA.test(mergeShaInput ?? ''))
    || !SHA.test(testedSha ?? '') || !['client', 'server'].includes(context)
    || !/^[a-f0-9]{64}$/i.test(policyFingerprint ?? '') || !/^[a-f0-9]{32}$/.test(requestId ?? '')
    || environment.GITHUB_SHA !== baseSha || (testedSha !== headSha && testedSha !== mergeShaInput)) fail();

  const runId = Number(environment.GITHUB_RUN_ID);
  const runAttempt = Number(environment.GITHUB_RUN_ATTEMPT);
  if (run.id !== runId || run.run_attempt !== runAttempt || run.repository?.id !== REPOSITORY_ID
    || !isPositive(run.workflow_id) || run.event !== 'workflow_dispatch'
    || run.path !== `${WORKFLOW_PATH}@${WORKFLOW_REF}` || run.head_sha !== environment.GITHUB_SHA
    || run.actor?.login !== ACTOR_LOGIN || !isPositive(run.actor?.id)) fail();

  return serializeWorkflowSourceDescriptor({
    repositoryId: REPOSITORY_ID,
    workflowId: run.workflow_id,
    workflowPath: WORKFLOW_PATH,
    workflowRef: WORKFLOW_REF,
    runId,
    runAttempt,
    eventName: 'workflow_dispatch',
    testedSha: environment.GITHUB_SHA,
    pullRequest: null,
    dispatchTarget: {
      number: Number(prNumber),
      baseSha,
      headSha,
      mergeSha: mergeShaInput || null,
      testedSha,
      context,
      appId: Number(appId),
      checkRunId: Number(checkRunId),
      policyFingerprint,
      requestId,
      actorId: run.actor.id,
      actorLogin: run.actor.login,
    },
  });
}

export async function writeStage1DispatchDescriptor({ environment = process.env, fetchImpl = globalThis.fetch } = {}) {
  try {
    const token = environment.STAGE1_GITHUB_TOKEN;
    if (typeof token !== 'string' || token.length === 0 || token.length > 8192 || /[\x00-\x20\x7f]/.test(token)
      || typeof fetchImpl !== 'function') fail();
    const event = JSON.parse(await readFile(environment.GITHUB_EVENT_PATH, 'utf8'));
    const api = new URL(environment.GITHUB_API_URL);
    const runPath = `/repos/${REPOSITORY}/actions/runs/${environment.GITHUB_RUN_ID}`;
    const response = await fetchImpl(new URL(runPath, api), { method: 'GET', redirect: 'manual', headers: {
      Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2026-03-10',
    } });
    if (response.status !== 200) fail();
    const run = await response.json();
    const bytes = createStage1DispatchDescriptor({ environment, event, run });
    const digest = createHash('sha256').update(bytes).digest('hex');
    const descriptorPath = path.join(environment.RUNNER_TEMP, 'digital-e-loop-workflow-source.json');
    await writeFile(descriptorPath, bytes, { flag: 'wx', mode: 0o600 });
    await appendFile(environment.GITHUB_OUTPUT, `sha256=${digest}\n`, { encoding: 'utf8' });
    return Object.freeze({ descriptorPath, digest });
  } catch {
    throw new Error('stage1_source_descriptor_unavailable');
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const result = await writeStage1DispatchDescriptor();
    process.stdout.write(JSON.stringify({ status: 'attested_descriptor_ready', sha256: result.digest }) + '\n');
  } catch {
    process.stderr.write('{"status":"refused","reasonCode":"stage1_source_descriptor_unavailable"}\n');
    process.exitCode = 1;
  }
}
