const FIXED_RUNS_URL = 'https://api.github.com/repos/memories-quy-2002/digital-e-shop/actions/runs';
const SOURCE_SHA_FIELDS = ['workflow_sha', 'source_sha', 'workflow_source_sha'];
const SHA_PATTERN = /^[a-f\d]{40}$/i;

function boundedError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function readSourceSha(record) {
  const candidates = SOURCE_SHA_FIELDS
    .map((field) => record?.[field])
    .filter((value) => value !== undefined && value !== null);
  if (candidates.some((value) => typeof value !== 'string' || !SHA_PATTERN.test(value))) {
    return { malformed: true, value: null };
  }
  const normalized = [...new Set(candidates.map((value) => value.toLowerCase()))];
  return {
    malformed: false,
    value: normalized.length === 0 ? null : normalized.length === 1 ? normalized[0] : normalized,
  };
}

function notTarget() {
  return Object.freeze({ status: 'not_target' });
}

export function summarizeWorkflowSourceShaEvidence({ event, apiRun, expected }) {
  const eventRun = event?.workflow_run;
  if (
    event?.repository?.id !== expected?.repositoryId
    || apiRun?.repository?.id !== expected?.repositoryId
    || eventRun?.workflow_id !== expected?.workflowId
    || eventRun?.path !== expected?.path
    || apiRun?.workflow_id !== expected?.workflowId
    || apiRun?.path !== expected?.path
  ) return notTarget();

  const runId = eventRun?.id;
  const runAttempt = eventRun?.run_attempt;
  const testedSha = eventRun?.head_sha;
  if (
    !Number.isSafeInteger(runId) || runId <= 0
    || apiRun?.id !== runId
    || !Number.isSafeInteger(runAttempt) || runAttempt <= 0
    || apiRun?.run_attempt !== runAttempt
    || typeof testedSha !== 'string' || !SHA_PATTERN.test(testedSha)
    || typeof apiRun?.head_sha !== 'string'
    || !SHA_PATTERN.test(apiRun.head_sha)
    || apiRun.head_sha.toLowerCase() !== testedSha.toLowerCase()
  ) {
    return Object.freeze({
      status: 'run_identity_mismatch',
      runId: Number.isSafeInteger(runId) ? runId : null,
      runAttempt: Number.isSafeInteger(runAttempt) ? runAttempt : null,
      workflowId: expected.workflowId,
      path: expected.path,
      testedSha: typeof testedSha === 'string' && SHA_PATTERN.test(testedSha) ? testedSha.toLowerCase() : null,
      eventSourceSha: null,
      apiSourceSha: null,
    });
  }

  const eventCandidate = readSourceSha(eventRun);
  const apiCandidate = readSourceSha(apiRun);
  const invalidOrConflicting = eventCandidate.malformed || apiCandidate.malformed
    || Array.isArray(eventCandidate.value) || Array.isArray(apiCandidate.value)
    || (eventCandidate.value && apiCandidate.value && eventCandidate.value !== apiCandidate.value);
  return Object.freeze({
    status: invalidOrConflicting
      ? 'source_sha_mismatch'
      : (eventCandidate.value || apiCandidate.value ? 'candidate_present' : 'source_sha_unavailable'),
    runId,
    runAttempt,
    workflowId: expected.workflowId,
    path: expected.path,
    testedSha: testedSha.toLowerCase(),
    eventSourceSha: invalidOrConflicting ? null : eventCandidate.value,
    apiSourceSha: invalidOrConflicting ? null : apiCandidate.value,
  });
}

export async function fetchUpstreamWorkflowRun({ runId, token, fetchImpl = fetch }) {
  if (!Number.isSafeInteger(runId) || runId <= 0 || typeof token !== 'string' || token.length === 0) {
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
    return await response.json();
  } catch {
    throw boundedError('upstream_run_invalid_json');
  }
}
