import { createHash } from 'node:crypto';
import { validateTaskRecord } from './contracts.mjs';
import { normalizeRequiredCheckSnapshot, normalizeCheckObservation } from '../pr-evidence.mjs';
import { isVerifiedWorkflowSourceRecord } from '../workflow-source-attestation.mjs';

export class TaskCompletionError extends Error {
  constructor(code) { super(code); this.name = new.target.name; this.code = code; }
}
function fail(code) { throw new TaskCompletionError(code); }
const GREEN = new Set(['success', 'neutral', 'skipped']);
const COMPLETION_PROOFS = new WeakMap();

/** A compact report, not an authorization: evidence must come from the host's fresh GitHub observer. */
export function buildTaskCompletionReport(input, evidence, now = Date.now()) {
  const record = validateTaskRecord(input);
  const pr = record.links.pr;
  if (!['merged', 'reporting', 'completed'].includes(record.state) || !record.confirmedMergeSha || !pr
      || !evidence || evidence.repositoryId !== record.key.repositoryId || evidence.prNumber !== pr.number
      || evidence.baseRef !== 'main' || evidence.merged !== true || evidence.headSha !== pr.headSha
      || evidence.mergeSha !== record.confirmedMergeSha || pr.mergeSha !== evidence.mergeSha) fail('confirmed_merge_required');
  const timestamp = Date.parse(evidence.checkedAt);
  if (!Number.isSafeInteger(now) || !Number.isFinite(timestamp) || timestamp > now || now - timestamp > 300_000) fail('completion_observation_stale');
  const verification = evidence.verification;
  if (evidence.hostedCiComplete !== true || evidence.requiredCheckPolicyComplete !== true
      || verification?.mode !== 'full' || verification.passed !== true || verification.revisionStable !== true
      || verification.workspaceStable !== true || verification.verifiedRevision !== pr.headSha
      || verification.currentRevision !== pr.headSha
      || !/^[a-f0-9]{64}$/i.test(verification.verifiedWorkspaceFingerprint ?? '')
      || verification.verifiedWorkspaceFingerprint !== verification.currentWorkspaceFingerprint) fail('full_verification_required');
  let required;
  let observations;
  try {
    required = normalizeRequiredCheckSnapshot(evidence.requiredCheckSnapshot);
    if (!Array.isArray(evidence.checkObservations) || evidence.checkObservations.length > 100) fail('required_check_evidence_invalid');
    observations = evidence.checkObservations.map(normalizeCheckObservation);
  } catch { fail('required_check_evidence_invalid'); }
  const keys = [...required.requiredCheckKeys.map((key) => ({ key, field: 'requiredCheckKey' })),
    ...required.requiredWorkflowKeys.map((key) => ({ key, field: 'requiredWorkflowKey' }))];
  if (required.collectionStatus !== 'complete' || required.baseRef !== 'main' || keys.length < 1 || keys.length > 100) fail('required_check_evidence_invalid');
  const checks = keys.map(({ key, field }) => {
    const matches = observations.filter((check) => check[field] === key);
    if (matches.length !== 1) fail('required_check_evidence_invalid');
    const check = matches[0];
    if (check.headSha !== pr.headSha || check.baseSha !== pr.baseSha || check.status !== 'completed'
        || ![pr.headSha, evidence.testMergeSha ?? null].includes(check.testedSha)
        || (check.testedSha !== pr.headSha && check.mergeSha !== evidence.testMergeSha)
        || !GREEN.has(check.conclusion)) fail('required_check_evidence_invalid');
    return Object.freeze({ key, testedSha: check.testedSha, conclusion: check.conclusion });
  });
  for (const identity of required.requiredWorkflows) {
    const matches = (evidence.workflowSourceRecords ?? []).filter((source) => isVerifiedWorkflowSourceRecord(source)
      && source.repositoryId === identity.repositoryId && source.repositoryId === record.key.repositoryId
      && source.workflowPath === identity.path && source.workflowRef === identity.ref && source.sourceSha === identity.sha
      && [pr.headSha, evidence.testMergeSha ?? null].includes(source.testedSha));
    if (matches.length !== 1) fail('workflow_source_evidence_required');
  }
  const report = { schemaVersion: 1, taskId: record.taskId, repositoryId: record.key.repositoryId,
    issueNumber: record.key.issueNumber, prNumber: pr.number, headSha: pr.headSha, mergeSha: record.confirmedMergeSha,
    repairs: record.budgets.repairs, modelCalls: record.budgets.modelCalls, deliveryGenerations: record.budgets.deliveries,
    acceptanceIds: Object.freeze([...record.acceptanceIds]), checks: Object.freeze(checks), status: 'completed' };
  const reportDigest = createHash('sha256').update(JSON.stringify(report), 'utf8').digest('hex');
  return Object.freeze({ ...report, reportDigest });
}

