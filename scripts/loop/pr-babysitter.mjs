import { classifyFailure } from './classify-failure.mjs';
import {
  buildFailureEvidence,
  normalizeCheckObservation,
  normalizePrSnapshot,
  normalizeRequiredCheckSnapshot,
  PrEvidenceError,
} from './pr-evidence.mjs';
import { validatePrBabysitterState, PrBabysitterStateValidationError } from './pr-state-contract.mjs';

const DECISION_INPUT_KEYS = Object.freeze([
  'prSnapshot',
  'requiredCheckSnapshot',
  'checkObservations',
  'checkCollectionComplete',
  'prState',
  'policy',
]);
const STOP_CONDITION_KEYS = Object.freeze([
  'maxIterations',
  'maxSameFailure',
  'maxFlakyRetries',
  'maxChangedFiles',
  'maxChangedLines',
  'maxWallClockSeconds',
  'tokenLimit',
  'ciRunLimit',
]);
const RISK_POLICY_KEYS = Object.freeze(['low', 'medium', 'high', 'criticalActions']);
const PROTECTED_PATH_KEYS = Object.freeze(['high', 'critical']);
const FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/i;
const MAX_CHECK_OBSERVATIONS = 10_000;
const MAX_REQUIRED_CHECKS = 1_000;
const MAX_REQUIRED_WORKFLOWS = 1_000;

export class PrDecisionInputError extends TypeError {
  constructor(message, options = {}) {
    super(message, options);
    this.name = 'PrDecisionInputError';
  }
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertExactKeys(value, keys, label) {
  if (!isPlainObject(value)) throw new PrDecisionInputError(`${label} must be a plain object`);
  const allowed = new Set(keys);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new PrDecisionInputError(`${label} contains unsupported fields`);
  }
  if (keys.some((key) => !Object.hasOwn(value, key))) {
    throw new PrDecisionInputError(`${label} is missing required fields`);
  }
}

function normalizeRequiredSnapshot(snapshot) {
  assertExactKeys(snapshot, [
    'baseRef',
    'policyFingerprint',
    'requiredCheckKeys',
    'requiredWorkflowKeys',
    'requiredWorkflows',
    'collectionStatus',
  ], 'requiredCheckSnapshot');
  if (!Array.isArray(snapshot.requiredCheckKeys) || snapshot.requiredCheckKeys.length > MAX_REQUIRED_CHECKS) {
    throw new PrDecisionInputError(`requiredCheckKeys must be an array of at most ${MAX_REQUIRED_CHECKS} entries`);
  }
  if (!Array.isArray(snapshot.requiredWorkflowKeys) || snapshot.requiredWorkflowKeys.length > MAX_REQUIRED_WORKFLOWS
      || !Array.isArray(snapshot.requiredWorkflows) || snapshot.requiredWorkflows.length > MAX_REQUIRED_WORKFLOWS) {
    throw new PrDecisionInputError(`required workflow evidence must contain at most ${MAX_REQUIRED_WORKFLOWS} entries`);
  }

  const requiredChecks = snapshot.requiredCheckKeys.map((key) => {
    if (typeof key !== 'string') throw new PrDecisionInputError('required check keys must be strings');
    if (key.endsWith('|legacy')) {
      return { context: key.slice(0, -'|legacy'.length), appId: null };
    }
    const appMatch = /\|app:(\d+)$/.exec(key);
    if (!appMatch) throw new PrDecisionInputError('required check key is not canonical');
    const appId = Number(appMatch[1]);
    if (!Number.isSafeInteger(appId)) throw new PrDecisionInputError('required check app ID is outside the safe integer range');
    return { context: key.slice(0, appMatch.index), appId };
  });

  let normalized;
  try {
    normalized = normalizeRequiredCheckSnapshot({
      baseRef: snapshot.baseRef,
      policyFingerprint: snapshot.policyFingerprint,
      requiredChecks,
      requiredWorkflows: snapshot.requiredWorkflows.map(({ repositoryId, path: workflowPath, ref, sha }) => ({
        repositoryId,
        path: workflowPath,
        ref,
        sha,
      })),
      collectionStatus: snapshot.collectionStatus,
    });
  } catch (error) {
    if (error instanceof PrEvidenceError) throw new PrDecisionInputError(error.message, { cause: error });
    throw error;
  }
  if (normalized.requiredCheckKeys.some((key, index) => key !== snapshot.requiredCheckKeys[index])) {
    throw new PrDecisionInputError('requiredCheckKeys must already be canonical, unique, and sorted');
  }
  if (normalized.requiredWorkflowKeys.length !== snapshot.requiredWorkflowKeys.length
      || normalized.requiredWorkflowKeys.some((key, index) => key !== snapshot.requiredWorkflowKeys[index])) {
    throw new PrDecisionInputError('requiredWorkflowKeys must match canonical, unique, sorted workflow identities');
  }
  return normalized;
}

