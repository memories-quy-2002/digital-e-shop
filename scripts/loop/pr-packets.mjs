import { classifyFailure } from './classify-failure.mjs';
import { normalizeRepoPath } from './classify-risk.mjs';
import {
  buildFailureEvidence,
  normalizeCheckObservation,
  normalizePrSnapshot,
  PrEvidenceError,
} from './pr-evidence.mjs';
import { validatePrBabysitterState, PrBabysitterStateValidationError } from './pr-state.mjs';
import { buildVerificationPlan, redactVerificationOutput } from './verify.mjs';

const REVISION_PATTERN = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i;
const FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/i;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/;
const FAILURE_CATEGORIES = new Set(['branch-caused', 'flaky', 'infrastructure', 'protected', 'ambiguous']);
const ACTIONS = new Set(['wait', 'retry-check', 'request-repair', 'escalate', 'ready-for-human']);
const MAX_OBSERVATIONS = 1_000;
const MAX_PATHS = 1_000;
const MAX_LOG_EXCERPTS = 100;
const MAX_RAW_LOG_BYTES = 256 * 1024;
const MAX_LOG_EXCERPT_BYTES = 2_048;
const MAX_VERIFICATION_OUTPUT_BYTES = 8_192;
const HUMAN_CHOICES = Object.freeze([
  'review_evidence',
  'recollect_checks',
  'provide_human_diagnosis',
  'close_pr',
]);

function assertPlainObject(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be a plain object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError(`${label} must be a plain object`);
}

function assertExactKeys(value, required, optional, label) {
  assertPlainObject(value, label);
  const allowed = new Set([...required, ...optional]);
  if (Object.keys(value).some((key) => !allowed.has(key))) throw new TypeError(`${label} contains unsupported fields`);
  if (required.some((key) => !Object.hasOwn(value, key))) throw new TypeError(`${label} is missing required fields`);
}

function normalizeDecision(decision) {
  assertExactKeys(decision, [
    'action',
    'reasonCode',
    'headSha',
    'baseSha',
    'mergeSha',
    'requiredCheckPolicyFingerprint',
    'checkIds',
    'failureFingerprints',
    'retryBudgetRemaining',
    'repairBudgetRemaining',
  ], [], 'decision');
  if (!ACTIONS.has(decision.action)) throw new TypeError('decision action is unsupported');
  if (typeof decision.reasonCode !== 'string' || !IDENTIFIER_PATTERN.test(decision.reasonCode)) {
    throw new TypeError('decision reasonCode must be a stable identifier');
  }
  for (const key of ['headSha', 'baseSha']) {
    if (typeof decision[key] !== 'string' || !REVISION_PATTERN.test(decision[key])) {
      throw new TypeError(`decision ${key} must be a full Git revision`);
    }
  }
  if (decision.mergeSha !== null && (typeof decision.mergeSha !== 'string' || !REVISION_PATTERN.test(decision.mergeSha))) {
    throw new TypeError('decision mergeSha must be a full Git revision or null');
  }
  if (typeof decision.requiredCheckPolicyFingerprint !== 'string'
      || !FINGERPRINT_PATTERN.test(decision.requiredCheckPolicyFingerprint)) {
    throw new TypeError('decision requiredCheckPolicyFingerprint must be a SHA-256 digest');
  }
  if (!Array.isArray(decision.checkIds) || decision.checkIds.length > MAX_OBSERVATIONS
      || decision.checkIds.some((id) => typeof id !== 'string' || !IDENTIFIER_PATTERN.test(id))) {
    throw new TypeError('decision checkIds must be a bounded array of stable identifiers');
  }
  if (new Set(decision.checkIds).size !== decision.checkIds.length) throw new TypeError('decision checkIds must be unique');
  if (!Array.isArray(decision.failureFingerprints)
      || decision.failureFingerprints.length > MAX_OBSERVATIONS
      || decision.failureFingerprints.some((value) => typeof value !== 'string' || !FINGERPRINT_PATTERN.test(value))) {
    throw new TypeError('decision failureFingerprints must be bounded SHA-256 digests');
  }
  if (new Set(decision.failureFingerprints).size !== decision.failureFingerprints.length) {
    throw new TypeError('decision failureFingerprints must be unique');
  }
  for (const key of ['retryBudgetRemaining', 'repairBudgetRemaining']) {
    if (!Number.isSafeInteger(decision[key]) || decision[key] < 0) {
      throw new TypeError(`decision ${key} must be a non-negative safe integer`);
    }
  }
  return decision;
}

