import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import {
  fetchUpstreamWorkflowRun,
  summarizeWorkflowSourceShaEvidence,
} from './stage1-source-sha-probe.mjs';

const EXPECTED = Object.freeze({
  repositoryId: 743050379,
  workflowId: 368298853,
  path: '.github/workflows/loop-foundation.yml',
});
const REPOSITORY = 'memories-quy-2002/digital-e-shop';

export async function runSourceShaProbe(env = process.env) {
  if (env.GITHUB_REPOSITORY !== REPOSITORY) return null;

  let event;
  try {
    if (typeof env.GITHUB_EVENT_PATH !== 'string' || env.GITHUB_EVENT_PATH.length === 0) {
      throw new Error();
    }
    event = JSON.parse(await readFile(env.GITHUB_EVENT_PATH, 'utf8'));
  } catch {
    throw Object.assign(new Error('event_invalid'), { code: 'event_invalid' });
  }

  const upstream = event?.workflow_run;
  if (
    event?.repository?.id !== EXPECTED.repositoryId
    || upstream?.workflow_id !== EXPECTED.workflowId
    || upstream?.path !== EXPECTED.path
  ) return null;

  if (!Number.isSafeInteger(upstream.id) || upstream.id <= 0) {
    throw Object.assign(new Error('event_invalid'), { code: 'event_invalid' });
  }

  const apiRun = await fetchUpstreamWorkflowRun({ runId: upstream.id, token: env.GITHUB_TOKEN });
  return summarizeWorkflowSourceShaEvidence({ event, apiRun, expected: EXPECTED });
}

async function main() {
  try {
    const result = await runSourceShaProbe();
    if (result) process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const code = ['event_invalid', 'upstream_run_transport_error', 'upstream_run_http_error', 'upstream_run_invalid_json']
      .includes(error?.code) ? error.code : 'upstream_run_transport_error';
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