function validatePolicy(policy) {
  assertExactKeys(policy, ['schemaVersion', 'protectedPaths', 'riskRules', 'stopConditions'], 'policy');
  if (policy.schemaVersion !== 1) throw new PrDecisionInputError('policy schemaVersion is unsupported');
  assertExactKeys(policy.protectedPaths, PROTECTED_PATH_KEYS, 'policy.protectedPaths');
  if ([...PROTECTED_PATH_KEYS].some((key) => !Array.isArray(policy.protectedPaths[key]))) {
    throw new PrDecisionInputError('policy.protectedPaths entries must be arrays');
  }
  assertExactKeys(policy.riskRules, RISK_POLICY_KEYS, 'policy.riskRules');
  if (['low', 'medium', 'high'].some((key) => !Array.isArray(policy.riskRules[key]))
      || !Array.isArray(policy.riskRules.criticalActions)) {
    throw new PrDecisionInputError('policy.riskRules entries must be arrays');
  }
  assertExactKeys(policy.stopConditions, STOP_CONDITION_KEYS, 'policy.stopConditions');
  for (const key of STOP_CONDITION_KEYS) {
    const value = policy.stopConditions[key];
    if (key === 'tokenLimit' || key === 'ciRunLimit') {
      if (value !== null && (!Number.isSafeInteger(value) || value < 1)) {
        throw new PrDecisionInputError(`policy.stopConditions.${key} must be null or a positive safe integer`);
      }
    } else if (!Number.isSafeInteger(value) || value < 1) {
      throw new PrDecisionInputError(`policy.stopConditions.${key} must be a positive safe integer`);
    }
  }
  return policy;
}

function normalizeInputs(input) {
  assertExactKeys(input, DECISION_INPUT_KEYS, 'decision input');
  let prSnapshot;
  let requiredCheckSnapshot;
  let checkObservations;
  try {
    prSnapshot = normalizePrSnapshot(input.prSnapshot);
    requiredCheckSnapshot = normalizeRequiredSnapshot(input.requiredCheckSnapshot);
    if (!Array.isArray(input.checkObservations) || input.checkObservations.length > MAX_CHECK_OBSERVATIONS) {
      throw new PrDecisionInputError(`checkObservations must be an array of at most ${MAX_CHECK_OBSERVATIONS} entries`);
    }
    checkObservations = input.checkObservations.map((observation) => normalizeCheckObservation(observation));
  } catch (error) {
    if (error instanceof PrDecisionInputError) throw error;
    if (error instanceof PrEvidenceError) throw new PrDecisionInputError(error.message, { cause: error });
    throw error;
  }
  if (typeof input.checkCollectionComplete !== 'boolean') {
    throw new PrDecisionInputError('checkCollectionComplete must be a boolean');
  }
  let prState;
  try {
    prState = validatePrBabysitterState(input.prState);
  } catch (error) {
    if (error instanceof PrBabysitterStateValidationError) throw new PrDecisionInputError(error.message, { cause: error });
    throw error;
  }
  const policy = validatePolicy(input.policy);
  return { prSnapshot, requiredCheckSnapshot, checkObservations, checkCollectionComplete: input.checkCollectionComplete, prState, policy };
}

