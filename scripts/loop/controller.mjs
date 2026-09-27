import { classifyFailure } from './classify-failure.mjs';
import { classifyRisk, normalizeRepoPath } from './classify-risk.mjs';
import { evaluateBudgets, recordFailure, validateLoopState } from './state.mjs';

const RISK_ORDER = Object.freeze(['low', 'medium', 'high', 'critical']);
const RISK_INDEX = new Map(RISK_ORDER.map((risk, index) => [risk, index]));
const PHASES = new Set(['inspect', 'implement', 'verify', 'repair', 'done', 'escalated']);
const ACCEPTANCE_STATUSES = new Set(['pending', 'passed', 'failed', 'blocked']);
const CHECK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const REVISION_PATTERN = /^[a-f0-9]{7,64}$/i;
const WORKSPACE_FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/i;
const CONTEXT_KEYS = Object.freeze([
  'policy',
  'affectedPaths',
  'riskResult',
  'criticalActions',
  'humanApproval',
  'currentRevision',
  'currentWorkspaceFingerprint',
  'verificationResult',
  'failureEvidence',
  'failureClassification',
  'protectedPathsTouched',
  'diff',
  'now',
]);

export class LoopTransitionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LoopTransitionError';
  }
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertExactKeys(value, requiredKeys, optionalKeys, label) {
  if (!isPlainObject(value)) throw new LoopTransitionError(`${label} must be a plain object`);
  const allowedKeys = new Set([...requiredKeys, ...optionalKeys]);
  const unknownKeys = Object.keys(value).filter((key) => !allowedKeys.has(key));
  if (unknownKeys.length > 0) throw new LoopTransitionError(`${label} contains unsupported fields`);
  const missingKeys = requiredKeys.filter((key) => !Object.hasOwn(value, key));
  if (missingKeys.length > 0) throw new LoopTransitionError(`${label} is missing ${missingKeys.join(', ')}`);
}

function stableReason(value, label) {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9_]{0,79}$/.test(value)) {
    throw new LoopTransitionError(`${label} must be a stable reason code`);
  }
  return value;
}

function normalizePathList(paths, label) {
  if (!Array.isArray(paths) || paths.some((value) => typeof value !== 'string')) {
    throw new LoopTransitionError(`${label} must be an array of repository-relative paths`);
  }
  const normalized = paths.map((value) => {
    try {
      return normalizeRepoPath(value);
    } catch {
      throw new LoopTransitionError(`${label} contains an unsafe repository path`);
    }
  });
  if (new Set(normalized).size !== normalized.length) {
    throw new LoopTransitionError(`${label} must not contain duplicate paths`);
  }
  return normalized;
}

