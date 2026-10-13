import { validateTaskRecord } from './contracts.mjs';
import { classifyRisk, normalizeRepoPath } from '../classify-risk.mjs';
import { decidePrAction } from '../pr-babysitter.mjs';
import { normalizePrSnapshot } from '../pr-evidence.mjs';

const SHA = /^[a-f0-9]{40,64}$/i;
const DIGEST = /^[a-f0-9]{64}$/i;
const MERGE_AUTHORIZATIONS = new WeakMap();

function blocked(reasonCode) { return Object.freeze({ eligible: false, action: 'none', reasonCode }); }

function tupleOf(repositoryId, pr) {
  return Object.freeze({ repositoryId, number: pr.number, baseSha: pr.baseSha.toLowerCase(),
    headSha: pr.headSha.toLowerCase(), mergeSha: pr.mergeSha?.toLowerCase() ?? null });
}

function sameTuple(left, right) {
  return left && right && left.repositoryId === right.repositoryId && left.number === right.number
    && left.baseSha?.toLowerCase() === right.baseSha?.toLowerCase()
    && left.headSha?.toLowerCase() === right.headSha?.toLowerCase()
    && (left.mergeSha?.toLowerCase() ?? null) === (right.mergeSha?.toLowerCase() ?? null);
}

function linkedTupleMatches(record, snapshot) {
  return sameTuple(record.links.pr, tupleOf(snapshot.repositoryId, snapshot.prSnapshot));
}

function currentVerifier(evidence, headSha) {
  return evidence?.complete === true && evidence.passed === true
    && evidence.revisionStable === true && evidence.workspaceStable === true
    && typeof evidence.verifiedRevision === 'string' && SHA.test(evidence.verifiedRevision)
    && evidence.verifiedRevision.toLowerCase() === headSha.toLowerCase()
    && typeof evidence.currentRevision === 'string' && SHA.test(evidence.currentRevision)
    && evidence.currentRevision.toLowerCase() === headSha.toLowerCase()
    && typeof evidence.verifiedWorkspaceFingerprint === 'string' && DIGEST.test(evidence.verifiedWorkspaceFingerprint)
    && typeof evidence.currentWorkspaceFingerprint === 'string' && DIGEST.test(evidence.currentWorkspaceFingerprint)
    && evidence.verifiedWorkspaceFingerprint.toLowerCase() === evidence.currentWorkspaceFingerprint.toLowerCase();
}

function normalizeDiffObservation(raw, expected) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)
      || Object.keys(raw).sort().join('|') !== 'baseSha|headSha|mergeSha|number|paths|repositoryId'
      || !sameTuple(raw, expected) || !Array.isArray(raw.paths) || raw.paths.length < 1 || raw.paths.length > 100) {
    throw new TypeError('merge_diff_observation_invalid');
  }
  const paths = raw.paths.map((candidate) => normalizeRepoPath(candidate));
  if (new Set(paths.map((candidate) => candidate.toLowerCase())).size !== paths.length) throw new TypeError('merge_diff_observation_invalid');
  return Object.freeze({ tuple: Object.freeze({ ...expected }), paths: Object.freeze([...paths].sort()) });
}

/** Creates an opaque, one-tuple authorization only after an exact contents:write approval is consumed. */
export function createTaskMergeAuthorizationGate({ authProvider, observeDiff, now = Date.now } = {}) {
  if (!authProvider || typeof authProvider.requestApproval !== 'function'
      || typeof authProvider.consumeApproval !== 'function' || typeof observeDiff !== 'function'
      || typeof now !== 'function') throw new TypeError('merge_authorization_gate_unavailable');
  return Object.freeze({
    async authorize(input) {
      if (!input || typeof input !== 'object' || Array.isArray(input)
          || Object.keys(input).sort().join('|') !== 'prSnapshot|repositoryId'
          || !Number.isSafeInteger(input.repositoryId) || input.repositoryId < 1) throw new TypeError('merge_authorization_scope_invalid');
      const pr = normalizePrSnapshot(input.prSnapshot);
      if (pr.baseRef !== 'main') throw new TypeError('non_main_base_ref');
      const tuple = tupleOf(input.repositoryId, pr);
      const observed = normalizeDiffObservation(await observeDiff(tuple), tuple);
      const scope = Object.freeze({ repositoryId: tuple.repositoryId, prNumber: tuple.number,
        baseSha: tuple.baseSha, headSha: tuple.headSha, mergeSha: tuple.mergeSha,
        capability: 'contents:write', paths: observed.paths });
      const approval = await authProvider.requestApproval(scope);
      authProvider.consumeApproval(approval, scope);
      const issuedAt = now();
      if (!Number.isSafeInteger(issuedAt) || issuedAt < 1) throw new TypeError('merge_authorization_clock_invalid');
      const handle = Object.freeze({});
      MERGE_AUTHORIZATIONS.set(handle, Object.freeze({ tuple, paths: observed.paths, issuedAt }));
      return handle;
    },
  });
}

