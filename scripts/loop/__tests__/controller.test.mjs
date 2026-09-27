import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { classifyRisk } from '../classify-risk.mjs';
import { advanceLoop, LoopTransitionError } from '../controller.mjs';
import { createLoopState } from '../state.mjs';
import { loadLoopPolicy } from '../policy.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const revision = 'b'.repeat(40);
const startedAt = new Date(Date.now() - 1000);
const contextNow = new Date(startedAt.getTime() + 1000);
let policy;

before(async () => {
  policy = await loadLoopPolicy(repositoryRoot);
});

function createState({ risk = 'low', acceptanceCriteria = ['feature', 'verification'] } = {}) {
  return createLoopState({
    taskId: 'loop-controller-test',
    branch: 'feature/loop-controller-test',
    baseSha: 'a'.repeat(40),
    headSha: revision,
    risk,
    acceptanceCriteria,
    policy,
    now: startedAt.toISOString(),
  });
}

function makeContext(overrides = {}) {
  const affectedPaths = overrides.affectedPaths ?? ['client/src/App.tsx'];
  const criticalActions = overrides.criticalActions ?? [];
  const selectedPolicy = overrides.policy ?? policy;
  return {
    policy: selectedPolicy,
    affectedPaths,
    criticalActions,
    riskResult: overrides.riskResult ?? classifyRisk({ paths: affectedPaths, actions: criticalActions }, selectedPolicy),
    humanApproval: overrides.humanApproval ?? null,
    currentRevision: overrides.currentRevision ?? revision,
    currentWorkspaceFingerprint: overrides.currentWorkspaceFingerprint ?? 'a'.repeat(64),
    verificationResult: overrides.verificationResult == null
      ? null
      : {
        ...overrides.verificationResult,
        revisionStable: overrides.verificationResult.revisionStable ?? true,
        workspaceStable: overrides.verificationResult.workspaceStable ?? true,
        verifiedRevision: overrides.verificationResult.verifiedRevision ?? revision,
        currentRevision: overrides.verificationResult.currentRevision ?? revision,
        verifiedWorkspaceFingerprint: overrides.verificationResult.verifiedWorkspaceFingerprint ?? 'a'.repeat(64),
        currentWorkspaceFingerprint: overrides.verificationResult.currentWorkspaceFingerprint ?? 'a'.repeat(64),
      },
    failureEvidence: overrides.failureEvidence ?? null,
    failureClassification: overrides.failureClassification ?? null,
    protectedPathsTouched: overrides.protectedPathsTouched ?? [],
    diff: overrides.diff,
    now: contextNow.toISOString(),
  };
}

function approval(paths, approvedAt = new Date(contextNow.getTime() - 500).toISOString()) {
  return { approvedPaths: paths, approvedAt };
}

function accept(state, context = makeContext(), ids = ['feature', 'verification']) {
  return advanceLoop(state, {
    type: 'TASK_ACCEPTED',
    taskId: state.taskId,
    acceptanceCriteria: ids.map((id) => ({ id, status: 'pending' })),
  }, context);
}

function startImplementation(state, context = makeContext()) {
  return advanceLoop(state, { type: 'IMPLEMENTATION_STARTED' }, context);
}

function startVerification(state, context = makeContext()) {
  return advanceLoop(state, { type: 'VERIFICATION_STARTED' }, context);
}

function passVerification(state, context = makeContext({
  verificationResult: { passed: true, complete: true, requiredExternalChecks: [] },
})) {
  return advanceLoop(state, {
    type: 'VERIFICATION_PASSED',
    acceptanceCriteria: state.acceptanceCriteria.map(({ id }) => ({ id, status: 'passed' })),
  }, context);
}

function failureContext(overrides = {}) {
  const { policy: selectedPolicy, humanApproval } = overrides;
  const evidenceOverrides = Object.fromEntries(Object.entries(overrides)
    .filter(([key]) => !['policy', 'humanApproval', 'expected'].includes(key)));
  const failureEvidence = {
    protectedPathTouched: false,
    runnerOutcome: 'check_failed',
    checkId: 'client-test',
    currentRevision: revision,
    coversRelevantScope: true,
    ...evidenceOverrides,
  };
  return makeContext({
    ...(selectedPolicy ? { policy: selectedPolicy } : {}),
    ...(humanApproval ? { humanApproval } : {}),
    verificationResult: { passed: false, complete: true, requiredExternalChecks: [] },
    failureEvidence,
  });
}

