import { randomBytes } from 'node:crypto';

const SUPPORTED_CONTEXTS = new Set(['client', 'server']);
const SHA = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i;
const CHECK_ID = /^check:([1-9]\d{0,18})$/;
const REPOSITORY_ID = /^[1-9]\d{0,18}$/;

function refuse() {
  throw Object.assign(new Error('stage1_target_unavailable'), { reasonCode: 'stage1_target_unavailable' });
}

function tuple(snapshot) {
  return [snapshot.baseSha, snapshot.headSha, snapshot.mergeSha];
}

function validSha(value) {
  return typeof value === 'string' && SHA.test(value);
}

function normalizeCheck(check) {
  return typeof check === 'object' && check !== null ? check : {};
}

export function selectUniqueStage1CheckTarget(input) {
  try {
    if (!input || typeof input !== 'object') refuse();
    const { decision, prSnapshot, requiredCheckSnapshot, checkObservations, changedFiles, workflowRuns, trustedWorkflow } = input;
    if (decision?.action !== 'retry-check' || decision.reasonCode !== 'same_revision_pass_then_fail'
      || !Array.isArray(decision.checkIds) || decision.checkIds.length !== 1
      || !Array.isArray(decision.failureFingerprints) || decision.failureFingerprints.length !== 1) refuse();
    if (prSnapshot?.state !== 'open' || prSnapshot.draft !== false || prSnapshot.baseRef !== 'main'
      || prSnapshot.headRef === 'main' || prSnapshot.repository?.toLowerCase() !== prSnapshot.headRepository?.toLowerCase()
      || !Number.isSafeInteger(prSnapshot.number) || prSnapshot.number < 1
      || !validSha(prSnapshot.baseSha) || !validSha(prSnapshot.headSha)
      || (prSnapshot.mergeSha !== null && !validSha(prSnapshot.mergeSha))) refuse();
    if (requiredCheckSnapshot?.collectionStatus !== 'complete' || requiredCheckSnapshot.baseRef !== 'main'
      || !/^[a-f0-9]{64}$/i.test(requiredCheckSnapshot.policyFingerprint)
      || !Array.isArray(requiredCheckSnapshot.requiredChecks) || requiredCheckSnapshot.requiredChecks.length === 0
      || requiredCheckSnapshot.requiredChecks.some((item) => !item || typeof item.context !== 'string' || !Number.isSafeInteger(item.appId))) refuse();
    if (!Array.isArray(requiredCheckSnapshot.requiredWorkflows) || !Array.isArray(checkObservations)
      || !changedFiles || changedFiles.status !== 'current' || changedFiles.collectionStatus !== 'complete'
      || !Array.isArray(changedFiles.files) || !workflowRuns || workflowRuns.status !== 'current'
      || workflowRuns.collectionStatus !== 'complete' || !Array.isArray(workflowRuns.runs)) refuse();
    const eligibleRequired = requiredCheckSnapshot.requiredChecks.filter(({ context, appId }) => SUPPORTED_CONTEXTS.has(context) && appId === 15368);
    if (eligibleRequired.length === 0) refuse();
    const candidates = checkObservations.map(normalizeCheck).filter((observation) => eligibleRequired.some(({ context, appId }) =>
      observation.requiredCheckKey === `${context}|app:${appId}`)
      && observation.status === 'completed' && observation.conclusion === 'failure');
    if (candidates.length !== 1) refuse();
    const observation = candidates[0];
    const identity = eligibleRequired.filter(({ context, appId }) => observation.requiredCheckKey === `${context}|app:${appId}`);
    if (identity.length !== 1) refuse();
    const { context, appId } = identity[0];
    const match = typeof observation.checkId === 'string' ? CHECK_ID.exec(observation.checkId) : null;
    if (!match || observation.provider !== 'github-check' || observation.requiredWorkflowKey !== null
      || !['headSha', 'baseSha'].every((key) => observation[key] === prSnapshot[key])
      || observation.mergeSha !== prSnapshot.mergeSha || ![prSnapshot.headSha, prSnapshot.mergeSha].includes(observation.testedSha)
      || observation.failureFingerprint !== decision.failureFingerprints[0]
      || decision.checkIds[0] !== observation.checkId || observation.protectedPathTouched !== false
      || observation.runnerOutcome !== null) refuse();
    if (checkObservations.some((item) => item.testedSha === observation.testedSha
      && item.requiredCheckKey === `${context}|app:${appId}` && item.checkId !== observation.checkId)) refuse();
    const protectedChanged = changedFiles.files.some(({ filename, previousFilename }) => [filename, previousFilename]
      .filter(Boolean).some((name) => name === '.github/workflows' || name.startsWith('.github/workflows/')
        || name === '.github/actions' || name.startsWith('.github/actions/')));
    if (protectedChanged) refuse();
    if (workflowRuns.runs.some((run) => run.testedSha === observation.testedSha && run.status !== 'completed')) refuse();
    if (!trustedWorkflow || !Number.isSafeInteger(trustedWorkflow.repositoryId) || trustedWorkflow.repositoryId < 1
      || !Number.isSafeInteger(trustedWorkflow.workflowId) || trustedWorkflow.workflowId < 1
      || trustedWorkflow.path !== '.github/workflows/stage1-trusted-retry.yml' || trustedWorkflow.ref !== 'main'
      || trustedWorkflow.sourceSha !== prSnapshot.baseSha || !REPOSITORY_ID.test(String(trustedWorkflow.repositoryId))
      || !Number.isSafeInteger(trustedWorkflow.actorId) || trustedWorkflow.actorId < 1
      || trustedWorkflow.actorLogin !== 'digital-e-loop-runner[bot]') refuse();
    const target = {
      repository: prSnapshot.repository,
      repositoryId: trustedWorkflow.repositoryId,
      prNumber: prSnapshot.number,
      baseSha: prSnapshot.baseSha,
      headSha: prSnapshot.headSha,
      mergeSha: prSnapshot.mergeSha,
      testedSha: observation.testedSha,
      context,
      appId,
      checkRunId: Number(match[1]),
      policyFingerprint: requiredCheckSnapshot.policyFingerprint.toLowerCase(),
      workflowId: trustedWorkflow.workflowId,
      workflowPath: trustedWorkflow.path,
      workflowRef: trustedWorkflow.ref,
      workflowSourceSha: trustedWorkflow.sourceSha.toLowerCase(),
      actorId: trustedWorkflow.actorId,
      actorLogin: trustedWorkflow.actorLogin,
      requestId: randomBytes(16).toString('hex'),
    };
    return Object.freeze(target);
  } catch (error) {
    if (error?.reasonCode === 'stage1_target_unavailable') throw error;
    refuse();
  }
}