/** Read-only native-auto-merge eligibility decision from independently collected host evidence. */
export function evaluateTaskMergeEligibility({ record: inputRecord, snapshot, context, now = Date.now() }) {
  let record;
  try { record = validateTaskRecord(inputRecord); } catch { return blocked('task_record_invalid'); }
  if (!snapshot || typeof snapshot !== 'object' || !snapshot.prSnapshot || !snapshot.babysitterInput
      || !snapshot.branchRules || !Array.isArray(snapshot.reviews)) return blocked('independent_merge_snapshot_required');
  if (!context?.policy) return blocked('trusted_policy_required');
  try {
    const current = normalizePrSnapshot(snapshot.prSnapshot);
    const checksPr = normalizePrSnapshot(snapshot.babysitterInput.prSnapshot);
    if (JSON.stringify(current) !== JSON.stringify(checksPr)) return blocked('pr_snapshot_sources_disagree');
    snapshot = { ...snapshot, prSnapshot: current };
  } catch { return blocked('independent_merge_snapshot_invalid'); }

  if (snapshot.prSnapshot.baseRef !== 'main') return blocked('non_main_base_ref');
  if (record.state !== 'merging') return blocked('task_not_in_merging_state');
  if (record.policyRevision !== context.policy.trustedRevision) return blocked('policy_revision_mismatch');
  if (!linkedTupleMatches(record, snapshot)) return blocked('pr_tuple_stale');
  if (snapshot.prSnapshot.state !== 'open' || snapshot.prSnapshot.draft === true) return blocked('pr_not_mergeable');
  if (snapshot.branchRules.collectionStatus !== 'complete' || snapshot.branchRules.protected !== true) return blocked('branch_rules_incomplete_or_unprotected');
  if (snapshot.branchRules.allowsAutoMerge !== true) return blocked('repository_auto_merge_unavailable');
  if (snapshot.branchRules.repositoryId !== snapshot.repositoryId || snapshot.branchRules.baseRef !== 'main') return blocked('branch_rules_identity_mismatch');
  if (!Number.isSafeInteger(snapshot.branchRules.requiredApprovingReviewCount) || snapshot.branchRules.requiredApprovingReviewCount < 1) return blocked('independent_review_requirement_missing');
  if (snapshot.branchRules.policyFingerprint !== snapshot.babysitterInput.requiredCheckSnapshot?.policyFingerprint) return blocked('required_check_policy_conflict');
  if (!currentVerifier(snapshot.verifierEvidence, snapshot.prSnapshot.headSha)) return blocked('current_verifier_evidence_required');
  if (snapshot.unresolvedReviewThreads !== 0) return blocked('unresolved_review_threads');
  if (snapshot.reviewCollectionStatus !== 'complete') return blocked('review_collection_incomplete');

  const ownerActorId = snapshot.taskOwnerActorId;
  if (!Number.isSafeInteger(ownerActorId) || ownerActorId < 1) return blocked('task_owner_identity_missing');
  const approvals = snapshot.reviews.filter((review) => review?.state === 'APPROVED'
    && review.commitId?.toLowerCase() === snapshot.prSnapshot.headSha.toLowerCase()
    && Number.isSafeInteger(review.actorId) && review.actorId > 0
    && review.actorId !== ownerActorId && review.isBot !== true);
  const independentReviewerIds = new Set(approvals.map((review) => review.actorId));
  if (independentReviewerIds.size < snapshot.branchRules.requiredApprovingReviewCount) return blocked('independent_human_review_missing');

  let prDecision;
  try { prDecision = decidePrAction(snapshot.babysitterInput); } catch { return blocked('required_check_evidence_invalid'); }
  if (prDecision.action !== 'ready-for-human') return blocked(`required_checks_${prDecision.action}`);

  const policy = context.policy;
  if (!Object.isFrozen(policy) || policy.enabled !== true || policy.autoMergeEnabled !== true) return blocked('auto_merge_disabled_by_policy');
  if (!Array.isArray(policy.eligibleRisks) || !Array.isArray(policy.eligibleCategories)
      || !Array.isArray(policy.eligiblePaths) || !Array.isArray(policy.capabilities)) return blocked('trusted_policy_invalid');
  if (!policy.capabilities.includes('enable_native_auto_merge')) return blocked('native_auto_merge_capability_not_in_policy');
  if (!policy.eligibleCategories.includes(snapshot.category)) return blocked('task_scope_not_policy_eligible');

  const riskPolicy = context.loopPolicy;
  if (!Object.isFrozen(riskPolicy) || !Object.isFrozen(riskPolicy.protectedPaths)
      || !Object.isFrozen(riskPolicy.riskRules)) return blocked('canonical_risk_policy_required');
  const authorization = MERGE_AUTHORIZATIONS.get(context.mergeAuthorization);
  const currentTuple = tupleOf(snapshot.repositoryId, snapshot.prSnapshot);
  if (!authorization || !sameTuple(authorization.tuple, currentTuple)
      || !Number.isSafeInteger(now) || now < authorization.issuedAt || now - authorization.issuedAt > 300_000) {
    return blocked('separate_trusted_merge_authorization_required');
  }
  let paths;
  let classification;
  try {
    paths = authorization.paths.map(normalizeRepoPath);
    classification = classifyRisk({ paths }, riskPolicy);
  } catch { return blocked('changed_paths_not_policy_eligible'); }
  if (!paths.length || paths.some((path) => !policy.eligiblePaths.includes(path))
      || !['low', 'medium'].includes(classification.level) || classification.requiresHumanApproval
      || !policy.eligibleRisks.includes(classification.level)) return blocked('task_scope_not_policy_eligible');

  return Object.freeze({
    eligible: true,
    action: 'native_auto_merge_eligible',
    reasonCode: 'all_independent_merge_gates_satisfied',
    taskId: record.taskId,
    expectedVersion: record.version,
    tuple: currentTuple,
    changedPaths: Object.freeze([...paths]),
    observedRisk: classification.level,
    reviewerIds: Object.freeze([...independentReviewerIds]),
    writePerformed: false,
  });
}