function compareStringLists(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

function validateRiskResult(value, expected) {
  assertExactKeys(value, ['level', 'requiresHumanApproval', 'reasons', 'matchedRules'], [], 'riskResult');
  if (!RISK_INDEX.has(value.level)
      || typeof value.requiresHumanApproval !== 'boolean'
      || !Array.isArray(value.reasons)
      || value.reasons.some((reason) => typeof reason !== 'string')
      || !Array.isArray(value.matchedRules)
      || value.matchedRules.some((rule) => typeof rule !== 'string')) {
    throw new LoopTransitionError('riskResult has an invalid shape');
  }
  if (value.level !== expected.level
      || value.requiresHumanApproval !== expected.requiresHumanApproval
      || !compareStringLists(value.reasons, expected.reasons)
      || !compareStringLists(value.matchedRules, expected.matchedRules)) {
    throw new LoopTransitionError('riskResult does not match deterministic risk classification for the affected scope');
  }
}

function validateApproval(value, affectedPaths, now) {
  if (value === null) return false;
  assertExactKeys(value, ['approvedPaths', 'approvedAt'], [], 'humanApproval');
  const approvedPaths = normalizePathList(value.approvedPaths, 'humanApproval.approvedPaths');
  if (typeof value.approvedAt !== 'string') throw new LoopTransitionError('humanApproval.approvedAt must be an ISO timestamp');
  const approvedAt = new Date(value.approvedAt);
  if (!Number.isFinite(approvedAt.getTime()) || approvedAt.toISOString() !== value.approvedAt) {
    throw new LoopTransitionError('humanApproval.approvedAt must be a canonical ISO timestamp');
  }
  if (approvedAt.getTime() > now.getTime()) throw new LoopTransitionError('humanApproval.approvedAt cannot be in the future');
  return compareStringLists(approvedPaths, affectedPaths);
}

function validateVerificationResult(value, label = 'verificationResult') {
  if (!isPlainObject(value)
      || typeof value.passed !== 'boolean'
      || typeof value.complete !== 'boolean'
      || typeof value.revisionStable !== 'boolean'
      || typeof value.verifiedRevision !== 'string'
      || !REVISION_PATTERN.test(value.verifiedRevision)
      || typeof value.currentRevision !== 'string'
      || !REVISION_PATTERN.test(value.currentRevision)
      || typeof value.workspaceStable !== 'boolean'
      || typeof value.verifiedWorkspaceFingerprint !== 'string'
      || !WORKSPACE_FINGERPRINT_PATTERN.test(value.verifiedWorkspaceFingerprint)
      || typeof value.currentWorkspaceFingerprint !== 'string'
      || !WORKSPACE_FINGERPRINT_PATTERN.test(value.currentWorkspaceFingerprint)) {
    throw new LoopTransitionError(`${label} must include pass/completeness status and stable revision/workspace fingerprints`);
  }
  return value;
}

function validateClassification(value, expected) {
  assertExactKeys(value, ['category', 'mayRepair', 'retryWithinBudget', 'reasonCode'], [], 'failureClassification');
  if (value.category !== expected.category
      || value.mayRepair !== expected.mayRepair
      || value.retryWithinBudget !== expected.retryWithinBudget
      || value.reasonCode !== expected.reasonCode) {
    throw new LoopTransitionError('failureClassification does not match structured evidence');
  }
}

function validateEvent(event) {
  if (!isPlainObject(event) || typeof event.type !== 'string') {
    throw new LoopTransitionError('loop event must be a plain object with a type');
  }

  switch (event.type) {
    case 'TASK_ACCEPTED':
      assertExactKeys(event, ['type', 'taskId', 'acceptanceCriteria'], [], 'TASK_ACCEPTED');
      if (typeof event.taskId !== 'string' || !Array.isArray(event.acceptanceCriteria)) {
        throw new LoopTransitionError('TASK_ACCEPTED requires a task ID and acceptance criterion IDs/statuses');
      }
      for (const criterion of event.acceptanceCriteria) {
        assertExactKeys(criterion, ['id', 'status'], [], 'TASK_ACCEPTED acceptance criterion');
        if (typeof criterion.id !== 'string' || !ACCEPTANCE_STATUSES.has(criterion.status)) {
          throw new LoopTransitionError('TASK_ACCEPTED contains an invalid acceptance criterion');
        }
      }
      break;
    case 'IMPLEMENTATION_STARTED':
    case 'VERIFICATION_STARTED':
    case 'VERIFICATION_PASSED':
      if (event.type === 'VERIFICATION_PASSED') {
        assertExactKeys(event, ['type', 'acceptanceCriteria'], [], event.type);
        if (!Array.isArray(event.acceptanceCriteria)) {
          throw new LoopTransitionError('VERIFICATION_PASSED requires acceptance criterion IDs/statuses');
        }
        for (const criterion of event.acceptanceCriteria) {
          assertExactKeys(criterion, ['id', 'status'], [], 'VERIFICATION_PASSED acceptance criterion');
          if (typeof criterion.id !== 'string' || !ACCEPTANCE_STATUSES.has(criterion.status)) {
            throw new LoopTransitionError('VERIFICATION_PASSED contains an invalid acceptance criterion');
          }
        }
      } else {
        assertExactKeys(event, ['type'], [], event.type);
      }
      break;
    case 'VERIFICATION_FAILED':
      assertExactKeys(event, ['type', 'checkId', 'failureFingerprint'], [], event.type);
      if (typeof event.checkId !== 'string' || !CHECK_ID_PATTERN.test(event.checkId)) {
        throw new LoopTransitionError('VERIFICATION_FAILED requires a stable check ID');
      }
      if (typeof event.failureFingerprint !== 'string' || !HASH_PATTERN.test(event.failureFingerprint)) {
        throw new LoopTransitionError('VERIFICATION_FAILED requires a SHA-256 failure fingerprint');
      }
      break;
    case 'PROTECTED_PATH_DETECTED':
      assertExactKeys(event, ['type', 'paths'], [], event.type);
      normalizePathList(event.paths, 'PROTECTED_PATH_DETECTED.paths');
      break;
    case 'BUDGET_EXHAUSTED':
    case 'HUMAN_ESCALATION_REQUIRED':
      assertExactKeys(event, ['type', 'reason'], [], event.type);
      stableReason(event.reason, `${event.type}.reason`);
      break;
    default:
      throw new LoopTransitionError(`unsupported loop event type: ${event.type}`);
  }
  return event;
}

function validateContext(context) {
  assertExactKeys(context, ['policy', 'affectedPaths', 'riskResult'], CONTEXT_KEYS.filter((key) => !['policy', 'affectedPaths', 'riskResult'].includes(key)), 'LoopContext');
  const now = context.now === undefined ? new Date() : new Date(context.now);
  if (!Number.isFinite(now.getTime())) throw new LoopTransitionError('LoopContext.now must be a valid timestamp');
  const affectedPaths = normalizePathList(context.affectedPaths, 'affectedPaths');
  const criticalActions = context.criticalActions ?? [];
  if (!Array.isArray(criticalActions) || criticalActions.some((action) => typeof action !== 'string')) {
    throw new LoopTransitionError('criticalActions must be an array of stable identifiers');
  }
  let expectedRisk;
  try {
    expectedRisk = classifyRisk({ paths: affectedPaths, actions: criticalActions }, context.policy);
  } catch (error) {
    throw new LoopTransitionError(`LoopContext risk policy is invalid: ${error.message}`);
  }
  validateRiskResult(context.riskResult, expectedRisk);

  const protectedPathsTouched = normalizePathList(context.protectedPathsTouched ?? [], 'protectedPathsTouched');
  for (const protectedPath of protectedPathsTouched) {
    if (!affectedPaths.includes(protectedPath)) {
      throw new LoopTransitionError('protectedPathsTouched must be within affectedPaths');
    }
    const pathRisk = classifyRisk({ paths: [protectedPath] }, context.policy);
    const isProtected = pathRisk.matchedRules.some((rule) => rule.startsWith('protectedPaths.high:') || rule.startsWith('protectedPaths.critical:'));
    if (!isProtected) throw new LoopTransitionError('protectedPathsTouched includes a path not protected by policy');
  }

  const approvalScopeMatches = context.humanApproval === undefined || context.humanApproval === null
    ? false
    : validateApproval(context.humanApproval, affectedPaths, now);
  if (context.currentRevision !== undefined
      && (typeof context.currentRevision !== 'string' || !REVISION_PATTERN.test(context.currentRevision))) {
    throw new LoopTransitionError('LoopContext.currentRevision must be a hexadecimal Git revision');
  }
  if (context.currentWorkspaceFingerprint !== undefined
      && (typeof context.currentWorkspaceFingerprint !== 'string'
        || !WORKSPACE_FINGERPRINT_PATTERN.test(context.currentWorkspaceFingerprint))) {
    throw new LoopTransitionError('LoopContext.currentWorkspaceFingerprint must be a SHA-256 fingerprint');
  }
  if (context.verificationResult !== undefined && context.verificationResult !== null) {
    validateVerificationResult(context.verificationResult);
  }
  if (context.failureClassification !== undefined && context.failureClassification !== null) {
    if (!isPlainObject(context.failureClassification)) throw new LoopTransitionError('failureClassification must be an object');
  }

  return {
    ...context,
    affectedPaths,
    criticalActions,
    protectedPathsTouched,
    approvalScopeMatches,
    now,
    riskResult: expectedRisk,
  };
}

function maxRisk(left, right) {
  return RISK_INDEX.get(left) >= RISK_INDEX.get(right) ? left : right;
}

function updateRiskAndProtectedPaths(state, context) {
  state.risk = maxRisk(state.risk, context.riskResult.level);
  state.protectedPathsTouched = [...new Set([
    ...state.protectedPathsTouched,
    ...context.protectedPathsTouched,
  ])].sort();
}

function setEscalated(state, reason) {
  state.phase = 'escalated';
  state.escalationReason = stableReason(reason, 'escalation reason');
  return state;
}

function updateTimestamp(state, now) {
  const timestamp = Math.max(Date.parse(state.updatedAt), now.getTime());
  state.updatedAt = new Date(timestamp).toISOString();
  return validateLoopState(state);
}

function finalize(state, context) {
  return updateTimestamp(state, context.now);
}

function approvalFailure(state, context) {
  if (state.risk === 'critical' || context.riskResult.level === 'critical') return 'critical_risk';
  if (state.risk === 'high' || context.riskResult.requiresHumanApproval) {
    if (!context.humanApproval) return 'human_approval_required';
    return context.approvalScopeMatches ? 'human_approval_unverified' : 'approval_scope_mismatch';
  }
  return null;
}

function criteriaForEvent(criteria, state, allowedStatuses) {
  if (criteria.length !== state.acceptanceCriteria.length) {
    throw new LoopTransitionError('acceptance criteria must match the task accepted in LoopState');
  }
  const expectedById = new Map(state.acceptanceCriteria.map((criterion) => [criterion.id, criterion]));
  const seen = new Set();
  const nextCriteria = criteria.map(({ id, status }) => {
    const previous = expectedById.get(id);
    if (!previous || seen.has(id)) throw new LoopTransitionError('acceptance criteria IDs must match LoopState exactly');
    if (!allowedStatuses.has(status)) throw new LoopTransitionError('acceptance criterion status is invalid for this event');
    seen.add(id);
    return { id, status };
  });
  return nextCriteria;
}

function setLastVerification(state, checkId, fingerprint, verificationResult) {
  const matchingCommand = Array.isArray(verificationResult?.commands)
    ? verificationResult.commands.find((command) => command && command.id === checkId)
    : undefined;
  const exitCode = matchingCommand && Number.isSafeInteger(matchingCommand.exitCode) ? matchingCommand.exitCode : null;
  state.lastVerification = {
    command: checkId,
    exitCode,
    failedCheck: checkId,
    failureFingerprint: fingerprint,
  };
}

function sameClassification(left, right) {
  return left.category === right.category
    && left.mayRepair === right.mayRepair
    && left.retryWithinBudget === right.retryWithinBudget
    && left.reasonCode === right.reasonCode;
}

function classifyEventFailure(event, context, state) {
  if (!context.failureEvidence) throw new LoopTransitionError('VERIFICATION_FAILED requires structured failureEvidence');
  if (!context.verificationResult || context.verificationResult.passed !== false) {
    throw new LoopTransitionError('VERIFICATION_FAILED requires a failed VerificationResult');
  }
  if (context.failureEvidence.checkId !== event.checkId) {
    throw new LoopTransitionError('failure evidence checkId does not match the event');
  }
  let classification;
  try {
    classification = classifyFailure(context.failureEvidence);
  } catch (error) {
    throw new LoopTransitionError(`failure evidence is invalid: ${error.message}`);
  }
  if (context.failureEvidence.currentRevision.toLowerCase() !== state.headSha.toLowerCase()) {
    classification = Object.freeze({
      category: 'ambiguous',
      mayRepair: false,
      retryWithinBudget: false,
      reasonCode: 'stale_failure_evidence',
    });
  }
  if (context.failureClassification) validateClassification(context.failureClassification, classification);
  return classification;
}

function handleEvent(state, event, context) {
  if (state.phase === 'done' || state.phase === 'escalated') {
    throw new LoopTransitionError(`terminal phase ${state.phase} rejects further events`);
  }

  switch (event.type) {
    case 'TASK_ACCEPTED': {
      if (state.phase !== 'inspect') throw new LoopTransitionError('TASK_ACCEPTED is only valid during inspect');
      if (event.taskId !== state.taskId) throw new LoopTransitionError('TASK_ACCEPTED taskId does not match LoopState');
      const accepted = criteriaForEvent(event.acceptanceCriteria, state, new Set(['pending']));
      if (accepted.some((criterion, index) => criterion.id !== state.acceptanceCriteria[index].id)) {
        throw new LoopTransitionError('TASK_ACCEPTED criterion order must match LoopState');
      }
      state.acceptanceCriteria = accepted;
      return state;
    }
    case 'IMPLEMENTATION_STARTED': {
      if (state.phase !== 'inspect' && state.phase !== 'repair') {
        throw new LoopTransitionError('IMPLEMENTATION_STARTED is only valid during inspect or repair');
      }
      const denied = approvalFailure(state, context);
      if (denied) return setEscalated(state, denied);
      const budget = evaluateBudgets(state, context.policy, context.diff);
      if (budget.stop) return setEscalated(state, budget.reason);
      state.iteration += 1;
      if (state.phase === 'inspect') state.phase = 'implement';
      return state;
    }
    case 'VERIFICATION_STARTED': {
      if (state.phase !== 'implement' && state.phase !== 'repair') {
        throw new LoopTransitionError('VERIFICATION_STARTED is only valid after implementation or repair');
      }
      if (state.risk === 'critical') return setEscalated(state, 'critical_risk');
      if (!context.currentRevision) throw new LoopTransitionError('VERIFICATION_STARTED requires the current Git revision');
      state.headSha = context.currentRevision.toLowerCase();
      state.phase = 'verify';
      return state;
    }
    case 'VERIFICATION_PASSED': {
      if (state.phase !== 'verify') throw new LoopTransitionError('VERIFICATION_PASSED is only valid during verify');
      if (!context.verificationResult) throw new LoopTransitionError('VERIFICATION_PASSED requires a VerificationResult');
      if (!context.verificationResult.complete) return setEscalated(state, 'verification_incomplete');
      if (!context.verificationResult.passed) return setEscalated(state, 'verification_not_passed');
      if (!context.currentRevision
          || !context.verificationResult.revisionStable
          || context.currentRevision.toLowerCase() !== state.headSha.toLowerCase()
          || context.verificationResult.verifiedRevision.toLowerCase() !== state.headSha.toLowerCase()
          || context.verificationResult.currentRevision.toLowerCase() !== state.headSha.toLowerCase()
          || !context.currentWorkspaceFingerprint
          || !context.verificationResult.workspaceStable
          || context.verificationResult.verifiedWorkspaceFingerprint.toLowerCase()
            !== context.verificationResult.currentWorkspaceFingerprint.toLowerCase()
          || context.currentWorkspaceFingerprint.toLowerCase()
            !== context.verificationResult.currentWorkspaceFingerprint.toLowerCase()) {
        return setEscalated(state, 'stale_verification_result');
      }
      const criteria = criteriaForEvent(event.acceptanceCriteria, state, ACCEPTANCE_STATUSES);
      state.acceptanceCriteria = criteria;
      if (criteria.some((criterion) => criterion.status !== 'passed')) {
        return setEscalated(state, 'acceptance_criteria_incomplete');
      }
      state.phase = 'done';
      state.escalationReason = null;
      return state;
    }
    case 'VERIFICATION_FAILED': {
      if (state.phase !== 'verify') throw new LoopTransitionError('VERIFICATION_FAILED is only valid during verify');
      const classification = classifyEventFailure(event, context, state);
      setLastVerification(state, event.checkId, event.failureFingerprint, context.verificationResult);

      if (classification.category === 'branch-caused' && classification.mayRepair) {
        const withFailure = recordFailure(state, event.failureFingerprint);
        Object.assign(state, withFailure);
        const budget = evaluateBudgets(state, context.policy, context.diff);
        if (budget.stop) return setEscalated(state, budget.reason);
        const denied = approvalFailure(state, context);
        if (denied) return setEscalated(state, denied);
        state.phase = 'repair';
        return state;
      }

      if (classification.category === 'flaky' && classification.retryWithinBudget) {
        const budget = evaluateBudgets(state, context.policy, context.diff);
        if (budget.stop) return setEscalated(state, budget.reason);
        state.ciRetryCount += 1;
        state.phase = 'verify';
        return state;
      }

      const escalationReasons = {
        infrastructure: 'failure_infrastructure',
        protected: 'failure_protected',
        ambiguous: classification.reasonCode === 'stale_failure_evidence' ? 'stale_failure_evidence' : 'failure_ambiguous',
      };
      return setEscalated(state, escalationReasons[classification.category] ?? 'failure_ambiguous');
    }
    case 'PROTECTED_PATH_DETECTED': {
      if (state.phase !== 'inspect' && state.phase !== 'implement' && state.phase !== 'verify' && state.phase !== 'repair') {
        throw new LoopTransitionError('PROTECTED_PATH_DETECTED is only valid during an active phase');
      }
      const paths = normalizePathList(event.paths, 'PROTECTED_PATH_DETECTED.paths');
      for (const protectedPath of paths) {
        if (!context.affectedPaths.includes(protectedPath)) {
          throw new LoopTransitionError('detected protected paths must be included in affectedPaths');
        }
        const match = classifyRisk({ paths: [protectedPath] }, context.policy).matchedRules;
        if (!match.some((rule) => rule.startsWith('protectedPaths.high:') || rule.startsWith('protectedPaths.critical:'))) {
          throw new LoopTransitionError('PROTECTED_PATH_DETECTED includes a path not protected by policy');
        }
      }
      state.protectedPathsTouched = [...new Set([...state.protectedPathsTouched, ...paths])].sort();
      state.risk = maxRisk(state.risk, context.riskResult.level);
      const denied = approvalFailure(state, context);
      if (denied) return setEscalated(state, denied);
      return state;
    }
    case 'BUDGET_EXHAUSTED':
      return setEscalated(state, event.reason);
    case 'HUMAN_ESCALATION_REQUIRED':
      return setEscalated(state, event.reason);
    default:
      throw new LoopTransitionError('unsupported loop event type');
  }
}

export function advanceLoop(state, event, context) {
  try {
    validateLoopState(state);
  } catch (error) {
    throw new LoopTransitionError(`LoopState is invalid: ${error.message}`);
  }
  validateEvent(event);
  const validatedContext = validateContext(context);
  const next = structuredClone(state);
  updateRiskAndProtectedPaths(next, validatedContext);
  const advanced = handleEvent(next, event, validatedContext);
  return finalize(advanced, validatedContext);
}
