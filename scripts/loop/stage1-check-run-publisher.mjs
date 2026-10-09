import { createGitHubPrClient } from './github-pr-client.mjs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const API_ORIGIN = 'https://api.github.com';
const API_VERSION = '2026-03-10';
const REPOSITORY = 'memories-quy-2002/digital-e-shop';

function refuse(reasonCode) { return Object.freeze({ status: 'escalate', reasonCode }); }

function tupleMatches(snapshot, target) {
  return snapshot?.repository?.toLowerCase() === target.repository
    && snapshot?.number === target.prNumber && snapshot.state === 'open' && snapshot.baseRef === 'main'
    && snapshot.baseSha === target.baseSha && snapshot.headSha === target.headSha && snapshot.mergeSha === target.mergeSha;
}

function validTarget(target) {
  return target?.repository === REPOSITORY && Number.isSafeInteger(target.prNumber) && target.prNumber > 0
    && Number.isSafeInteger(target.checkRunId) && target.checkRunId > 0 && target.appId === 15368
    && ['client', 'server'].includes(target.context) && [target.headSha, target.mergeSha].includes(target.testedSha)
    && /^[a-f0-9]{40}$/i.test(target.baseSha) && /^[a-f0-9]{40}$/i.test(target.headSha)
    && (target.mergeSha === null || /^[a-f0-9]{40}$/i.test(target.mergeSha))
    && /^[a-f0-9]{64}$/i.test(target.policyFingerprint);
}

export async function publishVerifiedStage1Check({ token, repository, target, retryRunUrl, readTarget, fetchImpl = globalThis.fetch, verifierResult } = {}) {
  if (!validTarget(target) || repository !== REPOSITORY || typeof readTarget !== 'function' || typeof fetchImpl !== 'function') return refuse('publisher_configuration_invalid');
  if (verifierResult !== 'success') return refuse('verifier_not_successful');
  let runUrl;
  try { runUrl = new URL(retryRunUrl); } catch { return refuse('retry_run_url_invalid'); }
  if (runUrl.origin !== 'https://github.com' || runUrl.search || runUrl.hash
    || !/^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/actions\/runs\/[1-9]\d*$/.test(runUrl.pathname)
    || runUrl.pathname !== `/${REPOSITORY}/actions/runs/${Number(runUrl.pathname.split('/').at(-1))}`) return refuse('retry_run_url_invalid');
  if (typeof token !== 'string' || token.length === 0 || token.length > 8192 || /[\x00-\x20\x7f]/.test(token)) return refuse('publisher_token_invalid');

  let evidence;
  try { evidence = await readTarget(target); } catch { return refuse('publisher_evidence_unavailable'); }
  if (!evidence || evidence.collectionStatus !== 'complete' || !tupleMatches(evidence.prSnapshot, target)
    || evidence.requiredCheckSnapshot?.collectionStatus !== 'complete'
    || evidence.requiredCheckSnapshot.policyFingerprint !== target.policyFingerprint
    || !Array.isArray(evidence.requiredCheckSnapshot.requiredChecks)
    || evidence.requiredCheckSnapshot.requiredChecks.filter((identity) => identity?.context === target.context && identity.appId === target.appId).length !== 1
    || !Array.isArray(evidence.requiredCheckSnapshot.requiredCheckKeys)
    || evidence.requiredCheckSnapshot.requiredCheckKeys.filter((key) => key === `${target.context}|app:${target.appId}`).length !== 1
    || !Array.isArray(evidence.requiredCheckSnapshot.requiredWorkflows)
    || evidence.checkCollectionComplete !== true || evidence.workflowRuns?.collectionStatus !== 'complete'
    || evidence.workflowRuns.runs.some((run) => run.testedSha === target.testedSha && run.status !== 'completed')) return refuse('publisher_target_stale');
  const exact = evidence.checkObservations?.filter((item) => item.checkId === `check:${target.checkRunId}`
    && item.requiredCheckKey === `${target.context}|app:${target.appId}` && item.testedSha === target.testedSha);
  if (exact?.length !== 1 || exact[0].status !== 'completed' || exact[0].conclusion !== 'failure') return refuse('publisher_check_mismatch');

  const url = new URL(`/repos/${REPOSITORY}/check-runs/${target.checkRunId}`, API_ORIGIN);
  if (url.origin !== API_ORIGIN || url.pathname !== `/repos/${REPOSITORY}/check-runs/${target.checkRunId}`) return refuse('publisher_route_rejected');
  let response;
  try {
    response = await fetchImpl(url, { method: 'PATCH', redirect: 'manual', headers: {
      Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-GitHub-Api-Version': API_VERSION,
    }, body: JSON.stringify({ conclusion: 'success', output: {
      title: 'Verified by trusted Stage 1 retry',
      summary: `The fixed ${target.context} verifier passed for ${target.testedSha}. Trusted retry: ${runUrl.href}`,
    } }) });
  } catch { return refuse('publisher_outcome_uncertain'); }
  if (response.status >= 300 && response.status < 400) return refuse('publisher_outcome_uncertain');
  if (response.status < 200 || response.status >= 300) return refuse('publisher_update_rejected');
  let result;
  try { result = await response.json(); } catch { return refuse('publisher_outcome_uncertain'); }
  if (result?.id !== target.checkRunId || result?.name !== target.context || result?.head_sha !== target.testedSha
    || result?.app?.id !== target.appId || result?.status !== 'completed' || result?.conclusion !== 'success') return refuse('publisher_update_ambiguous');
  return Object.freeze({ status: 'published', checkRunId: target.checkRunId, testedSha: target.testedSha });
}