function normalizePacketInput(input, { repair = false } = {}) {
  const commonRequired = ['prSnapshot', 'decision', 'checkObservations', 'prState'];
  const required = repair ? [...commonRequired, 'affectedPaths', 'policy'] : [...commonRequired, 'protectedPaths'];
  const optional = repair ? [] : ['verificationOutput', 'ciLogExcerpts'];
  assertExactKeys(input, required, optional, repair ? 'repair packet input' : 'escalation packet input');

  let prSnapshot;
  let checkObservations;
  try {
    prSnapshot = normalizePrSnapshot(input.prSnapshot);
    if (!Array.isArray(input.checkObservations) || input.checkObservations.length > MAX_OBSERVATIONS) {
      throw new TypeError(`checkObservations must be an array of at most ${MAX_OBSERVATIONS} entries`);
    }
    checkObservations = input.checkObservations.map(normalizeCheckObservation);
  } catch (error) {
    if (error instanceof PrEvidenceError) throw new TypeError(error.message, { cause: error });
    throw error;
  }
  const decision = normalizeDecision(input.decision);
  let prState;
  try {
    prState = validatePrBabysitterState(input.prState);
  } catch (error) {
    if (error instanceof PrBabysitterStateValidationError) throw new TypeError(error.message, { cause: error });
    throw error;
  }
  if (prState.repository !== prSnapshot.repository || prState.prNumber !== prSnapshot.number
      || prState.headSha !== prSnapshot.headSha || prState.baseSha !== prSnapshot.baseSha
      || prState.mergeSha !== prSnapshot.mergeSha) {
    throw new TypeError('PR state does not match the current PR SHA tuple');
  }
  if (decision.headSha !== prSnapshot.headSha || decision.baseSha !== prSnapshot.baseSha
      || decision.mergeSha !== prSnapshot.mergeSha) {
    throw new TypeError('decision does not match the current PR SHA tuple');
  }

  const byAttempt = new Map();
  for (const observation of checkObservations) {
    const existing = byAttempt.get(observation.attemptKey);
    if (existing && JSON.stringify(existing) !== JSON.stringify(observation)) {
      throw new TypeError('check observations contain conflicting attempt evidence');
    }
    if (!existing) byAttempt.set(observation.attemptKey, observation);
  }
  checkObservations = [...byAttempt.values()];
  const observationIds = new Set(checkObservations.map(({ checkId }) => checkId));
  if (decision.checkIds.some((id) => !observationIds.has(id))) {
    throw new TypeError('decision references a check absent from the supplied observations');
  }

  const checks = checkObservations
    .filter(({ checkId }) => decision.checkIds.includes(checkId))
    .map((observation) => {
      const evidence = buildFailureEvidence(observation, {
        currentHeadSha: prSnapshot.headSha,
        currentBaseSha: prSnapshot.baseSha,
        currentMergeSha: prSnapshot.mergeSha,
      });
      const classification = evidence?.status === 'actionable'
        ? classifyFailure(evidence.evidence).category
        : null;
      return Object.freeze({
        checkId: observation.checkId,
        attemptKey: observation.attemptKey,
        testedSha: observation.testedSha,
        status: observation.status,
        conclusion: observation.conclusion,
        failureFingerprint: observation.failureFingerprint,
        failureCategory: classification,
        attemptCount: checkObservations.filter((item) => item.checkId === observation.checkId).length,
        failureCount: observation.failureFingerprint === null
          ? 0
          : prState.actionableFailureCounts[observation.failureFingerprint] ?? 0,
        flakyRetryCount: prState.flakyRetryCounts[observation.checkId] ?? 0,
        protectedPathTouched: observation.protectedPathTouched,
        runnerOutcome: observation.runnerOutcome,
      });
    });

  return { prSnapshot, decision, prState, checks };
}

function normalizePathList(paths, label) {
  if (!Array.isArray(paths) || paths.length > MAX_PATHS) throw new TypeError(`${label} must be a bounded path array`);
  const normalized = paths.map((value) => normalizeRepoPath(value));
  if (new Set(normalized).size !== normalized.length) throw new TypeError(`${label} must not contain duplicate paths`);
  return normalized.sort();
}

