import assert from 'node:assert/strict';
import { it } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { createStage1PublisherReadTarget, createStage1PublisherTransport, publishVerifiedStage1Check } from '../stage1-check-run-publisher.mjs';

const repository = 'memories-quy-2002/digital-e-shop';
const target = { repository, prNumber: 7, baseSha: 'a'.repeat(40), headSha: 'b'.repeat(40), mergeSha: 'c'.repeat(40),
  testedSha: 'c'.repeat(40), context: 'client', appId: 15368, checkRunId: 1234, policyFingerprint: 'd'.repeat(64) };
function evidence(overrides = {}) {
  return { collectionStatus: 'complete', prSnapshot: { repository, number: 7, state: 'open', baseRef: 'main', baseSha: target.baseSha,
    headSha: target.headSha, mergeSha: target.mergeSha },
    checkCollectionComplete: true, workflowRuns: { collectionStatus: 'complete', runs: [] },
    requiredCheckSnapshot: { baseRef: 'main', collectionStatus: 'complete', policyFingerprint: target.policyFingerprint,
      requiredChecks: [{ context: target.context, appId: target.appId }] },
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

it('refuses missing, changed, incomplete, or ambiguous required-check policy before PATCH', async () => {
  const policy = evidence().requiredCheckSnapshot;
  for (const requiredCheckSnapshot of [undefined, { ...policy, policyFingerprint: 'e'.repeat(64) },
    { ...policy, collectionStatus: 'unavailable' }, { ...policy, baseRef: 'other' },
    { ...policy, requiredChecks: [] }, { ...policy, requiredChecks: [{ context: 'client', appId: 999 }] },
    { ...policy, requiredChecks: [...policy.requiredChecks, ...policy.requiredChecks] }]) {
    let writes = 0;
    const result = await publishVerifiedStage1Check({ token: 'workflow-token', repository, target,
      retryRunUrl: `https://github.com/${repository}/actions/runs/9001`, verifierResult: 'success',
      readTarget: async () => evidence({ requiredCheckSnapshot }),
      fetchImpl: async () => { writes += 1; throw new Error('must not write'); } });
    assert.equal(result.reasonCode, 'publisher_policy_stale_or_incomplete');
    assert.equal(writes, 0);
  }
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

it('confines the policy-reader token to exact read endpoints and denies every write', async () => {
  const calls = [];
  const transport = createStage1PublisherTransport({ target, token: 'workflow-token', capability: 'observe', fetchImpl: async (url, init) => {
    calls.push({ href: url.href, method: init.method });
    return new Response('{}', { status: 200 });
  } });
  await transport(`https://api.github.com/repos/${repository}/pulls/7`, { headers: { Authorization: 'Bearer workflow-token' } });
  await transport(`https://api.github.com/repos/${repository}/commits/${target.testedSha}/check-runs?filter=all&per_page=100&page=1`,
    { headers: { Authorization: 'Bearer workflow-token' } });
  await assert.rejects(transport(`https://api.github.com/repos/${repository}/commits/${target.testedSha}/check-runs?page=1&per_page=100`,
    { headers: { Authorization: 'Bearer workflow-token' } }));
  await assert.rejects(transport(`https://api.github.com/repos/${repository}/commits/${target.testedSha}/CHECK-RUNS?page=1&per_page=100`,
    { headers: { Authorization: 'Bearer workflow-token' } }));
  await assert.rejects(transport(`https://api.github.com/repos/${repository}/commits/${target.testedSha}/check-runs?filter=latest&page=1&per_page=100`,
    { headers: { Authorization: 'Bearer workflow-token' } }));
  await transport(`https://api.github.com/repos/${repository}/actions/runs?head_sha=${target.testedSha}&page=1&per_page=100`,
    { headers: { Authorization: 'Bearer workflow-token' } });
  await transport(`https://api.github.com/repos/${repository}/branches/main/protection`,
    { headers: { Authorization: 'Bearer workflow-token' } });
  await assert.rejects(transport(`https://api.github.com/repos/${repository}/branches/other/protection`,
    { headers: { Authorization: 'Bearer workflow-token' } }));
  await assert.rejects(transport(`https://api.github.com/repos/${repository}/check-runs/999`,
    { method: 'PATCH', headers: { Authorization: 'Bearer workflow-token' }, body: JSON.stringify({ conclusion: 'success' }) }));
  await assert.rejects(transport(`https://api.github.com/repos/${repository}/actions/runs/1/rerun-failed-jobs`,
    { method: 'POST', headers: { Authorization: 'Bearer workflow-token' }, body: '{}' }));
  for (const [route, method] of [[`/repos/${repository}/rulesets/42`, 'PATCH'],
    [`/repos/${repository}/rulesets`, 'POST'], [`/repos/${repository}/check-runs/1234`, 'DELETE'],
    ['/repos/other/shop/rulesets?includes_parents=true', 'GET'],
    [`/repos/${repository}/rulesets?includes_parents=false`, 'GET']]) {
    await assert.rejects(transport(`https://api.github.com${route}`,
      { method, headers: { Authorization: 'Bearer workflow-token' } }));
  }
  await assert.rejects(transport(`https://api.github.com/repos/${repository}/pulls/7`,
    { headers: { Authorization: 'Bearer another-token' } }));
  await assert.rejects(transport(`https://api.github.com/repos/${repository}/check-runs/1234`,
    { method: 'PATCH', headers: { Authorization: 'Bearer workflow-token' }, body: JSON.stringify({ conclusion: 'success',
      output: { title: 'Verified by trusted Stage 1 retry', summary: 'fixture' } }) }));
  assert.deepEqual(calls, [
    { href: `https://api.github.com/repos/${repository}/pulls/7`, method: undefined },
    { href: `https://api.github.com/repos/${repository}/commits/${target.testedSha}/check-runs?filter=all&per_page=100&page=1`, method: undefined },
    { href: `https://api.github.com/repos/${repository}/actions/runs?head_sha=${target.testedSha}&page=1&per_page=100`, method: undefined },
    { href: `https://api.github.com/repos/${repository}/branches/main/protection`, method: undefined },
  ]);
});

it('confines the Actions write token to one exact PATCH and rejects reads and unknown capabilities', async () => {
  let calls = 0;
  const transport = createStage1PublisherTransport({ target, token: 'write-token', fetchImpl: async () => {
    calls += 1; return new Response('{}');
  } });
  for (const path of [`/repos/${repository}/pulls/7`, `/repos/${repository}/branches/main/protection`]) {
    await assert.rejects(transport(`https://api.github.com${path}`, { headers: { Authorization: 'Bearer write-token' } }));
  }
  assert.equal(calls, 0);
  assert.throws(() => createStage1PublisherTransport({ target, token: 'write-token', capability: 'other' }));
  await transport(`https://api.github.com/repos/${repository}/check-runs/1234`, { method: 'PATCH',
    headers: { Authorization: 'Bearer write-token' }, body: JSON.stringify({ conclusion: 'success',
      output: { title: 'Verified by trusted Stage 1 retry', summary: 'fixture' } }) });
  assert.equal(calls, 1);
});

it('refuses missing or reused policy credentials before CLI event or network access without exposing tokens', async () => {
  for (const policyToken of ['', 'fixture-write-token']) {
    await assert.rejects(promisify(execFile)(process.execPath, ['scripts/loop/stage1-check-run-publisher.mjs'], {
      env: { ...process.env, GITHUB_REPOSITORY: repository, GITHUB_RUN_ID: '9001', GITHUB_EVENT_PATH: 'must-not-read.json',
        STAGE1_GITHUB_TOKEN: 'fixture-write-token', STAGE1_POLICY_READ_TOKEN: policyToken },
      windowsHide: true,
    }), (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /publisher_policy_token_invalid/);
      assert.doesNotMatch(error.stderr + error.stdout, /fixture-write-token|must-not-read/);
      return true;
    });
  }
});

function publisherHttpFixture() {
  const repoId = 743050379;
  const calls = [];
  const state = { context: 'client', credentialStatus: 200, rulesetStatus: 200, rulesetDetailStatus: 200,
    protectionStatus: 200, headSha: target.headSha };
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(input);
    calls.push({ path: url.pathname, method: init.method ?? 'GET', search: url.search,
      authorization: new Headers(init.headers).get('Authorization') });
    const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers });
    if (state.credentialStatus !== 200) return json({}, state.credentialStatus);
    const repo = { id: repoId, full_name: repository };
    if (url.pathname === '/graphql') return json({ data: { repository: { pullRequest: {
      baseRefName: 'main', baseRefOid: target.baseSha, headRefName: 'feature/pilot', headRefOid: state.headSha,
      potentialMergeCommit: { oid: target.mergeSha }, mergeable: 'MERGEABLE', isDraft: false, state: 'OPEN',
      baseRepository: { databaseId: repoId, nameWithOwner: repository, defaultBranchRef: { name: 'main' } },
      headRepository: { databaseId: repoId, nameWithOwner: repository },
    } } } });
    const prefix = `/repos/${repository}`;
    if (url.pathname === `${prefix}/pulls/7`) return json({ number: 7, state: 'open', draft: false,
      updated_at: '2026-10-12T00:00:00Z', base: { ref: 'main', sha: target.baseSha, repo },
      head: { ref: 'feature/pilot', sha: state.headSha, repo } });
    if (url.pathname === prefix) return json({ ...repo, default_branch: 'main' });
    if (url.pathname === `${prefix}/branches/main/protection`) return json({ required_status_checks: {
      strict: true, contexts: [], checks: [{ context: state.context, app_id: 15368 }],
    } }, state.protectionStatus);
    if (url.pathname === `${prefix}/rulesets`) {
      if (state.rulesetStatus !== 200) return json({}, state.rulesetStatus);
      if (url.searchParams.get('page') === '1') return json([{ id: 42 }], 200, {
        link: `<https://api.github.com${prefix}/rulesets?includes_parents=true&page=2&per_page=100>; rel="next"`,
      });
      return json([]);
    }
    if (url.pathname === `${prefix}/rulesets/42`) return json({ id: 42, target: 'branch', enforcement: 'active',
      conditions: { ref_name: { include: ['refs/heads/main'], exclude: [] } }, rules: [{ type: 'required_status_checks',
        parameters: { strict_required_status_checks_policy: true,
          required_status_checks: [{ context: state.context, integration_id: 15368 }] } }] }, state.rulesetDetailStatus);
    if (url.pathname.endsWith('/check-runs')) return json({ total_count: 1, check_runs: [{ id: 1234,
      head_sha: target.testedSha, name: 'client', status: 'completed', conclusion: 'failure', app: { id: 15368 } }] });
    if (url.pathname.endsWith('/status')) return json({ sha: target.testedSha, statuses: [] });
    if (url.pathname === `${prefix}/actions/runs`) return json({ total_count: 0, workflow_runs: [] });
    if (init.method === 'PATCH') return json({ id: 1234, name: 'client', head_sha: target.testedSha,
      app: { id: 15368 }, status: 'completed', conclusion: 'success' });
    throw new Error(`Unexpected fixture route: ${url.pathname}`);
  };
  return { calls, state, fetchImpl };
}

