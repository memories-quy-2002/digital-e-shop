import { createHash } from 'node:crypto';

import { serializeWorkflowSourceDescriptor } from './workflow-source-descriptor.mjs';

const API_ORIGIN = 'https://api.github.com';
const REPOSITORY = 'memories-quy-2002/digital-e-shop';
const OWNER = 'memories-quy-2002';
const FIXED_RUNS_URL = `${API_ORIGIN}/repos/${REPOSITORY}/actions/runs`;
const FIXED_PULLS_URL = `${API_ORIGIN}/repos/${REPOSITORY}/pulls`;
const OIDC_ISSUER = 'https://token.actions.githubusercontent.com';
const SUBJECT_NAME = 'digital-e-loop-workflow-source.json';
const SHA_PATTERN = /^[a-f0-9]{40}$/;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;

function boundedError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function isPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function normalizeSha(value) {
  return typeof value === 'string' && /^[a-f\d]{40}$/i.test(value) ? value.toLowerCase() : null;
}

function normalizeTimestamp(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function unavailable({ runId = null, runAttempt = null, workflowId = null, path = null, testedSha = null } = {}) {
  return Object.freeze({
    status: 'unavailable',
    runId: isPositiveInteger(runId) ? runId : null,
    runAttempt: isPositiveInteger(runAttempt) ? runAttempt : null,
    workflowId: isPositiveInteger(workflowId) ? workflowId : null,
    path: typeof path === 'string' && path.length <= 1024 ? path : null,
    testedSha: normalizeSha(testedSha),
    sourceShaCandidate: null,
  });
}

function candidateResult({ runId, runAttempt, workflowId, path, testedSha, sourceShaCandidate }) {
  return Object.freeze({
    status: 'candidate_present',
    runId,
    runAttempt,
    workflowId,
    path,
    testedSha,
    sourceShaCandidate,
  });
}

function sameRepository(value, repository) {
  return value?.full_name === repository;
}

function nextPagePresent(linkHeader) {
  if (linkHeader === undefined || linkHeader === null || linkHeader === '') return false;
  if (typeof linkHeader !== 'string' || linkHeader.length > 16_384) return true;
  return linkHeader.split(',').some((part) => /;\s*rel\s*=\s*"?next"?(?:\s*;|$)/i.test(part));
}

function descriptorFor({ expected, run, snapshot, workflowRef }) {
  try {
    return serializeWorkflowSourceDescriptor({
      repositoryId: expected.repositoryId,
      workflowId: expected.workflowId,
      workflowPath: expected.path,
      workflowRef,
      runId: run.id,
      runAttempt: run.runAttempt,
      eventName: 'pull_request',
      testedSha: run.testedSha,
      pullRequest: {
        number: snapshot.number,
        baseSha: snapshot.baseSha,
        headSha: snapshot.headSha,
        mergeSha: snapshot.mergeSha,
      },
    });
  } catch {
    return null;
  }
}

function claimsMatchRun(claims, { expected, run, snapshot, workflowRef, descriptorSha256 }) {
  const createdAt = normalizeTimestamp(run.createdAt);
  const updatedAt = normalizeTimestamp(run.updatedAt);
  if (!claims || typeof claims !== 'object' || Array.isArray(claims)
      || !createdAt || !updatedAt || Date.parse(createdAt) > Date.parse(updatedAt)) return false;
  const signerUri = `https://github.com/${expected.repository}/${expected.path}@${workflowRef}`;
  const invocationUri = `https://github.com/${expected.repository}/actions/runs/${run.id}/attempts/${run.runAttempt}`;
  const hasInRunVerifiedTimestamp = Array.isArray(claims.verifiedTimestamps)
    && claims.verifiedTimestamps.length > 0
    && claims.verifiedTimestamps.length <= 16
    && claims.verifiedTimestamps.every((value) => normalizeTimestamp(value) !== null)
    && claims.verifiedTimestamps.some((value) => {
      const timestamp = normalizeTimestamp(value);
      return timestamp !== null && Date.parse(timestamp) >= Date.parse(createdAt)
        && Date.parse(timestamp) <= Date.parse(updatedAt);
    });
  return claims.repositoryId === expected.repositoryId
    && claims.issuer === OIDC_ISSUER
    && claims.sourceRepositoryIdentifier === String(expected.repositoryId)
    && claims.githubWorkflowRepository === expected.repository
    && claims.workflowPath === expected.path
    && claims.githubWorkflowRef === workflowRef
    && normalizeSha(claims.githubWorkflowSHA) === claims.githubWorkflowSHA
    && claims.githubWorkflowSHA === claims.buildSignerDigest
    && claims.workflowId === expected.workflowId
    && claims.testedSha === run.testedSha
    && claims.runId === run.id
    && claims.runAttempt === run.runAttempt
    && claims.subjectName === SUBJECT_NAME
    && claims.subjectDigest === descriptorSha256
    && claims.descriptorSha256 === descriptorSha256
    && claims.subjectAlternativeName?.type === 'URI'
    && claims.subjectAlternativeName.value === signerUri
    && claims.buildSignerURI === signerUri
    && claims.runInvocationURI === invocationUri
    && hasInRunVerifiedTimestamp
    && snapshot.number > 0;
}

export async function inspectWorkflowSourceShaEvidence({
  event,
  apiRun,
  pullRequests,
  pullRequestsComplete = true,
  expected,
  inspectAttestation,
} = {}) {
  const eventRun = event?.workflow_run;
  const eventRunId = eventRun?.id;
  const eventRunAttempt = eventRun?.run_attempt;
  const eventTestedSha = normalizeSha(eventRun?.head_sha);
  const initial = unavailable({
    runId: eventRunId,
    runAttempt: eventRunAttempt,
    workflowId: eventRun?.workflow_id,
    path: eventRun?.path,
    testedSha: eventTestedSha,
  });

  if (!expected || event?.repository?.id !== expected.repositoryId
      || apiRun?.repository?.id !== expected.repositoryId
      || eventRun?.workflow_id !== expected.workflowId || eventRun?.path !== expected.path
      || apiRun?.workflow_id !== expected.workflowId || apiRun?.path !== expected.path) return initial;

  const runId = eventRun.id;
  const runAttempt = eventRun.run_attempt;
  const testedSha = eventTestedSha;
  const normalizedApiSha = normalizeSha(apiRun.head_sha);
  const common = {
    runId,
    runAttempt,
    workflowId: expected.workflowId,
    path: expected.path,
    testedSha,
  };
  if (!isPositiveInteger(runId) || apiRun.id !== runId
      || !isPositiveInteger(runAttempt) || apiRun.run_attempt !== runAttempt
      || !testedSha || normalizedApiSha !== testedSha
      || eventRun.head_branch !== apiRun.head_branch) return unavailable(common);

  if (eventRun.event !== 'pull_request' || apiRun.event !== 'pull_request') return unavailable(common);
  if (typeof apiRun.head_branch !== 'string' || apiRun.head_branch.length === 0
      || apiRun.head_branch.length > 255 || /[\x00-\x1f\x7f]/.test(apiRun.head_branch)
      || !Array.isArray(pullRequests) || pullRequests.length > 100 || pullRequestsComplete !== true) {
    return unavailable(common);
  }

  const associatedPullRequests = pullRequests.filter((pullRequest) =>
    sameRepository(pullRequest?.head?.repo, expected.repository)
      && pullRequest.head.repo.id === expected.repositoryId
      && sameRepository(pullRequest?.base?.repo, expected.repository)
      && pullRequest.base.repo.id === expected.repositoryId);
  if (associatedPullRequests.length !== 1) return unavailable(common);

  const pullRequest = associatedPullRequests[0];
  const baseSha = normalizeSha(pullRequest?.base?.sha);
  const headSha = normalizeSha(pullRequest?.head?.sha);
  const mergeSha = normalizeSha(pullRequest?.merge_commit_sha);
  const pullRequestNumber = pullRequest?.number;
  const snapshot = {
    repositoryId: expected.repositoryId,
    number: pullRequestNumber,
    baseSha,
    headSha,
    mergeSha,
  };
  if (!isPositiveInteger(pullRequestNumber) || !baseSha || !headSha || !mergeSha
      || pullRequest.head.ref !== apiRun.head_branch
      || (testedSha !== headSha && testedSha !== mergeSha)) return unavailable(common);

  const createdAt = normalizeTimestamp(apiRun.created_at);
  const updatedAt = normalizeTimestamp(apiRun.updated_at);
  if (!createdAt || !updatedAt || Date.parse(createdAt) > Date.parse(updatedAt)) return unavailable(common);

  const workflowRef = `refs/pull/${pullRequestNumber}/merge`;
  const run = Object.freeze({
    id: runId,
    runAttempt,
    repositoryId: expected.repositoryId,
    workflowId: expected.workflowId,
    path: expected.path,
    ref: workflowRef,
    event: 'pull_request',
    headSha: testedSha,
    testedSha,
    createdAt,
    updatedAt,
  });
  const frozenSnapshot = Object.freeze(snapshot);
  const descriptor = descriptorFor({ expected, run, snapshot: frozenSnapshot, workflowRef });
  if (!descriptor || typeof inspectAttestation !== 'function') return unavailable(common);
  const descriptorSha256 = createHash('sha256').update(descriptor).digest('hex');

  let claims;
  try {
    claims = await inspectAttestation({
      identity: Object.freeze({
        type: 'workflow',
        repositoryId: expected.repositoryId,
        path: expected.path,
        ref: workflowRef,
      }),
      run,
      snapshot: frozenSnapshot,
    });
  } catch {
    return unavailable(common);
  }

  if (!claimsMatchRun(claims, { expected, run, snapshot: frozenSnapshot, workflowRef, descriptorSha256 })) {
    return unavailable(common);
  }
  return candidateResult({
    ...common,
    sourceShaCandidate: claims.githubWorkflowSHA,
  });
}

export async function fetchUpstreamWorkflowRun({ runId, token, fetchImpl = fetch }) {
  if (!isPositiveInteger(runId) || typeof token !== 'string' || token.length === 0
      || token.length > 8192 || typeof fetchImpl !== 'function') {
    throw boundedError('upstream_run_transport_error');
  }
  let response;
  try {
    response = await fetchImpl(`${FIXED_RUNS_URL}/${runId}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      redirect: 'manual',
    });
  } catch {
    throw boundedError('upstream_run_transport_error');
  }
  if (!response?.ok || response.status < 200 || response.status >= 300) {
    throw boundedError('upstream_run_http_error');
  }
  try {
    const run = await response.json();
    if (!run || typeof run !== 'object' || Array.isArray(run)) throw new Error();
    return run;
  } catch {
    throw boundedError('upstream_run_invalid_json');
  }
}

export async function fetchWorkflowRunPullRequests({ headBranch, token, fetchImpl = fetch }) {
  if (typeof headBranch !== 'string' || headBranch.length === 0 || headBranch.length > 255
      || /[\x00-\x1f\x7f]/.test(headBranch) || typeof token !== 'string' || token.length === 0
      || token.length > 8192 || typeof fetchImpl !== 'function') {
    throw boundedError('pull_request_lookup_transport_error');
  }
  const url = new URL(FIXED_PULLS_URL);
  url.searchParams.set('state', 'all');
  url.searchParams.set('head', `${OWNER}:${headBranch}`);
  url.searchParams.set('per_page', '100');

  let response;
  try {
    response = await fetchImpl(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      redirect: 'manual',
    });
  } catch {
    throw boundedError('pull_request_lookup_transport_error');
  }
  if (!response?.ok || response.status < 200 || response.status >= 300) {
    throw boundedError('pull_request_lookup_http_error');
  }
  let pullRequests;
  try {
    pullRequests = await response.json();
  } catch {
    throw boundedError('pull_request_lookup_invalid_json');
  }
  if (!Array.isArray(pullRequests) || pullRequests.length > 100) {
    throw boundedError('pull_request_lookup_invalid_json');
  }
  const linkHeader = response.headers?.get?.('link');
  return Object.freeze({
    pullRequests: Object.freeze(pullRequests),
    complete: !nextPagePresent(linkHeader),
  });
}
