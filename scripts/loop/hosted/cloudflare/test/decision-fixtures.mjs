import { createPrBabysitterState, recordCheckObservation } from '../../../pr-state-contract.mjs';
import { normalizeRequiredCheckSnapshot } from '../../../pr-evidence.mjs';

const headSha = 'a'.repeat(40);
const baseSha = 'd'.repeat(40);
const mergeSha = 'e'.repeat(40);

const prSnapshot = {
  repository: 'Owner/Repo',
  number: 42,
  state: 'open',
  draft: false,
  baseRef: 'main',
  baseSha,
  headRef: 'feature/hosted-stage0',
  headSha,
  mergeSha,
  headRepository: 'Owner/Repo',
  updatedAt: '2026-09-30T03:04:05.000Z',
};

const policy = {
  schemaVersion: 1,
  protectedPaths: { high: [], critical: [] },
  riskRules: {
    low: [],
    medium: [],
    high: [],
    criticalActions: [
      'production_secret_access',
      'production_db_mutation',
      'branch_protection_bypass',
      'direct_push_main',
      'disable_security_checks',
      'production_deployment_promotion',
    ],
  },
  stopConditions: {
    maxIterations: 5,
    maxSameFailure: 2,
    maxFlakyRetries: 3,
    maxChangedFiles: 25,
    maxChangedLines: 1000,
    maxWallClockSeconds: 1800,
    tokenLimit: null,
    ciRunLimit: null,
  },
};

function checkObservation(status, conclusion) {
  return {
    checkId: 'check-unit-1',
    requiredCheckKey: 'unit|app:1234',
    requiredWorkflowKey: null,
    provider: 'github-check',
    headSha,
    baseSha,
    mergeSha,
    testedSha: mergeSha,
    attemptKey: 'run-1001-attempt-1',
    status,
    conclusion,
    runnerOutcome: null,
    coversRelevantScope: true,
    protectedPathTouched: false,
    failureFingerprint: null,
  };
}

function createInput(observation) {
  return {
    prSnapshot,
    requiredCheckSnapshot: normalizeRequiredCheckSnapshot({
      baseRef: 'main',
      policyFingerprint: 'f'.repeat(64),
      requiredChecks: [{ context: 'unit', appId: 1234 }],
      requiredWorkflows: [],
      collectionStatus: 'complete',
    }),
    checkObservations: [observation],
    checkCollectionComplete: true,
    prState: recordCheckObservation(createPrBabysitterState(prSnapshot), observation),
    policy,
  };
}

export const decisionFixtures = Object.freeze([
  Object.freeze({
    name: 'pending required check',
    input: createInput(checkObservation('in_progress', null)),
    expected: Object.freeze({ action: 'wait', reasonCode: 'required_checks_pending' }),
  }),
  Object.freeze({
    name: 'green required check',
    input: createInput(checkObservation('completed', 'success')),
    expected: Object.freeze({ action: 'ready-for-human', reasonCode: 'all_required_checks_green' }),
  }),
]);
