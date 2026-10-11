import assert from 'node:assert/strict';
import { it } from 'node:test';

import { createStage1PublisherTransport, publishVerifiedStage1Check } from '../stage1-check-run-publisher.mjs';

const repository = 'memories-quy-2002/digital-e-shop';
const target = { repository, prNumber: 7, baseSha: 'a'.repeat(40), headSha: 'b'.repeat(40), mergeSha: 'c'.repeat(40),
  testedSha: 'c'.repeat(40), context: 'client', appId: 15368, checkRunId: 1234, policyFingerprint: 'd'.repeat(64) };
function evidence(overrides = {}) {
  return { collectionStatus: 'complete', prSnapshot: { repository, number: 7, state: 'open', baseRef: 'main', baseSha: target.baseSha,
    headSha: target.headSha, mergeSha: target.mergeSha },
    checkCollectionComplete: true, workflowRuns: { collectionStatus: 'complete', runs: [] },
    checkObservations: [{ checkId: 'check:1234', provider: 'github-check', requiredCheckKey: 'client|app:15368',
      testedSha: target.testedSha, headSha: target.headSha, baseSha: target.baseSha, mergeSha: target.mergeSha,
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

it('confines the publisher token to exact read endpoints and the single approved Check Run PATCH', async () => {
  const calls = [];
  const transport = createStage1PublisherTransport({ target, token: 'workflow-token', fetchImpl: async (url, init) => {
    calls.push({ href: url.href, method: init.method });
    return new Response('{}', { status: 200 });
  } });
  await transport(`https://api.github.com/repos/${repository}/pulls/7`, { headers: { Authorization: 'Bearer workflow-token' } });
  await transport(`https://api.github.com/repos/${repository}/commits/${target.testedSha}/check-runs?page=1&per_page=100`,
    { headers: { Authorization: 'Bearer workflow-token' } });
  await transport(`https://api.github.com/repos/${repository}/actions/runs?head_sha=${target.testedSha}&page=1&per_page=100`,
    { headers: { Authorization: 'Bearer workflow-token' } });
  await assert.rejects(transport(`https://api.github.com/repos/${repository}/branches/main/protection`,
    { headers: { Authorization: 'Bearer workflow-token' } }));
  await assert.rejects(transport(`https://api.github.com/repos/${repository}/check-runs/999`,
    { method: 'PATCH', headers: { Authorization: 'Bearer workflow-token' }, body: JSON.stringify({ conclusion: 'success' }) }));
  await assert.rejects(transport(`https://api.github.com/repos/${repository}/actions/runs/1/rerun-failed-jobs`,
    { method: 'POST', headers: { Authorization: 'Bearer workflow-token' }, body: '{}' }));
  await assert.rejects(transport(`https://api.github.com/repos/${repository}/pulls/7`,
    { headers: { Authorization: 'Bearer another-token' } }));
  assert.deepEqual(calls, [
    { href: `https://api.github.com/repos/${repository}/pulls/7`, method: undefined },
    { href: `https://api.github.com/repos/${repository}/commits/${target.testedSha}/check-runs?page=1&per_page=100`, method: undefined },
    { href: `https://api.github.com/repos/${repository}/actions/runs?head_sha=${target.testedSha}&page=1&per_page=100`, method: undefined },
  ]);
});
