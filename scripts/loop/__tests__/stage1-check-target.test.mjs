import assert from 'node:assert/strict';
import { it } from 'node:test';

import { selectUniqueStage1CheckTarget } from '../stage1-check-target.mjs';

const repository = 'memories-quy-2002/digital-e-shop';
const baseSha = 'a'.repeat(40);
const headSha = 'b'.repeat(40);
const mergeSha = 'c'.repeat(40);
const workflowSha = baseSha;
const checkId = 123456;
const policyFingerprint = 'd'.repeat(64);

function fixture(context = 'client') {
  const prSnapshot = Object.freeze({ repository, number: 7, state: 'open', draft: false, baseRef: 'main', baseSha,
    headRef: 'feature/fix', headSha, mergeSha, headRepository: repository, updatedAt: '2026-10-09T00:00:00.000Z' });
  const otherContext = context === 'client' ? 'server' : 'client';
  const requiredChecks = [
    { context: 'client', appId: 15368 }, { context: 'server', appId: 15368 },
    { context: 'dependency-review', appId: 15368 }, { context: 'CodeQL', appId: 57789 },
    { context: 'GitGuardian Security Checks', appId: 46505 },
  ];
  const requiredCheckSnapshot = Object.freeze({ baseRef: 'main', policyFingerprint,
    requiredChecks, requiredWorkflows: [], collectionStatus: 'complete' });
  const checkObservations = [{
    checkId: `check:${checkId}`, requiredCheckKey: `${context}|app:15368`, requiredWorkflowKey: null,
    provider: 'github-check', headSha, baseSha, mergeSha, testedSha: mergeSha, attemptKey: `check:${checkId}`,
    status: 'completed', conclusion: 'failure', runnerOutcome: null, coversRelevantScope: true,
    protectedPathTouched: false, failureFingerprint: 'e'.repeat(64),
  }, ...requiredChecks.filter((identity) => identity.context !== context).map((identity, index) => ({
    checkId: `check:${checkId + index + 1}`, requiredCheckKey: `${identity.context}|app:${identity.appId}`, requiredWorkflowKey: null,
    provider: 'github-check', headSha, baseSha, mergeSha, testedSha: mergeSha, attemptKey: `check:${checkId + index + 1}`,
    status: 'completed', conclusion: 'success', runnerOutcome: null, protectedPathTouched: false,
  }))];
  const changedFiles = { status: 'current', collectionStatus: 'complete', files: [{ filename: 'client/src/app.tsx', previousFilename: null, status: 'modified' }] };
  const workflowRuns = { status: 'current', collectionStatus: 'complete', runs: [{ id: 91, repositoryId: 743050379,
    path: '.github/workflows/ci.yml', ref: 'main', workflowId: 19, event: 'pull_request', headSha: mergeSha,
    testedSha: mergeSha, runAttempt: 1, status: 'completed', conclusion: 'failure' }] };
  const trustedWorkflow = { repositoryId: 743050379, workflowId: 77, path: '.github/workflows/stage1-trusted-retry.yml', ref: 'main', sourceSha: workflowSha,
    actorId: 9988, actorLogin: 'digital-e-loop-runner[bot]' };
  const decision = { action: 'retry-check', reasonCode: 'same_revision_pass_then_fail', checkIds: [`check:${checkId}`], failureFingerprints: ['e'.repeat(64)] };
  return { decision, prSnapshot, requiredCheckSnapshot, checkObservations, changedFiles, workflowRuns, trustedWorkflow };
}

it('selects one immutable current failure for client and server using numeric canonical Check Run ID', () => {
  for (const context of ['client', 'server']) {
    const target = selectUniqueStage1CheckTarget(fixture(context));
    assert.equal(target.checkRunId, checkId);
    assert.equal(target.context, context);
    assert.equal(target.appId, 15368);
    assert.equal(target.testedSha, mergeSha);
    assert.equal(target.workflowSourceSha, baseSha);
    assert.match(target.requestId, /^[a-f0-9]{32}$/);
    assert.equal(Object.isFrozen(target), true);
  }
});

it('refuses missing, duplicate, stale, unsupported, or unsafe evidence', () => {
  const base = fixture();
  const invalid = [
    { ...base, decision: { ...base.decision, action: 'wait' } },
    { ...base, requiredCheckSnapshot: { ...base.requiredCheckSnapshot, collectionStatus: 'incomplete' } },
    { ...base, requiredCheckSnapshot: { ...base.requiredCheckSnapshot, requiredChecks: [] } },
    { ...base, prSnapshot: { ...base.prSnapshot, baseRef: 'release' } },
    { ...base, prSnapshot: { ...base.prSnapshot, headRepository: 'fork/digital-e-shop' } },
    { ...base, checkObservations: [...base.checkObservations, ...base.checkObservations] },
    { ...base, checkObservations: [{ ...base.checkObservations[0], conclusion: 'success' }] },
    { ...base, checkObservations: [{ ...base.checkObservations[0], checkId: 'check:abc' }] },
    { ...base, changedFiles: { ...base.changedFiles, collectionStatus: 'incomplete' } },
    { ...base, changedFiles: { ...base.changedFiles, files: [{ filename: '.github/workflows/ci.yml', status: 'modified' }] } },
    { ...base, workflowRuns: { ...base.workflowRuns, runs: [{ ...base.workflowRuns.runs[0], status: 'in_progress' }] } },
    { ...base, trustedWorkflow: { ...base.trustedWorkflow, sourceSha: 'f'.repeat(40) } },
  ];
  for (const input of invalid) assert.throws(() => selectUniqueStage1CheckTarget(input), (error) => error?.reasonCode === 'stage1_target_unavailable');
});
