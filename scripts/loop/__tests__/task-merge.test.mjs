import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createPrBabysitterState, recordActionableFailure, recordCheckObservation } from '../pr-state.mjs';
import { createTaskMergeAuthorizationGate, evaluateTaskMergeEligibility } from '../tasks/merge-eligibility.mjs';

const head = 'a'.repeat(40); const base = 'b'.repeat(40); const merge = 'c'.repeat(40);
const digest = 'd'.repeat(64); const repositoryId = 1234; const taskId = 'repo-1234-issue-42-g1';
const pr = { repository: 'owner/repo', number: 7, state: 'open', draft: false, baseRef: 'main', baseSha: base,
  headRef: 'feature/task', headSha: head, mergeSha: merge, headRepository: 'owner/repo', updatedAt: '2026-10-13T00:00:00.000Z' };
const stopConditions = { maxIterations: 3, maxSameFailure: 2, maxFlakyRetries: 2, maxChangedFiles: 20,
  maxChangedLines: 1000, maxWallClockSeconds: 1800, tokenLimit: null, ciRunLimit: 2 };
const babysitterPolicy = { schemaVersion: 1, protectedPaths: { high: [], critical: [] }, riskRules: {
  low: [], medium: [], high: [], highRiskActions: ['stage1_required_check_recovery'],
  criticalActions: ['production_secret_access', 'production_db_mutation', 'branch_protection_bypass', 'direct_push_main', 'disable_security_checks', 'production_deployment_promotion'],
}, stopConditions };
const observation = { checkId: 'ci-unit', requiredCheckKey: 'unit|app:10', requiredWorkflowKey: null, provider: 'github-check',
  headSha: head, baseSha: base, mergeSha: merge, testedSha: merge, attemptKey: 'run-1-attempt-1', status: 'completed',
  conclusion: 'success', runnerOutcome: null, coversRelevantScope: true, protectedPathTouched: false, failureFingerprint: null };
const requiredCheckSnapshot = { baseRef: 'main', policyFingerprint: digest,
  requiredCheckKeys: ['unit|app:10'], requiredWorkflowKeys: [], requiredWorkflows: [], collectionStatus: 'complete' };
const prState = recordCheckObservation(createPrBabysitterState(pr), observation);
const babysitterInput = { prSnapshot: pr, requiredCheckSnapshot, checkObservations: [observation],
  checkCollectionComplete: true, prState, policy: babysitterPolicy };
const autonomyPolicy = Object.freeze({ schemaVersion: 1, enabled: true, autoMergeEnabled: true,
  ownerActorIds: Object.freeze([99]), eligibleActors: Object.freeze([99]), optInLabel: 'autonomous:run',
  eligibleCategories: Object.freeze(['frontend']), eligiblePaths: Object.freeze(['client/a.ts']),
  eligibleRisks: Object.freeze(['low', 'medium']), runner: Object.freeze({ provider: 'openai', model: 'GPT-6-Luna' }),
  capabilities: Object.freeze(['enable_native_auto_merge']), budgets: Object.freeze({ maxModelCalls: 5,
    maxDeliveryGenerations: 2, taskConcurrency: 1, maxHostedWorkflowRuns: 3 }), trustedRevision: 'e'.repeat(40) });
const verifierEvidence = { complete: true, passed: true, revisionStable: true, workspaceStable: true, verifiedRevision: head, currentRevision: head,
  verifiedWorkspaceFingerprint: digest, currentWorkspaceFingerprint: digest };
function makeRecord(overrides = {}) {
  return { schemaVersion: 2, key: { repositoryId, issueNumber: 42, generation: 1 }, taskId,
    requestDigest: digest, acceptanceIds: ['checks'], sourceRevision: 'f'.repeat(40), policyRevision: autonomyPolicy.trustedRevision,
    state: 'merging', version: 8, attempt: 1, epoch: 1, deadline: '2026-10-14T00:00:00.000Z',
    budgets: { modelCalls: 1, repairs: 0, deliveries: 1, lastModelTokenUsed: null },
    links: { loopStateTaskId: taskId, pr: { repositoryId, number: 7, baseSha: base, headSha: head, mergeSha: merge } },
    outcomeReason: null, confirmedMergeSha: null, ...overrides };
}

function makeSnapshot(overrides = {}) {
  return { repositoryId, prSnapshot: pr, babysitterInput, branchRules: { collectionStatus: 'complete', protected: true,
    allowsAutoMerge: true, repositoryId, baseRef: 'main', requiredApprovingReviewCount: 1, policyFingerprint: digest },
  reviews: [{ state: 'APPROVED', commitId: head, actorId: 12345, isBot: false }], taskOwnerActorId: 99,
  unresolvedReviewThreads: 0, reviewCollectionStatus: 'complete', verifierEvidence, riskClass: 'low',
  category: 'frontend', changedPaths: ['client/a.ts'], ...overrides };
}