function truncateUtf8(value, maxBytes) {
  const buffer = Buffer.from(value, 'utf8');
  if (buffer.length <= maxBytes) return { text: value, truncated: false };
  let text = buffer.subarray(0, maxBytes).toString('utf8');
  while (Buffer.byteLength(text, 'utf8') > maxBytes) text = text.slice(0, -1);
  return { text, truncated: true };
}

function normalizeCiLogExcerpts(excerpts, decisionCheckIds) {
  if (excerpts === undefined) return [];
  if (!Array.isArray(excerpts) || excerpts.length > MAX_LOG_EXCERPTS) {
    throw new TypeError(`ciLogExcerpts must contain at most ${MAX_LOG_EXCERPTS} entries`);
  }
  const seen = new Set();
  return excerpts.map((excerpt) => {
    assertExactKeys(excerpt, ['checkId', 'text'], [], 'CI log excerpt');
    if (typeof excerpt.checkId !== 'string' || !decisionCheckIds.includes(excerpt.checkId)) {
      throw new TypeError('CI log excerpt checkId must refer to a decision check');
    }
    if (seen.has(excerpt.checkId)) throw new TypeError('CI log excerpts must have unique check IDs');
    seen.add(excerpt.checkId);
    if (typeof excerpt.text !== 'string' || Buffer.byteLength(excerpt.text, 'utf8') > MAX_RAW_LOG_BYTES) {
      throw new TypeError(`CI log excerpt text must be at most ${MAX_RAW_LOG_BYTES} bytes`);
    }
    const redacted = redactVerificationOutput(excerpt.text);
    const bounded = truncateUtf8(redacted, MAX_LOG_EXCERPT_BYTES);
    return Object.freeze({ checkId: excerpt.checkId, ...bounded });
  });
}

function normalizeVerificationOutput(value) {
  if (value === undefined) return null;
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > 256 * 1024) {
    throw new TypeError('verificationOutput must be a string of at most 262144 bytes');
  }
  const redacted = redactVerificationOutput(value);
  return truncateUtf8(redacted, MAX_VERIFICATION_OUTPUT_BYTES).text;
}

function commonPacketFields(context) {
  const { prSnapshot, decision, checks } = context;
  return {
    schemaVersion: 1,
    repository: prSnapshot.repository,
    prNumber: prSnapshot.number,
    branch: prSnapshot.headRef,
    baseRef: prSnapshot.baseRef,
    baseSha: prSnapshot.baseSha,
    headSha: prSnapshot.headSha,
    mergeSha: prSnapshot.mergeSha,
    reasonCode: decision.reasonCode,
    failureFingerprints: [...decision.failureFingerprints].sort(),
    checks,
  };
}

export function buildEscalationPacket(input) {
  const context = normalizePacketInput(input);
  const { decision } = context;
  if (decision.action !== 'escalate') throw new TypeError('escalation packet requires an escalate decision');
  const protectedPaths = normalizePathList(input.protectedPaths, 'protectedPaths');
  return Object.freeze({
    kind: 'escalation',
    ...commonPacketFields(context),
    decision: decision.action,
    checkIds: [...decision.checkIds].sort(),
    protectedPaths,
    humanChoices: [...HUMAN_CHOICES],
    verificationOutput: normalizeVerificationOutput(input.verificationOutput),
    ciLogExcerpts: normalizeCiLogExcerpts(input.ciLogExcerpts, decision.checkIds),
  });
}

export function buildRepairPacket(input) {
  const context = normalizePacketInput(input, { repair: true });
  const { prSnapshot, decision } = context;
  if (decision.action !== 'request-repair') throw new TypeError('repair packet requires a request-repair decision');
  if (!Array.isArray(input.affectedPaths) || input.affectedPaths.length === 0) {
    throw new TypeError('affectedPaths must contain at least one path');
  }
  const requestedPathScope = normalizePathList(input.affectedPaths, 'affectedPaths');
  const verificationPlan = buildVerificationPlan({
    changedPaths: requestedPathScope,
    mode: 'fast',
    policy: input.policy,
  });
  return Object.freeze({
    kind: 'repair',
    ...commonPacketFields(context),
    allowedBranch: prSnapshot.headRef,
    decision: decision.action,
    requestedPathScope,
    failedCheckIds: [...decision.checkIds].sort(),
    verificationPlan,
    risk: verificationPlan.risk,
    remainingBudgets: {
      retry: decision.retryBudgetRemaining,
      repair: decision.repairBudgetRemaining,
    },
  });
}