function remainingBudget(limit, used) {
  return Math.max(0, limit - used);
}

function makeDecision(action, reasonCode, context, { checkIds = [], failureFingerprints = [] } = {}) {
  const { prSnapshot, requiredCheckSnapshot, prState, policy } = context;
  return Object.freeze({
    action,
    reasonCode,
    headSha: prSnapshot.headSha,
    baseSha: prSnapshot.baseSha,
    mergeSha: prSnapshot.mergeSha,
    requiredCheckPolicyFingerprint: requiredCheckSnapshot.policyFingerprint,
    checkIds: Object.freeze([...new Set(checkIds)].sort()),
    failureFingerprints: Object.freeze([...new Set(failureFingerprints)].sort()),
    retryBudgetRemaining: remainingBudget(policy.stopConditions.maxFlakyRetries, prState.telemetry.flakyRetriesRecorded),
    repairBudgetRemaining: remainingBudget(policy.stopConditions.maxIterations, prState.repairRequestCount),
  });
}

function uniqueObservations(observations) {
  const attempts = new Map();
  for (const observation of observations) {
    const existing = attempts.get(observation.attemptKey);
    if (existing && JSON.stringify(existing) !== JSON.stringify(observation)) {
      return { conflict: true, observations: [...attempts.values()] };
    }
    if (!existing) attempts.set(observation.attemptKey, observation);
  }
  return { conflict: false, observations: [...attempts.values()] };
}

function classifyCompletedFailures(observations, prSnapshot) {
  const failures = [];
  for (const observation of observations) {
    const evidence = buildFailureEvidence(observation, {
      currentHeadSha: prSnapshot.headSha,
      currentBaseSha: prSnapshot.baseSha,
      currentMergeSha: prSnapshot.mergeSha,
    });
    if (!evidence || evidence.status !== 'actionable') continue;
    failures.push({ observation, failureFingerprint: evidence.failureFingerprint, classification: classifyFailure(evidence.evidence) });
  }
  return failures;
}

function isSafePrContext(prSnapshot) {
  if (prSnapshot.state !== 'open') return { valid: false, reasonCode: 'pr_not_open' };
  if (prSnapshot.baseRef !== 'main') return { valid: false, reasonCode: 'base_not_main' };
  if (prSnapshot.headRef === 'main') return { valid: false, reasonCode: 'head_is_main' };
  if (prSnapshot.headRepository !== prSnapshot.repository) return { valid: false, reasonCode: 'forked_head' };
  return { valid: true, reasonCode: null };
}