it('reads complete paginated protection/ruleset policy through the real publisher adapter before PATCH', async () => {
  const fixture = publisherHttpFixture();
  const readTarget = createStage1PublisherReadTarget({ token: 'policy-token', target, fetchImpl: fixture.fetchImpl });
  const initial = await readTarget(target);
  assert.equal(initial.requiredCheckSnapshot?.collectionStatus, 'complete');
  const approved = { ...target, policyFingerprint: initial.requiredCheckSnapshot.policyFingerprint };
  const result = await publishVerifiedStage1Check({ token: 'workflow-token', repository, target: approved,
    retryRunUrl: `https://github.com/${repository}/actions/runs/9001`, verifierResult: 'success', readTarget,
    fetchImpl: createStage1PublisherTransport({ token: 'workflow-token', target: approved, fetchImpl: fixture.fetchImpl }) });
  assert.equal(result.status, 'published');
  assert.equal(fixture.calls.filter((call) => call.method === 'PATCH').length, 1);
  assert.ok(fixture.calls.some((call) => call.path.endsWith('/rulesets/42')));
  assert.ok(fixture.calls.some((call) => call.path.endsWith('/rulesets') && call.search.includes('page=2')));
  assert.equal(fixture.calls.at(-1).method, 'PATCH');
  assert.ok(fixture.calls.filter((call) => call.method !== 'PATCH').every((call) => call.authorization === 'Bearer policy-token'));
  assert.equal(fixture.calls.at(-1).authorization, 'Bearer workflow-token');
});

it('makes zero PATCH requests when fresh HTTP policy changes or cannot be fully read', async () => {
  for (const drift of [{ context: 'server' }, { credentialStatus: 401 }, { rulesetStatus: 403 }, { rulesetDetailStatus: 403 }, { protectionStatus: 403 },
    { headSha: 'f'.repeat(40) }]) {
    const fixture = publisherHttpFixture();
    const readTarget = createStage1PublisherReadTarget({ token: 'workflow-token', target, fetchImpl: fixture.fetchImpl });
    const initial = await readTarget(target);
    const approved = { ...target, policyFingerprint: initial.requiredCheckSnapshot?.policyFingerprint ?? target.policyFingerprint };
    Object.assign(fixture.state, drift);
    const result = await publishVerifiedStage1Check({ token: 'workflow-token', repository, target: approved,
      retryRunUrl: `https://github.com/${repository}/actions/runs/9001`, verifierResult: 'success', readTarget,
      fetchImpl: createStage1PublisherTransport({ token: 'workflow-token', target: approved, fetchImpl: fixture.fetchImpl }) });
    assert.equal(result.status, 'escalate');
    assert.equal(fixture.calls.filter((call) => call.method === 'PATCH').length, 0);
  }
});