describe('bounded loop controller', () => {
  it('moves low-risk work from inspect through implement and verify to done', () => {
    let state = createState();
    state = accept(state);
    state = startImplementation(state);
    assert.equal(state.phase, 'implement');
    assert.equal(state.iteration, 1);
    state = startVerification(state);
    assert.equal(state.phase, 'verify');
    state = passVerification(state);
    assert.equal(state.phase, 'done');
    assert.deepEqual(state.acceptanceCriteria.map(({ status }) => status), ['passed', 'passed']);
  });

  it('routes only a relevant branch-caused failure into repair and returns to verification', () => {
    let state = startVerification(startImplementation(createState()));
    state = advanceLoop(state, {
      type: 'VERIFICATION_FAILED',
      checkId: 'client-test',
      failureFingerprint: 'c'.repeat(64),
    }, failureContext());
    assert.equal(state.phase, 'repair');
    assert.equal(state.failureCounts['c'.repeat(64)], 1);
    state = startImplementation(state);
    assert.equal(state.phase, 'repair');
    assert.equal(state.iteration, 2);
    state = startVerification(state);
    assert.equal(state.phase, 'verify');
  });

  it('escalates a repeated deterministic failure at the configured threshold', () => {
    const boundedPolicy = structuredClone(policy);
    boundedPolicy.stopConditions.maxSameFailure = 1;
    const context = makeContext({ policy: boundedPolicy });
    let state = startVerification(startImplementation(createState()), context);
    state = advanceLoop(state, {
      type: 'VERIFICATION_FAILED', checkId: 'client-test', failureFingerprint: 'd'.repeat(64),
    }, failureContext({ policy: boundedPolicy }));
    assert.equal(state.phase, 'escalated');
    assert.equal(state.escalationReason, 'max_same_failure');
  });

  it('escalates high-risk work without approval and keeps the risk high', () => {
    const paths = ['.github/workflows/ci.yml'];
    const highContext = makeContext({ affectedPaths: paths });
    let state = startImplementation(createState(), highContext);
    assert.equal(state.phase, 'escalated');
    assert.equal(state.escalationReason, 'human_approval_required');
    assert.equal(state.risk, 'high');
  });

  it('does not treat caller-created scope and timestamp metadata as human approval', () => {
    const paths = ['.github/workflows/ci.yml'];
    const state = startImplementation(createState(), makeContext({
      affectedPaths: paths,
      humanApproval: approval(paths),
    }));

    assert.equal(state.phase, 'escalated');
    assert.equal(state.escalationReason, 'human_approval_unverified');
  });

  it('does not let a narrow or overbroad approval authorize a different affected path set', () => {
    const paths = ['.github/workflows/ci.yml', 'client/src/App.tsx'];
    for (const approvedPaths of [['.github/workflows/ci.yml'], [...paths, 'docs/extra.md']]) {
      const state = startImplementation(createState(), makeContext({
        affectedPaths: paths,
        humanApproval: approval(approvedPaths),
      }));
      assert.equal(state.phase, 'escalated');
      assert.equal(state.escalationReason, 'approval_scope_mismatch');
    }
  });

  it('escalates protected-path detection when caller-supplied approval is unverified', () => {
    const paths = ['.github/workflows/ci.yml'];
    const event = { type: 'PROTECTED_PATH_DETECTED', paths };
    let state = advanceLoop(createState(), event, makeContext({
      affectedPaths: paths,
      protectedPathsTouched: paths,
    }));
    assert.equal(state.phase, 'escalated');
    assert.deepEqual(state.protectedPathsTouched, paths);

    state = advanceLoop(createState(), event, makeContext({
      affectedPaths: paths,
      protectedPathsTouched: paths,
      humanApproval: approval(paths),
    }));
    assert.equal(state.phase, 'escalated');
    assert.equal(state.escalationReason, 'human_approval_unverified');
    assert.equal(state.risk, 'high');
  });

  it('never enters implementation for critical paths or critical actions even with approval', () => {
    const criticalPath = ['server/.env.production'];
    let state = startImplementation(createState(), makeContext({
      affectedPaths: criticalPath,
      humanApproval: approval(criticalPath),
    }));
    assert.equal(state.phase, 'escalated');
    assert.equal(state.risk, 'critical');
    assert.equal(state.iteration, 0);

    const action = 'production_db_mutation';
    state = startImplementation(createState(), makeContext({
      affectedPaths: [],
      criticalActions: [action],
      humanApproval: approval([]),
    }));
    assert.equal(state.phase, 'escalated');
    assert.equal(state.risk, 'critical');
    assert.equal(state.iteration, 0);
  });

  it('classifies flaky failures as bounded retries without entering a repair phase', () => {
    let state = startVerification(startImplementation(createState()));
    const context = failureContext({ previouslyPassedRevision: revision });
    state = advanceLoop(state, {
      type: 'VERIFICATION_FAILED', checkId: 'client-test', failureFingerprint: 'e'.repeat(64),
    }, context);
    assert.equal(state.phase, 'verify');
    assert.equal(state.ciRetryCount, 1);
    assert.equal(state.failureCounts['e'.repeat(64)], undefined);
  });

  it('escalates flaky failures when the retry limit is exhausted', () => {
    const boundedPolicy = structuredClone(policy);
    boundedPolicy.stopConditions.maxFlakyRetries = 1;
    const context = makeContext({ policy: boundedPolicy });
    let state = startVerification(startImplementation(createState(), context), context);
    const flakyContext = failureContext({
      policy: boundedPolicy,
      previouslyPassedRevision: revision,
    });
    state = advanceLoop(state, {
      type: 'VERIFICATION_FAILED', checkId: 'client-test', failureFingerprint: 'f'.repeat(64),
    }, flakyContext);
    assert.equal(state.phase, 'verify');
    assert.equal(state.ciRetryCount, 1);

    state = advanceLoop(state, {
      type: 'VERIFICATION_FAILED', checkId: 'client-test', failureFingerprint: 'f'.repeat(64),
    }, flakyContext);
    assert.equal(state.phase, 'escalated');
    assert.equal(state.escalationReason, 'max_flaky_retries');
  });

  it('escalates infrastructure, protected, and ambiguous failures without repair', () => {
    const cases = [
      { runnerOutcome: 'network_error', expected: 'failure_infrastructure' },
      { protectedPathTouched: true, expected: 'failure_protected' },
      { coversRelevantScope: false, expected: 'failure_ambiguous' },
    ];
    for (const [index, scenario] of cases.entries()) {
      let state = startVerification(startImplementation(createState()));
      state = advanceLoop(state, {
        type: 'VERIFICATION_FAILED', checkId: 'client-test', failureFingerprint: `${index + 1}`.repeat(64),
      }, failureContext(scenario));
      assert.equal(state.phase, 'escalated');
      assert.equal(state.escalationReason, scenario.expected);
    }
  });

  it('does not finish when verification passed locally but is incomplete', () => {
    const state = startVerification(startImplementation(createState()));
    const incomplete = passVerification(state, makeContext({
      verificationResult: { passed: true, complete: false, requiredExternalChecks: ['github-ci'] },
    }));
    assert.equal(incomplete.phase, 'escalated');
    assert.equal(incomplete.escalationReason, 'verification_incomplete');
  });

  it('does not finish when successful verification belongs to a different revision', () => {
    const state = startVerification(startImplementation(createState()));
    const stale = passVerification(state, makeContext({
      verificationResult: {
        passed: true,
        complete: true,
        requiredExternalChecks: [],
        verifiedRevision: 'c'.repeat(40),
      },
    }));

    assert.equal(stale.phase, 'escalated');
    assert.equal(stale.escalationReason, 'stale_verification_result');
  });

  it('does not finish when the worktree changes during or after the verifier snapshot', () => {
    const state = startVerification(startImplementation(createState()));
    const changedDuringChecks = passVerification(state, makeContext({
      verificationResult: {
        passed: true,
        complete: true,
        requiredExternalChecks: [],
        workspaceStable: false,
      },
    }));
    assert.equal(changedDuringChecks.phase, 'escalated');
    assert.equal(changedDuringChecks.escalationReason, 'stale_verification_result');

    const stale = passVerification(state, makeContext({
      currentWorkspaceFingerprint: 'b'.repeat(64),
      verificationResult: {
        passed: true,
        complete: true,
        requiredExternalChecks: [],
        verifiedWorkspaceFingerprint: 'a'.repeat(64),
        currentWorkspaceFingerprint: 'a'.repeat(64),
      },
    }));

    assert.equal(stale.phase, 'escalated');
    assert.equal(stale.escalationReason, 'stale_verification_result');
  });

  it('tracks the Git revision at verification start and detects a later head change', () => {
    const checkedRevision = 'c'.repeat(40);
    const changedRevision = 'd'.repeat(40);
    const verifying = startVerification(
      startImplementation(createState()),
      makeContext({ currentRevision: checkedRevision }),
    );
    assert.equal(verifying.headSha, checkedRevision);

    const stale = passVerification(verifying, makeContext({
      currentRevision: changedRevision,
      verificationResult: {
        passed: true,
        complete: true,
        requiredExternalChecks: [],
        verifiedRevision: checkedRevision,
        currentRevision: checkedRevision,
        revisionStable: true,
      },
    }));

    assert.equal(stale.phase, 'escalated');
    assert.equal(stale.escalationReason, 'stale_verification_result');
  });

  it('escalates explicit budget and human-stop events with stable reason codes', () => {
    const state = advanceLoop(createState(), { type: 'BUDGET_EXHAUSTED', reason: 'token_limit' }, makeContext());
    assert.equal(state.phase, 'escalated');
    assert.equal(state.escalationReason, 'token_limit');
    const humanStop = advanceLoop(createState(), {
      type: 'HUMAN_ESCALATION_REQUIRED', reason: 'review_required',
    }, makeContext());
    assert.equal(humanStop.phase, 'escalated');
    assert.equal(humanStop.escalationReason, 'review_required');
  });

  it('rejects terminal-state mutation and inconsistent deterministic risk evidence', () => {
    const done = passVerification(startVerification(startImplementation(createState())));
    assert.throws(() => advanceLoop(done, { type: 'IMPLEMENTATION_STARTED' }, makeContext()), LoopTransitionError);

    const escalated = advanceLoop(createState(), { type: 'BUDGET_EXHAUSTED', reason: 'token_limit' }, makeContext());
    assert.throws(() => advanceLoop(escalated, { type: 'IMPLEMENTATION_STARTED' }, makeContext()), LoopTransitionError);

    const badContext = makeContext({
      affectedPaths: ['.github/workflows/ci.yml'],
      riskResult: classifyRisk({ paths: ['client/src/App.tsx'] }, policy),
    });
    assert.throws(() => startImplementation(createState(), badContext), LoopTransitionError);
  });

  it('escalates stale revision evidence rather than repairing from another commit', () => {
    let state = startVerification(startImplementation(createState()));
    state = advanceLoop(state, {
      type: 'VERIFICATION_FAILED', checkId: 'client-test', failureFingerprint: '9'.repeat(64),
    }, failureContext({ currentRevision: 'c'.repeat(40) }));
    assert.equal(state.phase, 'escalated');
    assert.equal(state.escalationReason, 'stale_failure_evidence');
  });

  it('stops before implementation when a configured diff budget is exceeded', () => {
    const state = startImplementation(createState(), makeContext({
      diff: { changedFiles: 26, additions: 0, deletions: 0 },
    }));
    assert.equal(state.phase, 'escalated');
    assert.equal(state.escalationReason, 'max_changed_files');
    assert.equal(state.iteration, 0);
  });

  it('rejects malformed event/context fields instead of persisting prompt text', () => {
    assert.throws(() => advanceLoop(createState(), {
      type: 'TASK_ACCEPTED', taskId: 'loop-controller-test', acceptanceCriteria: [], requestText: 'untrusted text',
    }, makeContext()), LoopTransitionError);
    assert.throws(() => advanceLoop(createState(), {
      type: 'TASK_ACCEPTED', taskId: 'another-task', acceptanceCriteria: [],
    }, makeContext()), LoopTransitionError);
  });
});
