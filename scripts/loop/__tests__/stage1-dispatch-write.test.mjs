import assert from 'node:assert/strict';
import { it } from 'node:test';

import { createStage1DispatchHost, dispatchStage1Retry } from '../stage1-dispatch-write.mjs';

const target = Object.freeze({ repository: 'memories-quy-2002/digital-e-shop', repositoryId: 743050379, prNumber: 7,
  baseSha: 'a'.repeat(40), headSha: 'b'.repeat(40), mergeSha: 'c'.repeat(40), testedSha: 'c'.repeat(40), context: 'client',
  appId: 15368, checkRunId: 1234, policyFingerprint: 'd'.repeat(64), workflowId: 77,
  workflowPath: '.github/workflows/stage1-trusted-retry.yml', workflowRef: 'main', workflowSourceSha: 'a'.repeat(40),
  actorId: 9988, actorLogin: 'digital-e-loop-runner[bot]', requestId: '1'.repeat(32) });

function setup(response = new Response(JSON.stringify({ workflow_run_id: 8001 }), { status: 200 }), revalidate = async (candidate) => candidate) {
  const calls = [];
  const events = [];
  let reserved = [];
  const finished = [];
  let revalidationCount = 0;
  const host = createStage1DispatchHost({ repository: target.repository, repositoryId: target.repositoryId, workflowId: target.workflowId,
    workflowPath: target.workflowPath,
    getReadToken: async () => { events.push('read-token'); return 'read-token'; },
    getWriteToken: async () => { events.push('write-token'); return 'write-token'; },
    revalidate: async (candidate, token) => {
      assert.equal(token, 'read-token');
      revalidationCount += 1;
      events.push(`revalidate-${revalidationCount}`);
      return revalidate(candidate, revalidationCount);
    },
    consumeApproval: async (_approval, candidate) => { events.push('consume-approval'); assert.deepEqual(candidate, target); },
    reserveBudget: async (key) => { events.push('reserve-budget'); reserved.push(key); return true; },
    finishBudget: async (key, status) => { events.push('finish-budget'); finished.push({ key, status }); },
    fetchImpl: async (url, init) => { events.push('dispatch'); calls.push({ url: new URL(url), init }); return response; } });
  return { host, calls, reserved, finished, events };
}

it('dispatches once to fixed workflow on main with bounded exact-target inputs after a post-token tuple check', async () => {
  const { host, calls, reserved, finished, events } = setup();
  const result = await dispatchStage1Retry({ host, decision: { action: 'retry-check', reasonCode: 'same_revision_pass_then_fail' }, target, approval: {} });
  assert.equal(result.status, 'submitted');
  assert.equal(result.workflowRunId, 8001);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.href, 'https://api.github.com/repos/memories-quy-2002/digital-e-shop/actions/workflows/77/dispatches');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.redirect, 'manual');
  assert.ok(calls[0].init.signal instanceof AbortSignal);
  assert.equal(calls[0].init.signal.aborted, false);
  assert.equal(calls[0].init.headers['X-GitHub-Api-Version'], '2026-03-10');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer write-token');
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.ref, 'main');
  assert.equal(body.inputs.check_run_id, '1234');
  assert.equal(body.inputs.tested_sha, target.testedSha);
  assert.equal(Object.hasOwn(body, 'return_run_details'), false);
  assert.equal(reserved.length, 1);
  assert.deepEqual(finished.map((entry) => entry.status), ['submitted']);
  assert.deepEqual(events, ['read-token', 'revalidate-1', 'consume-approval', 'write-token',
    'read-token', 'revalidate-2', 'reserve-budget', 'dispatch', 'finish-budget']);
});

it('escalates uncertain responses without issuing another request', async () => {
  for (const response of [new Response(null, { status: 204 }), new Response('{}', { status: 200 }),
    new Response(null, { status: 302, headers: { location: 'https://attacker.invalid' } })]) {
    const setupResult = setup(response);
    const result = await dispatchStage1Retry({ host: setupResult.host,
      decision: { action: 'retry-check', reasonCode: 'same_revision_pass_then_fail' }, target, approval: {} });
    assert.equal(result.status, 'escalate');
    assert.equal(setupResult.calls.length, 1);
    assert.equal(setupResult.reserved.length, 1);
    assert.deepEqual(setupResult.finished.map((entry) => entry.status), ['uncertain']);
  }
});

it('marks definitive client errors rejected while preserving uncertainty for server errors', async () => {
  for (const [status, expected] of [[403, 'rejected'], [422, 'rejected'], [503, 'uncertain']]) {
    const setupResult = setup(new Response('{}', { status }));
    await dispatchStage1Retry({ host: setupResult.host,
      decision: { action: 'retry-check', reasonCode: 'same_revision_pass_then_fail' }, target, approval: {} });
    assert.deepEqual(setupResult.finished.map((entry) => entry.status), [expected]);
  }
});

it('refuses target drift before reserving budget or performing network I/O', async () => {
  const { host, calls, reserved } = setup();
  const changed = { ...target, checkRunId: 9999 };
  const result = await dispatchStage1Retry({ host, decision: { action: 'retry-check', reasonCode: 'same_revision_pass_then_fail' }, target: changed, approval: {} });
  assert.equal(result.reasonCode, 'approval_or_revalidation_failed');
  assert.equal(calls.length, 0);
  assert.equal(reserved.length, 0);
});

it('refuses actor identity drift after approval and before reserving budget or dispatching', async () => {
  const { host, calls, reserved } = setup(undefined, async (candidate) => ({ ...candidate, actorId: 9999 }));
  const result = await dispatchStage1Retry({ host,
    decision: { action: 'retry-check', reasonCode: 'same_revision_pass_then_fail' }, target, approval: {} });
  assert.equal(result.reasonCode, 'stage1_target_stale');
  assert.equal(calls.length, 0);
  assert.equal(reserved.length, 0);
});

it('revalidates the approved tuple after minting the write token and before reserving budget', async () => {
  const { host, calls, reserved } = setup(undefined, (candidate, count) => count === 1
    ? candidate
    : { ...candidate, headSha: 'e'.repeat(40) });
  const result = await dispatchStage1Retry({ host,
    decision: { action: 'retry-check', reasonCode: 'same_revision_pass_then_fail' }, target, approval: {} });
  assert.equal(result.reasonCode, 'stage1_target_stale');
  assert.equal(calls.length, 0);
  assert.equal(reserved.length, 0);
});