const riskPolicy = Object.freeze({ ...babysitterPolicy, protectedPaths: Object.freeze({ high: Object.freeze(['.agent/policy/**']), critical: Object.freeze([]) }),
  riskRules: Object.freeze({ ...babysitterPolicy.riskRules, low: Object.freeze([]), medium: Object.freeze(['client/**']),
    high: Object.freeze(['server/**']), criticalActions: Object.freeze([...babysitterPolicy.riskRules.criticalActions]),
    highRiskActions: Object.freeze([...babysitterPolicy.riskRules.highRiskActions]) }) });
const authProvider = {
  async requestApproval(scope) { return Object.freeze({ approval: scope.headSha }); },
  consumeApproval(approval, scope) { assert.equal(approval.approval, scope.headSha); },
};
async function authorizedContext(paths = ['client/a.ts'], currentPr = pr) {
  const gate = createTaskMergeAuthorizationGate({ authProvider, observeDiff: async (tuple) => ({ ...tuple, paths }) });
  const mergeAuthorization = await gate.authorize({ repositoryId, prSnapshot: currentPr });
  return { policy: autonomyPolicy, loopPolicy: riskPolicy, mergeAuthorization };
}

describe('Task merge eligibility', () => {
  it('returns read-only eligibility only when current checks, review, verifier, rules, diff, and consumed approval agree', async () => {
    const result = evaluateTaskMergeEligibility({ record: makeRecord(), snapshot: makeSnapshot(), context: await authorizedContext() });
    assert.equal(result.eligible, true);
    assert.equal(result.action, 'native_auto_merge_eligible');
    assert.equal(result.writePerformed, false);
  });

  it('blocks stale tuples, missing independent review, and unresolved threads', async () => {
    const trustedContext = await authorizedContext();
    const changedPr = { ...pr, headSha: '9'.repeat(40) };
    const changedInput = { ...babysitterInput, prSnapshot: changedPr, checkObservations: [],
      prState: createPrBabysitterState(changedPr) };
    assert.equal(evaluateTaskMergeEligibility({ record: makeRecord(), snapshot: makeSnapshot({
      prSnapshot: changedPr, babysitterInput: changedInput,
    }), context: trustedContext }).reasonCode, 'pr_tuple_stale');
    assert.equal(evaluateTaskMergeEligibility({ record: makeRecord(), snapshot: makeSnapshot({ reviews: [] }), context: trustedContext }).reasonCode,
      'independent_human_review_missing');
    assert.equal(evaluateTaskMergeEligibility({ record: makeRecord(), snapshot: makeSnapshot({ unresolvedReviewThreads: 1 }), context: trustedContext }).reasonCode,
      'unresolved_review_threads');
  });

  it('blocks policy, risk, and required-check failures; auto-merge stays disabled by default', async () => {
    const trustedContext = await authorizedContext();
    const disabled = Object.freeze({ ...autonomyPolicy, autoMergeEnabled: false });
    assert.equal(evaluateTaskMergeEligibility({ record: makeRecord(), snapshot: makeSnapshot(), context: { ...trustedContext, policy: disabled } }).reasonCode,
      'auto_merge_disabled_by_policy');
    assert.equal(evaluateTaskMergeEligibility({ record: makeRecord(), snapshot: makeSnapshot({ riskClass: 'critical', changedPaths: ['.agent/policy/autonomy.yml'] }), context: trustedContext }).eligible, true);
    const protectedContext = await authorizedContext(['.agent/policy/autonomy.yml']);
    assert.equal(evaluateTaskMergeEligibility({ record: makeRecord(), snapshot: makeSnapshot({ riskClass: 'low', changedPaths: ['client/a.ts'] }), context: protectedContext }).reasonCode,
      'task_scope_not_policy_eligible');
    const failure = { ...observation, conclusion: 'failure', failureFingerprint: digest, runnerOutcome: 'check_failed' };
    let failureState = recordCheckObservation(createPrBabysitterState(pr), failure);
    failureState = recordActionableFailure(failureState, { headSha: head, baseSha: base, mergeSha: merge,
      attemptKey: failure.attemptKey, failureFingerprint: digest });
    const failedInput = { ...babysitterInput, checkObservations: [failure], prState: failureState };
    assert.equal(evaluateTaskMergeEligibility({ record: makeRecord(), snapshot: makeSnapshot({ babysitterInput: failedInput }), context: trustedContext }).reasonCode,
      'required_checks_request-repair');
  });

  it('rejects non-main PRs and caller-frozen authorization objects', async () => {
    const trustedContext = await authorizedContext();
    const nonMain = { ...pr, baseRef: 'release' };
    const nonMainInput = { ...babysitterInput, prSnapshot: nonMain };
    assert.equal(evaluateTaskMergeEligibility({ record: makeRecord(), snapshot: makeSnapshot({ prSnapshot: nonMain,
      babysitterInput: nonMainInput, branchRules: { ...makeSnapshot().branchRules, baseRef: 'release' } }), context: trustedContext }).reasonCode,
    'non_main_base_ref');
    const forged = Object.freeze({ authorized: true, action: 'enable_native_auto_merge', repositoryId, prNumber: 7, headSha: head });
    assert.equal(evaluateTaskMergeEligibility({ record: makeRecord(), snapshot: makeSnapshot(), context: {
      ...trustedContext, mergeAuthorization: forged,
    } }).reasonCode, 'separate_trusted_merge_authorization_required');
  });
});