export function decidePrAction(input) {
  const context = normalizeInputs(input);
  const { prSnapshot, requiredCheckSnapshot, checkObservations, checkCollectionComplete, prState, policy } = context;
  const safePr = isSafePrContext(prSnapshot);
  if (!safePr.valid) return makeDecision('escalate', safePr.reasonCode, context);
  if (prState.repository !== prSnapshot.repository || prState.prNumber !== prSnapshot.number) {
    return makeDecision('escalate', 'state_pr_mismatch', context);
  }
  if (prState.headSha !== prSnapshot.headSha) {
    return makeDecision('wait', 'state_head_sha_mismatch', context);
  }
  if (prState.baseSha !== prSnapshot.baseSha) {
    return makeDecision('wait', 'state_base_sha_mismatch', context);
  }
  if (prState.mergeSha !== prSnapshot.mergeSha) {
    return makeDecision('wait', 'state_merge_sha_mismatch', context);
  }
  if (prState.branch !== prSnapshot.headRef || prState.baseRef !== prSnapshot.baseRef) {
    return makeDecision('wait', 'state_pr_snapshot_mismatch', context);
  }

  const unique = uniqueObservations(checkObservations);
  if (unique.conflict) return makeDecision('escalate', 'conflicting_attempt_evidence', context);
  const observations = unique.observations;
  const stale = observations.some((observation) => (
    observation.headSha !== prSnapshot.headSha
    || observation.baseSha !== prSnapshot.baseSha
    || observation.mergeSha !== prSnapshot.mergeSha
    || (observation.testedSha !== prSnapshot.headSha
      && (prSnapshot.mergeSha === null || observation.testedSha !== prSnapshot.mergeSha))
  ));
  if (stale) return makeDecision('wait', 'stale_check_evidence', context);
  if (requiredCheckSnapshot.baseRef !== prSnapshot.baseRef) {
    return makeDecision('wait', 'required_check_base_mismatch', context);
  }
  if (requiredCheckSnapshot.collectionStatus !== 'complete') {
    const reasonCode = requiredCheckSnapshot.collectionStatus === 'unavailable'
      ? 'required_check_policy_unavailable'
      : 'required_check_policy_incomplete';
    return makeDecision('wait', reasonCode, context);
  }
  if (!checkCollectionComplete) return makeDecision('wait', 'check_collection_incomplete', context);

  const requiredKeys = new Set(requiredCheckSnapshot.requiredCheckKeys);
  const requiredWorkflowKeys = new Set(requiredCheckSnapshot.requiredWorkflowKeys);
  const requiredCheckObservations = observations.filter((observation) => requiredKeys.has(observation.requiredCheckKey));
  const requiredWorkflowObservations = observations.filter((observation) => (
    observation.provider === 'github-actions' && requiredWorkflowKeys.has(observation.requiredWorkflowKey)
  ));
  const checksByRequiredKey = new Map();
  for (const observation of requiredCheckObservations) {
    const existing = checksByRequiredKey.get(observation.requiredCheckKey) ?? [];
    existing.push(observation);
    checksByRequiredKey.set(observation.requiredCheckKey, existing);
  }
  for (const requiredCheckKey of requiredKeys) {
    const matching = checksByRequiredKey.get(requiredCheckKey) ?? [];
    if (matching.length === 0) return makeDecision('wait', 'required_check_evidence_missing', context);
    if (matching.length > 1) return makeDecision('wait', 'multiple_required_check_attempts', context, {
      checkIds: matching.map((observation) => observation.checkId),
    });
  }
  const workflowsByRequiredKey = new Map();
  for (const observation of requiredWorkflowObservations) {
    const existing = workflowsByRequiredKey.get(observation.requiredWorkflowKey) ?? [];
    existing.push(observation);
    workflowsByRequiredKey.set(observation.requiredWorkflowKey, existing);
  }
  for (const requiredWorkflowKey of requiredWorkflowKeys) {
    const matching = workflowsByRequiredKey.get(requiredWorkflowKey) ?? [];
    if (matching.length === 0) return makeDecision('wait', 'required_workflow_evidence_missing', context);
    if (matching.length > 1) return makeDecision('wait', 'multiple_required_workflow_attempts', context, {
      checkIds: matching.map((observation) => observation.checkId),
    });
  }
  const requiredObservations = [...new Map(
    [...requiredCheckObservations, ...requiredWorkflowObservations]
      .map((observation) => [observation.attemptKey, observation]),
  ).values()];
  const unrecorded = requiredObservations.find((observation) => !prState.observedAttemptKeys.includes(observation.attemptKey));
  if (unrecorded) return makeDecision('wait', 'check_observation_not_recorded', context, {
    checkIds: [unrecorded.checkId],
  });

  const failures = classifyCompletedFailures(requiredObservations, prSnapshot);
  const failureCheckIds = failures.map(({ observation }) => observation.checkId);
  const failureFingerprints = failures.map(({ failureFingerprint }) => failureFingerprint);
  const escalationFailures = failures.filter(({ classification }) => ['protected', 'infrastructure', 'ambiguous'].includes(classification.category));
  if (escalationFailures.length > 0) {
    const categories = new Set(failures.map(({ classification }) => classification.category));
    const reasonCode = categories.size > 1 ? 'mixed_failure_categories' : escalationFailures[0].classification.reasonCode;
    return makeDecision('escalate', reasonCode, context, { checkIds: failureCheckIds, failureFingerprints });
  }

  const branchFailures = failures.filter(({ classification }) => classification.category === 'branch-caused');
  const flakyFailures = failures.filter(({ classification }) => classification.category === 'flaky');
  const unrecordedFailures = failures.filter(({ observation, failureFingerprint }) => (
    prState.actionableFailureAttemptFingerprints[observation.attemptKey] !== failureFingerprint
  ));
  if (unrecordedFailures.length > 0) return makeDecision('wait', 'failure_fingerprint_not_recorded', context, {
    checkIds: unrecordedFailures.map(({ observation }) => observation.checkId),
    failureFingerprints: unrecordedFailures.map(({ failureFingerprint }) => failureFingerprint),
  });

  if (branchFailures.some(({ failureFingerprint }) => (
    prState.actionableFailureCounts[failureFingerprint] >= policy.stopConditions.maxSameFailure
  ))) {
    return makeDecision('escalate', 'max_same_failure', context, {
      checkIds: branchFailures.map(({ observation }) => observation.checkId),
      failureFingerprints: branchFailures.map(({ failureFingerprint }) => failureFingerprint),
    });
  }
  if (branchFailures.length > 0 && prState.repairRequestCount >= policy.stopConditions.maxIterations) {
    return makeDecision('escalate', 'max_repair_requests', context, {
      checkIds: branchFailures.map(({ observation }) => observation.checkId),
      failureFingerprints: branchFailures.map(({ failureFingerprint }) => failureFingerprint),
    });
  }
  if (flakyFailures.length > 0 && prState.telemetry.flakyRetriesRecorded >= policy.stopConditions.maxFlakyRetries) {
    return makeDecision('escalate', 'max_flaky_retries', context, {
      checkIds: flakyFailures.map(({ observation }) => observation.checkId),
      failureFingerprints: flakyFailures.map(({ failureFingerprint }) => failureFingerprint),
    });
  }
  if (flakyFailures.length > 0) {
    return makeDecision('retry-check', flakyFailures[0].classification.reasonCode, context, {
      checkIds: flakyFailures.map(({ observation }) => observation.checkId),
      failureFingerprints: flakyFailures.map(({ failureFingerprint }) => failureFingerprint),
    });
  }
  if (branchFailures.length > 0) {
    return makeDecision('request-repair', branchFailures[0].classification.reasonCode, context, {
      checkIds: branchFailures.map(({ observation }) => observation.checkId),
      failureFingerprints: branchFailures.map(({ failureFingerprint }) => failureFingerprint),
    });
  }

  const pending = requiredObservations.filter((observation) => (
    observation.status !== 'completed' || !['success', 'neutral', 'skipped'].includes(observation.conclusion)
  ));
  if (pending.length > 0) {
    return makeDecision('wait', 'required_checks_pending', context, {
      checkIds: pending.map((observation) => observation.checkId),
    });
  }
  const hasRequiredEvidence = requiredCheckSnapshot.requiredCheckKeys.length > 0
    || requiredCheckSnapshot.requiredWorkflowKeys.length > 0;
  const greenReason = !hasRequiredEvidence
    ? 'no_required_checks_policy_complete'
    : 'all_required_checks_green';
  return makeDecision('ready-for-human', greenReason, context, {
    checkIds: requiredObservations.map((observation) => observation.checkId),
  });
}
