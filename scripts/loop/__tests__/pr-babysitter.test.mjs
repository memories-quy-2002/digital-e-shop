import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';

import { normalizeCheckObservation, normalizeRequiredCheckSnapshot } from '../pr-evidence.mjs';
import {
  createPrBabysitterState,
  recordActionableFailure,
  recordCheckObservation,
  recordFlakyRetry,
  recordRepairRequest,
} from '../pr-state.mjs';
import { PrDecisionInputError, decidePrAction } from '../pr-babysitter.mjs';

const headSha = 'a'.repeat(40);
const nextHeadSha = 'b'.repeat(40);
const baseSha = 'd'.repeat(40);
const mergeSha = 'e'.repeat(40);
const nextBaseSha = 'f'.repeat(40);
const nextMergeSha = '1'.repeat(40);
const failureFingerprint = 'c'.repeat(64);
const otherFailureFingerprint = 'd'.repeat(64);

const policy = Object.freeze({
  schemaVersion: 1,
  protectedPaths: { high: [], critical: [] },
  riskRules: {
    low: [],
    medium: [],
    high: [],
    highRiskActions: ['stage1_required_check_recovery'],
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
});

function prSnapshot(overrides = {}) {
  return {
    repository: 'Owner/Repo',
    number: 42,
    state: 'open',
    draft: false,
    baseRef: 'main',
    baseSha,
    headRef: 'feature/babysitter',
    headSha,
    mergeSha,
    headRepository: 'Owner/Repo',
    updatedAt: '2026-09-28T03:04:05.000Z',
    ...overrides,
  };
}

function requiredCheckSnapshot(
  checks = [{ context: 'unit', appId: 1234 }],
  collectionStatus = 'complete',
  requiredWorkflows = [],
) {
  return normalizeRequiredCheckSnapshot({
    baseRef: 'main',
    policyFingerprint: 'e'.repeat(64),
    requiredChecks: checks,
    requiredWorkflows,
    collectionStatus,
  });
}

function check(overrides = {}) {
  const conclusion = Object.hasOwn(overrides, 'conclusion') ? overrides.conclusion : 'success';
  const input = {
    checkId: 'check-unit-1',
    requiredCheckKey: 'unit|app:1234',
    requiredWorkflowKey: null,
    provider: 'github-check',
    headSha,
    baseSha,
    mergeSha,
    testedSha: mergeSha,
    attemptKey: 'run-1001-attempt-1',
    status: 'completed',
    conclusion,
    runnerOutcome: null,
    coversRelevantScope: true,
    protectedPathTouched: false,
    failureFingerprint: conclusion === 'failure' ? failureFingerprint : null,
    ...overrides,
  };
  return normalizeCheckObservation(input);
}

function createState(pr = prSnapshot()) {
  return createPrBabysitterState(pr);
}

function recordObservations(state, observations) {
  let next = state;
  for (const observation of observations) {
    next = recordCheckObservation(next, observation);
    if (observation.status === 'completed' && observation.conclusion === 'failure') {
      next = recordActionableFailure(next, {
        headSha: observation.headSha,
        baseSha: observation.baseSha,
        mergeSha: observation.mergeSha,
        attemptKey: observation.attemptKey,
        failureFingerprint: observation.failureFingerprint,
      });
    }
  }
  return next;
}

function input(overrides = {}) {
  const pr = overrides.prSnapshot ?? prSnapshot();
  return {
    prSnapshot: pr,
    requiredCheckSnapshot: requiredCheckSnapshot(),
    checkObservations: [],
    checkCollectionComplete: true,
    prState: createState(pr),
    policy,
    ...overrides,
  };
}

function inputWithObservations(observations, overrides = {}) {
  const base = input(overrides);
  return {
    ...base,
    checkObservations: observations,
    prState: recordObservations(base.prState, observations.filter((item) => (
      item.headSha === base.prSnapshot.headSha
      && item.baseSha === base.prSnapshot.baseSha
      && item.mergeSha === base.prSnapshot.mergeSha
    ))),
  };
}

describe('PR Babysitter decision engine', () => {
  it('loads the decision module without Node built-in dependencies', () => {
    const decisionModuleUrl = new URL('../pr-babysitter.mjs', import.meta.url).href;
    const script = [
      "import { registerHooks } from 'node:module';",
      'registerHooks({ resolve(specifier, context, nextResolve) {',
      "  if (specifier.startsWith('node:')) throw new Error(`Node built-in import denied: ${specifier}`);",
      '  return nextResolve(specifier, context);',
      '}});',
      `await import(${JSON.stringify(decisionModuleUrl)});`,
    ].join('\n');
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  });

  it('waits while a required check is pending', () => {
    const pending = check({ status: 'in_progress', conclusion: null });

    const decision = decidePrAction(inputWithObservations([pending]));

    assert.equal(decision.action, 'wait');
    assert.equal(decision.reasonCode, 'required_checks_pending');
  });

  it('returns ready-for-human only when all required checks are green and evidence is complete', () => {
    const decision = decidePrAction(inputWithObservations([check()]));

    assert.equal(decision.action, 'ready-for-human');
    assert.equal(decision.reasonCode, 'all_required_checks_green');
    assert.deepEqual(decision.checkIds, ['check-unit-1']);
    assert.equal(decision.requiredCheckPolicyFingerprint, 'e'.repeat(64));
    assert.equal(decision.headSha, headSha);
    assert.equal(decision.baseSha, baseSha);
    assert.equal(decision.mergeSha, mergeSha);
  });

  it('observes green checks on a same-repository draft PR without granting merge authority', () => {
    const draft = prSnapshot({ draft: true });
    const decision = decidePrAction(inputWithObservations([check()], { prSnapshot: draft }));

    assert.equal(draft.headRepository, draft.repository);
    assert.equal(decision.action, 'ready-for-human');
    assert.equal(decision.reasonCode, 'all_required_checks_green');
    assert.equal(Object.hasOwn(decision, 'merge'), false);
  });

  it('treats completed neutral and skipped required checks as successful', () => {
    for (const conclusion of ['neutral', 'skipped']) {
      const decision = decidePrAction(inputWithObservations([check({ conclusion })]));

      assert.equal(decision.action, 'ready-for-human');
      assert.equal(decision.reasonCode, 'all_required_checks_green');
    }
  });

  it('does not apply a run-local wall-clock limit from PR state', () => {
    const failed = check({ conclusion: 'failure' });
    const prepared = inputWithObservations([failed]);
    const oldPrState = {
      ...prepared.prState,
      startedAt: new Date(Date.now() - (policy.stopConditions.maxWallClockSeconds + 1) * 1000).toISOString(),
    };

    const decision = decidePrAction({ ...prepared, prState: oldPrState });

    assert.equal(decision.action, 'request-repair');
  });

  it('waits for unavailable, incomplete, missing, stale, or partially collected evidence', () => {
    const failed = check({ conclusion: 'failure' });
    const failedInput = inputWithObservations([failed]);

    assert.equal(decidePrAction({ ...failedInput, requiredCheckSnapshot: requiredCheckSnapshot(undefined, 'incomplete') }).action, 'wait');
    assert.equal(decidePrAction({ ...failedInput, requiredCheckSnapshot: requiredCheckSnapshot(undefined, 'unavailable') }).action, 'wait');
    assert.equal(decidePrAction({ ...failedInput, checkCollectionComplete: false }).action, 'wait');
    assert.equal(decidePrAction(input()).reasonCode, 'required_check_evidence_missing');

    const staleCases = [
      check({ headSha: nextHeadSha, conclusion: 'failure' }),
      check({ baseSha: nextBaseSha, conclusion: 'failure' }),
      check({ mergeSha: nextMergeSha, testedSha: nextMergeSha, conclusion: 'failure' }),
      check({ testedSha: nextHeadSha, conclusion: 'failure' }),
    ];
    for (const stale of staleCases) {
      const staleDecision = decidePrAction(input({ checkObservations: [stale] }));
      assert.equal(staleDecision.action, 'wait');
      assert.equal(staleDecision.reasonCode, 'stale_check_evidence');
      assert.deepEqual(staleDecision.failureFingerprints, []);
    }
  });

  it('distinguishes a confirmed complete empty required-check set from unavailable policy data', () => {
    const noRequiredChecks = requiredCheckSnapshot([], 'complete', []);

    const ready = decidePrAction(input({ requiredCheckSnapshot: noRequiredChecks }));
    const unavailable = decidePrAction(input({ requiredCheckSnapshot: requiredCheckSnapshot([], 'unavailable', []) }));

    assert.equal(ready.action, 'ready-for-human');
    assert.equal(ready.reasonCode, 'no_required_checks_policy_complete');
    assert.equal(unavailable.action, 'wait');
  });

  it('requires current evidence for every required workflow identity', () => {
    const workflow = {
      repositoryId: 1234,
      path: '.github/workflows/ci.yml',
      ref: 'feature/babysitter',
      sha: headSha,
    };
    const snapshot = requiredCheckSnapshot([], 'complete', [workflow]);
    const workflowObservation = (overrides = {}) => check({
      checkId: 'workflow-ci-run-1',
      requiredCheckKey: null,
      requiredWorkflowKey: snapshot.requiredWorkflowKeys[0],
      provider: 'github-actions',
      attemptKey: 'workflow-run-1001-attempt-1',
      ...overrides,
    });

    const ready = decidePrAction(inputWithObservations([workflowObservation()], { requiredCheckSnapshot: snapshot }));
    assert.equal(ready.action, 'ready-for-human');
    assert.equal(ready.reasonCode, 'all_required_checks_green');
    assert.deepEqual(ready.checkIds, ['workflow-ci-run-1']);

    for (const conclusion of ['neutral', 'skipped']) {
      const accepted = decidePrAction(inputWithObservations([
        workflowObservation({ conclusion }),
      ], { requiredCheckSnapshot: snapshot }));
      assert.equal(accepted.action, 'ready-for-human');
      assert.equal(accepted.reasonCode, 'all_required_checks_green');
    }

    const pending = decidePrAction(inputWithObservations([
      workflowObservation({ status: 'in_progress', conclusion: null, failureFingerprint: null }),
    ], { requiredCheckSnapshot: snapshot }));
    assert.equal(pending.action, 'wait');
    assert.equal(pending.reasonCode, 'required_checks_pending');

    const failed = decidePrAction(inputWithObservations([
      workflowObservation({ conclusion: 'failure' }),
    ], { requiredCheckSnapshot: snapshot }));
    assert.equal(failed.action, 'request-repair');
    assert.equal(failed.reasonCode, 'relevant_check_failed');

    const unavailable = decidePrAction(input({
      requiredCheckSnapshot: requiredCheckSnapshot([], 'unavailable', [workflow]),
    }));
    assert.equal(unavailable.action, 'wait');
    assert.equal(unavailable.reasonCode, 'required_check_policy_unavailable');

    const missing = decidePrAction(input({ requiredCheckSnapshot: snapshot }));
    assert.equal(missing.action, 'wait');
    assert.equal(missing.reasonCode, 'required_workflow_evidence_missing');

    const otherWorkflowSnapshot = requiredCheckSnapshot([], 'complete', [{
      ...workflow,
      path: '.github/workflows/other.yml',
    }]);
    const wrongIdentity = check({
      checkId: 'workflow-ci-run-other',
      requiredCheckKey: null,
      requiredWorkflowKey: otherWorkflowSnapshot.requiredWorkflowKeys[0],
      provider: 'github-actions',
    });
    const mismatched = decidePrAction(inputWithObservations([wrongIdentity], { requiredCheckSnapshot: snapshot }));
    assert.equal(mismatched.action, 'wait');
    assert.equal(mismatched.reasonCode, 'required_workflow_evidence_missing');
  });

  it('waits when a required workflow has multiple matching run attempts', () => {
    const workflow = {
      repositoryId: 1234,
      path: '.github/workflows/ci.yml',
      ref: 'feature/babysitter',
      sha: headSha,
    };
    const snapshot = requiredCheckSnapshot([], 'complete', [workflow]);
    const key = snapshot.requiredWorkflowKeys[0];
    const observations = [
      check({ checkId: 'workflow-ci-run-1', requiredCheckKey: null, requiredWorkflowKey: key, provider: 'github-actions' }),
      check({ checkId: 'workflow-ci-run-2', requiredCheckKey: null, requiredWorkflowKey: key, provider: 'github-actions', attemptKey: 'workflow-run-1002-attempt-1' }),
    ];

    const decision = decidePrAction(inputWithObservations(observations, { requiredCheckSnapshot: snapshot }));

    assert.equal(decision.action, 'wait');
    assert.equal(decision.reasonCode, 'multiple_required_workflow_attempts');
  });

  it('requests a repair for one revision-bound branch-caused failure', () => {
    const failed = check({ conclusion: 'failure' });

    const decision = decidePrAction(inputWithObservations([failed]));

    assert.equal(decision.action, 'request-repair');
    assert.equal(decision.reasonCode, 'relevant_check_failed');
    assert.deepEqual(decision.checkIds, ['check-unit-1']);
    assert.deepEqual(decision.failureFingerprints, [failureFingerprint]);
    assert.equal(decision.repairBudgetRemaining, 5);
  });

  it('escalates protected, infrastructure, and ambiguous failures', () => {
    const cases = [
      [check({ conclusion: 'failure', protectedPathTouched: true }), 'protected_path_touched'],
      [check({ conclusion: 'failure', runnerOutcome: 'runner_error' }), 'runner_error'],
      [check({ conclusion: 'failure', coversRelevantScope: false }), 'check_scope_not_relevant'],
    ];

    for (const [failed, reasonCode] of cases) {
      const decision = decidePrAction(inputWithObservations([failed]));
      assert.equal(decision.action, 'escalate');
      assert.equal(decision.reasonCode, reasonCode);
    }
  });

  it('escalates a mixed branch-caused and protected failure batch', () => {
    const checks = [
      check({ conclusion: 'failure', attemptKey: 'run-1001-attempt-1' }),
      check({
        checkId: 'check-security-1',
        requiredCheckKey: 'security|app:2345',
        attemptKey: 'run-1002-attempt-1',
        conclusion: 'failure',
        failureFingerprint: otherFailureFingerprint,
        protectedPathTouched: true,
      }),
    ];

    const decision = decidePrAction(inputWithObservations(checks, {
      requiredCheckSnapshot: requiredCheckSnapshot([
        { context: 'unit', appId: 1234 },
        { context: 'security', appId: 2345 },
      ]),
    }));

    assert.equal(decision.action, 'escalate');
    assert.equal(decision.reasonCode, 'mixed_failure_categories');
  });

  it('retries a flaky failure while its per-check retry budget remains', () => {
    const failed = check({ conclusion: 'failure', previouslyPassedRevision: mergeSha });

    const decision = decidePrAction(inputWithObservations([failed]));

    assert.equal(decision.action, 'retry-check');
    assert.equal(decision.reasonCode, 'same_revision_pass_then_fail');
    assert.equal(decision.retryBudgetRemaining, 3);
  });

  it('escalates when the flaky retry budget is exhausted', () => {
    const failed = check({ conclusion: 'failure', previouslyPassedRevision: mergeSha });
    let prState = recordObservations(createState(), [failed]);
    for (let index = 0; index < policy.stopConditions.maxFlakyRetries; index += 1) {
      prState = recordFlakyRetry(prState, failed.checkId);
    }

    const decision = decidePrAction(input({ checkObservations: [failed], prState }));

    assert.equal(decision.action, 'escalate');
    assert.equal(decision.reasonCode, 'max_flaky_retries');
    assert.equal(decision.retryBudgetRemaining, 0);
  });

  it('escalates when the same branch-caused fingerprint reaches maxSameFailure', () => {
    const previous = check({ conclusion: 'failure', attemptKey: 'run-1001-attempt-1' });
    const current = check({ conclusion: 'failure', attemptKey: 'run-1001-attempt-2' });
    const prState = recordObservations(createState(), [previous, current]);

    const decision = decidePrAction(input({ checkObservations: [current], prState }));

    assert.equal(prState.actionableFailureCounts[failureFingerprint], 2);
    assert.equal(decision.action, 'escalate');
    assert.equal(decision.reasonCode, 'max_same_failure');
  });

  it('does not combine counts from different fingerprints', () => {
    const previous = check({ conclusion: 'failure', attemptKey: 'run-1001-attempt-1' });
    const current = check({
      checkId: 'check-unit-2',
      attemptKey: 'run-1001-attempt-2',
      conclusion: 'failure',
      failureFingerprint: otherFailureFingerprint,
    });
    const prState = recordObservations(createState(), [previous, current]);

    const decision = decidePrAction(input({ checkObservations: [current], prState }));

    assert.deepEqual(prState.actionableFailureCounts, { [failureFingerprint]: 1, [otherFailureFingerprint]: 1 });
    assert.equal(decision.action, 'request-repair');
  });

  it('does not consume a second failure count or duplicate check ID for repeated delivery', () => {
    const failed = check({ conclusion: 'failure' });
    const prepared = inputWithObservations([failed, failed]);

    const decision = decidePrAction(prepared);

    assert.equal(prepared.prState.actionableFailureCounts[failureFingerprint], 1);
    assert.equal(decision.action, 'request-repair');
    assert.deepEqual(decision.checkIds, ['check-unit-1']);
  });

  it('escalates at the PR-wide repair limit without confusing it with same-failure counts', () => {
    const failed = check({ conclusion: 'failure' });
    let prState = recordObservations(createState(), [failed]);
    for (let index = 0; index < policy.stopConditions.maxIterations; index += 1) {
      prState = recordRepairRequest(prState, { reasonCode: 'relevant_check_failed' });
    }

    const decision = decidePrAction(input({ checkObservations: [failed], prState }));

    assert.equal(decision.action, 'escalate');
    assert.equal(decision.reasonCode, 'max_repair_requests');
    assert.equal(decision.repairBudgetRemaining, 0);
  });

  it('never requests repair for closed, misbased, main-head, or forked PRs', () => {
    const failed = check({ conclusion: 'failure' });
    const cases = [
      [prSnapshot({ state: 'closed' }), 'pr_not_open'],
      [prSnapshot({ baseRef: 'release' }), 'base_not_main'],
      [prSnapshot({ headRef: 'main' }), 'head_is_main'],
      [prSnapshot({ headRepository: 'fork/repo' }), 'forked_head'],
    ];

    for (const [pr, reasonCode] of cases) {
      const prState = recordObservations(createState(pr), [check({ conclusion: 'failure', headSha: pr.headSha })]);
      const decision = decidePrAction(input({ prSnapshot: pr, checkObservations: [failed], prState }));
      assert.equal(decision.action, 'escalate');
      assert.equal(decision.reasonCode, reasonCode);
    }
  });

  it('waits when PR state belongs to another head or repository', () => {
    const failed = check({ conclusion: 'failure' });
    const staleState = createState(prSnapshot({ headSha: nextHeadSha }));
    const staleDecision = decidePrAction(input({ checkObservations: [failed], prState: staleState }));
    const otherRepositoryState = createState(prSnapshot({ repository: 'elsewhere/repo', headRepository: 'elsewhere/repo' }));
    const mismatchedStateDecision = decidePrAction(input({ checkObservations: [failed], prState: otherRepositoryState }));

    assert.equal(staleDecision.action, 'wait');
    assert.equal(staleDecision.reasonCode, 'state_head_sha_mismatch');
    assert.equal(mismatchedStateDecision.action, 'escalate');
    assert.equal(mismatchedStateDecision.reasonCode, 'state_pr_mismatch');
  });

  it('waits when PR state has the right head but a stale base or merge SHA', () => {
    const pr = prSnapshot();
    const state = createState({ ...pr, baseSha: nextBaseSha });
    const baseDecision = decidePrAction(input({ prState: state }));
    const mergeState = createState({ ...pr, mergeSha: nextMergeSha });
    const mergeDecision = decidePrAction(input({ prState: mergeState }));

    assert.equal(baseDecision.action, 'wait');
    assert.equal(baseDecision.reasonCode, 'state_base_sha_mismatch');
    assert.equal(mergeDecision.action, 'wait');
    assert.equal(mergeDecision.reasonCode, 'state_merge_sha_mismatch');
  });

  it('rejects unknown decision inputs and conflicting deliveries for one attempt', () => {
    assert.throws(() => decidePrAction({ ...input(), prompt: 'do something' }), PrDecisionInputError);
    const failed = check({ conclusion: 'failure' });
    const conflict = check({ ...failed, failureFingerprint: otherFailureFingerprint });
    const prepared = inputWithObservations([failed]);
    const decision = decidePrAction({ ...prepared, checkObservations: [failed, conflict] });

    assert.equal(decision.action, 'escalate');
    assert.equal(decision.reasonCode, 'conflicting_attempt_evidence');
  });

  it('rejects malformed canonical action lists at the PR policy boundary', () => {
    const invalidRiskRules = [
      { ...policy.riskRules, highRiskActions: [] },
      { ...policy.riskRules, highRiskActions: ['stage1_required_check_recovery', 'stage1_required_check_recovery'] },
      { ...policy.riskRules, highRiskActions: ['unknown_action'] },
      { ...policy.riskRules, highRiskActions: ['production_db_mutation'] },
      { ...policy.riskRules, criticalActions: [...policy.riskRules.criticalActions, 'unknown_action'] },
      { ...policy.riskRules, criticalActions: [...policy.riskRules.criticalActions, 'production_db_mutation'] },
      { ...policy.riskRules, criticalActions: [...policy.riskRules.criticalActions, 'stage1_required_check_recovery'] },
      { ...policy.riskRules, criticalActions: [...policy.riskRules.criticalActions, 'branch_protection_bypass'] },
      { ...policy.riskRules, criticalActions: policy.riskRules.criticalActions.slice(1) },
    ];
    for (const riskRules of invalidRiskRules) {
      assert.throws(() => decidePrAction(input({ policy: { ...policy, riskRules } })), PrDecisionInputError);
    }
  });
});