export function createStage1PublisherReadTarget({ token, fetchImpl = globalThis.fetch }) {
  const prClient = createGitHubPrClient({ repository: REPOSITORY, getToken: async (capability) => {
    if (capability !== 'observe') throw new Error('read_only');
    return token;
  }, fetchImpl });
  return async (target) => {
    const prSnapshot = await prClient.getPullRequest(target.prNumber);
    const [requiredCheckSnapshot, collection, workflowRuns] = await Promise.all([
      prClient.getRequiredCheckSnapshot({ baseRef: prSnapshot.baseRef, headSha: target.testedSha }),
      prClient.getCommitCheckRuns(target.testedSha),
      prClient.getWorkflowRuns(target.testedSha),
    ]);
    return { collectionStatus: collection.checkCollectionComplete ? 'complete' : 'incomplete', prSnapshot,
      requiredCheckSnapshot, checkObservations: collection.observations, checkCollectionComplete: collection.checkCollectionComplete, workflowRuns };
  };
}

async function runPublisherCli() {
  const fail = () => { process.stderr.write('{"status":"escalate","reasonCode":"publisher_cli_invalid"}\n'); process.exitCode = 1; };
  try {
    const repository = process.env.GITHUB_REPOSITORY;
    const token = process.env.STAGE1_GITHUB_TOKEN;
    const runId = process.env.GITHUB_RUN_ID;
    const eventPath = process.env.GITHUB_EVENT_PATH;
    if (repository !== REPOSITORY || !token || !/^\d+$/.test(runId ?? '') || !eventPath) return fail();
    const event = JSON.parse(await readFile(eventPath, 'utf8'));
    const inputs = event.inputs;
    if (!inputs || Object.keys(inputs).sort().join(',') !== [
      'app_id', 'base_sha', 'check_run_id', 'context', 'head_sha', 'merge_sha', 'policy_fingerprint', 'pr_number', 'request_id', 'tested_sha',
    ].sort().join(',')) return fail();
    const target = {
      repository: REPOSITORY, prNumber: Number(inputs.pr_number), baseSha: inputs.base_sha, headSha: inputs.head_sha,
      mergeSha: inputs.merge_sha || null, testedSha: inputs.tested_sha, context: inputs.context, appId: Number(inputs.app_id),
      checkRunId: Number(inputs.check_run_id), policyFingerprint: inputs.policy_fingerprint,
    };
    const result = await publishVerifiedStage1Check({ token, repository, target,
      retryRunUrl: `https://github.com/${REPOSITORY}/actions/runs/${runId}`, verifierResult: 'success',
      readTarget: createStage1PublisherReadTarget({ token }), fetchImpl: globalThis.fetch });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (result.status !== 'published') process.exitCode = 1;
  } catch { fail(); }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) await runPublisherCli();
