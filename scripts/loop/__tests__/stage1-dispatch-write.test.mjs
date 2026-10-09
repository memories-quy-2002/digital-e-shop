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
  let reserved = [];
  const host = createStage1DispatchHost({ repository: target.repository, repositoryId: target.repositoryId, workflowId: target.workflowId,
    workflowPath: target.workflowPath, getReadToken: async () => 'read-token', getWriteToken: async () => 'write-token',
    revalidate: async (candidate, token) => { assert.equal(token, 'read-token'); return revalidate(candidate); },
    consumeApproval: async (_approval, candidate) => assert.deepEqual(candidate, target),
    reserveBudget: async (key) => { reserved.push(key); return true; },
    fetchImpl: async (url, init) => { calls.push({ url: new URL(url), init }); return response; } });
  return { host, calls, reserved };
}

it('dispatches once to fixed workflow on main with bounded exact-target inputs and requires returned run ID', async () => {
  const { host, calls, reserved } = setup();
  const result = await dispatchStage1Retry({ host, decision: { action: 'retry-check', reasonCode: 'same_revision_pass_then_fail' }, target, approval: {} });
  assert.equal(result.status, 'submitted');
  assert.equal(result.workflowRunId, 8001);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.href, 'https://api.github.com/repos/memories-quy-2002/digital-e-shop/actions/workflows/77/dispatches');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.redirect, 'manual');
  assert.equal(calls[0].init.headers['X-GitHub-Api-Version'], '2026-03-10');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer write-token');
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.ref, 'main');
  assert.equal(body.inputs.check_run_id, '1234');
  assert.equal(body.inputs.tested_sha, target.testedSha);
  assert.equal(body.return_run_details, true);
  assert.equal(reserved.length, 1);
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
