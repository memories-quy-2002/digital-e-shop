import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { createGitHubWorkflowSourceAttestationProvider } from './github-workflow-source-attestation.mjs';
import {
  fetchUpstreamWorkflowRun,
  fetchWorkflowRunPullRequests,
  inspectWorkflowSourceShaEvidence,
  normalizeSourceShaProbeErrorCode,
} from './stage1-source-sha-probe.mjs';

const EXPECTED = Object.freeze({
  repository: 'memories-quy-2002/digital-e-shop',
  repositoryId: 743050379,
  workflowId: 368298853,
  path: '.github/workflows/loop-foundation.yml',
});

export async function runSourceShaProbe(env = process.env, dependencies = {}) {
  if (env.GITHUB_REPOSITORY !== EXPECTED.repository) return null;

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
  if (event?.repository?.id !== EXPECTED.repositoryId
      || upstream?.workflow_id !== EXPECTED.workflowId
      || upstream?.path !== EXPECTED.path) return null;
  if (!Number.isSafeInteger(upstream.id) || upstream.id <= 0) {
    throw Object.assign(new Error('event_invalid'), { code: 'event_invalid' });
  }

  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const apiRun = await fetchUpstreamWorkflowRun({ runId: upstream.id, token: env.GITHUB_TOKEN, fetchImpl });
  let pullRequestResult = { pullRequests: [], complete: true };
  if (upstream.event === 'pull_request' && apiRun.event === 'pull_request') {
    pullRequestResult = await fetchWorkflowRunPullRequests({
      headBranch: upstream.head_branch,
      token: env.GITHUB_TOKEN,
      fetchImpl,
    });
  }

  const inspectAttestation = dependencies.inspectAttestation
    ?? createGitHubWorkflowSourceAttestationProvider({
      repository: EXPECTED.repository,
      getToken: async (capability) => {
        if (capability !== 'observe') throw new Error('observe_capability_required');
        return env.GITHUB_TOKEN;
      },
    });
  return inspectWorkflowSourceShaEvidence({
    event,
    apiRun,
    pullRequests: pullRequestResult.pullRequests,
    pullRequestsComplete: pullRequestResult.complete,
    expected: EXPECTED,
    inspectAttestation,
  });
}

async function main() {
  try {
    const result = await runSourceShaProbe();
    if (result) process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const code = normalizeSourceShaProbeErrorCode(error, 'upstream_run_transport_error');
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
