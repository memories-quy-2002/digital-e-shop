const GREEN_CONCLUSIONS = new Set(['success', 'neutral', 'skipped']);

function escalate(reasonCode) { return Object.freeze({ action: 'escalate', reasonCode }); }

function matchesTuple(snapshot, target) {
  return snapshot?.repository === target.repository && snapshot.number === target.prNumber
    && snapshot.state === 'open' && snapshot.baseRef === 'main'
    && snapshot.baseSha === target.baseSha && snapshot.headSha === target.headSha && snapshot.mergeSha === target.mergeSha;
}

function hasGreenRequiredEvidence(evidence, target) {
  const required = evidence.requiredCheckSnapshot?.requiredChecks;
  if (!Array.isArray(required) || required.length === 0 || evidence.requiredCheckSnapshot.collectionStatus !== 'complete'
      || evidence.checkCollectionComplete !== true || !Array.isArray(evidence.checkObservations)) return false;
  const observations = evidence.checkObservations;
  for (const identity of required) {
    const matching = observations.filter((item) => item.requiredCheckKey === `${identity.context}|app:${identity.appId}`
      && item.testedSha === (evidence.testedSha ?? target.testedSha));
    if (matching.length !== 1 || matching[0].status !== 'completed' || !GREEN_CONCLUSIONS.has(matching[0].conclusion)) return false;
  }
  const workflows = evidence.requiredCheckSnapshot.requiredWorkflows;
  if (!Array.isArray(workflows)) return false;
  if (workflows.length > 0) {
    if (evidence.workflowEvidence?.length !== workflows.length || evidence.workflowEvidence.some((item) => item.status !== 'verified')) return false;
  }
  return true;
}

export async function observeStage1Retry({ target, workflowRunId, getRun, readCurrent, timeoutMs, maxWallClockSeconds,
  pollIntervalMs = 1000, now = Date.now, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
  if (!target || !Number.isSafeInteger(workflowRunId) || workflowRunId < 1 || typeof getRun !== 'function'
      || typeof readCurrent !== 'function' || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1
      || !Number.isSafeInteger(maxWallClockSeconds) || maxWallClockSeconds < 1
      || timeoutMs > maxWallClockSeconds * 1000 || !Number.isSafeInteger(pollIntervalMs) || pollIntervalMs < 1
      || typeof now !== 'function' || typeof sleep !== 'function') return escalate('observer_configuration_invalid');
  const started = now();
  const deadline = started + timeoutMs;
  if (!Number.isFinite(started) || !Number.isFinite(deadline)) return escalate('observer_configuration_invalid');
  let run;
  while (now() < deadline) {
    let observation;
    try { observation = await getRun(workflowRunId); } catch { return escalate('retry_run_unavailable'); }
    if (now() > deadline) return escalate('retry_run_timeout');
    if (observation?.status === 'unavailable' || observation?.status === 'incomplete' || observation?.run?.id !== workflowRunId) return escalate('retry_run_evidence_incomplete');
    run = observation;
    if (run.run.status === 'completed') break;
    const delay = Math.min(pollIntervalMs, Math.max(0, deadline - now()));
    if (delay === 0) break;
    await sleep(delay);
  }
  if (!run || run.run.status !== 'completed') return escalate('retry_run_timeout');
  const observed = run.run;
  if (run.status !== 'current' || run.jobs?.collectionStatus !== 'complete' || observed.repositoryId !== target.repositoryId
      || observed.workflowId !== target.workflowId || observed.path !== target.workflowPath || observed.ref !== 'refs/heads/main'
      || observed.event !== 'workflow_dispatch' || observed.sourceSha !== target.workflowSourceSha
      || observed.actorId !== target.actorId || observed.actorLogin !== target.actorLogin || observed.conclusion !== 'success') return escalate('retry_run_identity_mismatch');
  const jobs = run.jobs.jobs;
  for (const name of ['verify', 'publish']) {
    const matched = jobs.filter((job) => job.name === name);
    if (matched.length !== 1 || matched[0].status !== 'completed' || matched[0].conclusion !== 'success') return escalate('retry_job_not_successful');
  }
  let evidence;
  try { evidence = await readCurrent(target); } catch { return escalate('completion_evidence_unavailable'); }
  if (!evidence || !matchesTuple(evidence.prSnapshot, target)
      || evidence.requiredCheckSnapshot?.policyFingerprint !== target.policyFingerprint
      || evidence.requiredCheckSnapshot?.collectionStatus !== 'complete' || evidence.checkCollectionComplete !== true
      || !Array.isArray(evidence.checkObservations)) return escalate('completion_evidence_stale_or_incomplete');
  const exact = evidence.checkObservations.filter((item) => item.checkId === `check:${target.checkRunId}`
    && item.requiredCheckKey === `${target.context}|app:${target.appId}` && item.testedSha === target.testedSha);
  if (exact.length !== 1 || exact[0].status !== 'completed' || exact[0].conclusion !== 'success') return escalate('original_check_not_green');
  if (!hasGreenRequiredEvidence(evidence, target)) return escalate('completion_evidence_stale_or_incomplete');
  return Object.freeze({ action: 'ready-for-human', workflowRunId, checkRunId: target.checkRunId,
    headSha: target.headSha, baseSha: target.baseSha, mergeSha: target.mergeSha });
}