/** Create one-use completion evidence only after the trusted host performs fresh reads. */
export function createTaskCompletionGate(options) {
  if (!options || typeof options.taskId !== 'string' || typeof options.leaseOwner !== 'string'
      || typeof options.store?.loadTaskRecord !== 'function'
      || typeof options.store?.assertTaskLease !== 'function'
      || typeof options.observeCompletion !== 'function') throw new TaskCompletionError('completion_gate_configuration_invalid');
  const now = options.now ?? Date.now;
  return Object.freeze({
    async authorize(expectedVersion) {
      const record = validateTaskRecord(await options.store.loadTaskRecord(options.taskId));
      if (record.taskId !== options.taskId || record.state !== 'reporting' || record.version !== expectedVersion
          || await options.store.assertTaskLease(record.taskId, options.leaseOwner, now(), record.version) !== true) {
        fail('completion_task_or_lease_stale');
      }
      const evidence = await options.observeCompletion(record);
      const report = buildTaskCompletionReport(record, evidence, now());
      const current = validateTaskRecord(await options.store.loadTaskRecord(options.taskId));
      if (current.taskId !== record.taskId || current.version !== record.version || current.state !== 'reporting'
          || current.confirmedMergeSha !== record.confirmedMergeSha
          || await options.store.assertTaskLease(current.taskId, options.leaseOwner, now(), current.version) !== true) {
        fail('completion_task_or_lease_stale');
      }
      const proof = Object.freeze({ taskId: record.taskId, expectedVersion: record.version, reportDigest: report.reportDigest });
      COMPLETION_PROOFS.set(proof, { taskId: record.taskId, expectedVersion: record.version, reportDigest: report.reportDigest });
      return Object.freeze({ report, proof });
    },
  });
}

/** Internal reducer check: proofs are host-issued, version-bound, and consumed once. */
export function consumeTaskCompletionProof(proof, record) {
  const bound = proof && typeof proof === 'object' ? COMPLETION_PROOFS.get(proof) : undefined;
  if (!bound || bound.taskId !== record.taskId || bound.expectedVersion !== record.version
      || typeof bound.reportDigest !== 'string' || !/^[a-f0-9]{64}$/.test(bound.reportDigest)) return false;
  COMPLETION_PROOFS.delete(proof);
  return true;
}

/** Never reset state/counters or restart an executor while its termination is unknown. */
export function classifyTaskRecovery(input, observation, now = Date.now()) {
  const record = validateTaskRecord(input);
  if (!Number.isSafeInteger(now) || now < 1 || !observation || !Number.isSafeInteger(observation.leaseUntil)) fail('recovery_observation_invalid');
  if (['completed', 'cancelled', 'failed', 'escalated'].includes(record.state)) return Object.freeze({ action: 'none', reasonCode: 'task_terminal' });
  if (Date.parse(record.deadline) <= now) return Object.freeze({ action: 'escalate', reasonCode: 'task_deadline_exhausted' });
  if (observation.leaseUntil > now) return Object.freeze({ action: 'wait', reasonCode: 'task_lease_active' });
  if (observation.runnerStopped !== true) return Object.freeze({ action: 'escalate', reasonCode: 'runner_termination_unconfirmed' });
  return Object.freeze({ action: 'resume', reasonCode: 'task_lease_expired', taskId: record.taskId, expectedVersion: record.version });
}
