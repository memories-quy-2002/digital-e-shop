import assert from 'node:assert/strict';
import { it } from 'node:test';

import { publishVerifiedStage1Check } from '../stage1-check-run-publisher.mjs';

const repository = 'memories-quy-2002/digital-e-shop';
const target = { repository, prNumber: 7, baseSha: 'a'.repeat(40), headSha: 'b'.repeat(40), mergeSha: 'c'.repeat(40),
  testedSha: 'c'.repeat(40), context: 'client', appId: 15368, checkRunId: 1234, policyFingerprint: 'd'.repeat(64) };
function evidence(overrides = {}) {
  return { collectionStatus: 'complete', prSnapshot: { repository, number: 7, state: 'open', baseRef: 'main', baseSha: target.baseSha,
    headSha: target.headSha, mergeSha: target.mergeSha }, requiredCheckSnapshot: { collectionStatus: 'complete', policyFingerprint: target.policyFingerprint,
    requiredChecks: [
      { context: 'client', appId: 15368 }, { context: 'server', appId: 15368 },
      { context: 'dependency-review', appId: 15368 }, { context: 'CodeQL', appId: 57789 },
      { context: 'GitGuardian Security Checks', appId: 46505 },
    ], requiredCheckKeys: ['client|app:15368', 'server|app:15368', 'dependency-review|app:15368',
      'CodeQL|app:57789', 'GitGuardian Security Checks|app:46505'], requiredWorkflows: [] },
    checkCollectionComplete: true, workflowRuns: { collectionStatus: 'complete', runs: [] },
    checkObservations: [{ checkId: 'check:1234', requiredCheckKey: 'client|app:15368', testedSha: target.testedSha,
      status: 'completed', conclusion: 'failure' }], ...overrides };
}

it('updates only the exact existing failed Check Run after successful verification', async () => {
  const calls = [];
  const result = await publishVerifiedStage1Check({ token: 'workflow-token', repository, target,
    retryRunUrl: `https://github.com/${repository}/actions/runs/9001`, verifierResult: 'success',
    readTarget: async () => evidence(), fetchImpl: async (url, init) => {
      calls.push({ url: new URL(url), init });
      return new Response(JSON.stringify({ id: 1234, name: 'client', head_sha: target.testedSha,
        app: { id: 15368 }, status: 'completed', conclusion: 'success' }), { status: 200 });
    } });
  assert.equal(result.status, 'published');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.href, `https://api.github.com/repos/${repository}/check-runs/1234`);
  assert.equal(calls[0].init.method, 'PATCH');
  assert.equal(calls[0].init.redirect, 'manual');
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.conclusion, 'success');
  assert.match(body.output.summary, /actions\/runs\/9001/);
  assert.ok(body.output.summary.length < 1000);
});

it('refuses stale, mismatched, unsuccessful, and ambiguous evidence without updating a check', async () => {
  const invalid = [
    { args: { verifierResult: 'failure' }, expected: 'verifier_not_successful' },
    { evidence: evidence({ prSnapshot: { repository, number: 7, state: 'open', baseRef: 'main', baseSha: 'f'.repeat(40), headSha: target.headSha, mergeSha: target.mergeSha } }), expected: 'publisher_target_stale' },
    { evidence: evidence({ requiredCheckSnapshot: { ...evidence().requiredCheckSnapshot, policyFingerprint: 'f'.repeat(64) } }), expected: 'publisher_target_stale' },
    { evidence: evidence({ checkObservations: [{ ...evidence().checkObservations[0], conclusion: 'success' }] }), expected: 'publisher_check_mismatch' },
  ];
  for (const item of invalid) {
    let writes = 0;
    const result = await publishVerifiedStage1Check({ token: 'workflow-token', repository, target,
      retryRunUrl: `https://github.com/${repository}/actions/runs/9001`, verifierResult: item.args?.verifierResult ?? 'success',
      readTarget: async () => item.evidence ?? evidence(), fetchImpl: async () => { writes += 1; throw new Error('must not write'); } });
    assert.equal(result.reasonCode, item.expected);
    assert.equal(writes, 0);
  }
});

it('does not retry or accept ambiguous Check Run PATCH outcomes', async () => {
  let writes = 0;
  const result = await publishVerifiedStage1Check({ token: 'workflow-token', repository, target,
    retryRunUrl: `https://github.com/${repository}/actions/runs/9001`, verifierResult: 'success', readTarget: async () => evidence(),
    fetchImpl: async () => { writes += 1; return new Response(null, { status: 302, headers: { location: 'https://evil.test' } }); } });
  assert.equal(result.reasonCode, 'publisher_outcome_uncertain');
  assert.equal(writes, 1);
});
