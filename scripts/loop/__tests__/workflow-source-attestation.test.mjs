import assert from 'node:assert/strict';
import { it } from 'node:test';
import { createWorkflowSourceVerifier } from '../workflow-source-attestation.mjs';

const SHA = 'a'.repeat(40);

function validEvidence(overrides = {}) {
  const snapshot = { repositoryId: 9, headSha: SHA, mergeSha: null };
  const identity = {
    type: 'workflow',
    repositoryId: 9,
    path: '.github/workflows/ci.yml',
    ref: 'refs/heads/main',
    sha: SHA,
  };
  const run = {
    id: 17,
    runAttempt: 1,
    repositoryId: 9,
    path: identity.path,
    ref: identity.ref,
    sourceSha: SHA,
    sourceShaAttested: true,
    testedSha: SHA,
  };
  return {
    identity: { ...identity, ...(overrides.identity ?? {}) },
    run: { ...run, ...(overrides.run ?? {}) },
    snapshot: { ...snapshot, ...(overrides.snapshot ?? {}) },
  };
}

it('refuses caller-asserted source metadata without a trusted verifier', async () => {
  const evidence = validEvidence();
  assert.equal(await createWorkflowSourceVerifier()(evidence), false);
});

it('refuses incomplete attestation inputs without calling the provider', async () => {
  let calls = 0;
  const verify = createWorkflowSourceVerifier({ verifyTrustedRecord: async () => { calls += 1; return true; } });
  const evidence = validEvidence();
  assert.equal(await verify(), false);
  assert.equal(await verify({ ...evidence, identity: null }), false);
  assert.equal(await verify({ ...evidence, run: null }), false);
  assert.equal(await verify({ ...evidence, snapshot: null }), false);
  assert.equal(calls, 0);
});

it('rejects non-workflow or unattested caller metadata', async () => {
  const verify = createWorkflowSourceVerifier({ verifyTrustedRecord: async () => true });
  assert.equal(await verify(validEvidence({ identity: { type: 'check' } })), false);
  assert.equal(await verify(validEvidence({ run: { sourceShaAttested: false } })), false);
});

it('rejects repository mismatches before trusting a source record', async () => {
  let calls = 0;
  const verify = createWorkflowSourceVerifier({ verifyTrustedRecord: async () => { calls += 1; return true; } });
  assert.equal(await verify(validEvidence({ identity: { repositoryId: 10 } })), false);
  assert.equal(await verify(validEvidence({ run: { repositoryId: 10 } })), false);
  assert.equal(calls, 0);
});

it('rejects workflow path, ref, or source SHA mismatches', async () => {
  let calls = 0;
  const verify = createWorkflowSourceVerifier({ verifyTrustedRecord: async () => { calls += 1; return true; } });
  assert.equal(await verify(validEvidence({ run: { path: '.github/workflows/other.yml' } })), false);
  assert.equal(await verify(validEvidence({ run: { ref: 'refs/heads/other' } })), false);
  assert.equal(await verify(validEvidence({ run: { sourceSha: 'b'.repeat(40) } })), false);
  assert.equal(calls, 0);
});

it('rejects invalid run IDs and attempts', async () => {
  let calls = 0;
  const verify = createWorkflowSourceVerifier({ verifyTrustedRecord: async () => { calls += 1; return true; } });
  assert.equal(await verify(validEvidence({ run: { id: 0 } })), false);
  assert.equal(await verify(validEvidence({ run: { id: Number.MAX_SAFE_INTEGER + 1 } })), false);
  assert.equal(await verify(validEvidence({ run: { runAttempt: 0 } })), false);
  assert.equal(calls, 0);
});

it('rejects a tested SHA outside the current head and merge tuple', async () => {
  let calls = 0;
  const verify = createWorkflowSourceVerifier({ verifyTrustedRecord: async () => { calls += 1; return true; } });
  assert.equal(await verify(validEvidence({ run: { testedSha: 'b'.repeat(40) } })), false);
  assert.equal(calls, 0);
});

it('accepts a merge-tested run only when its tested SHA matches the current merge SHA', async () => {
  let calls = 0;
  const evidence = validEvidence({
    run: { testedSha: 'b'.repeat(40) },
    snapshot: { mergeSha: 'b'.repeat(40) },
  });
  const verify = createWorkflowSourceVerifier({ verifyTrustedRecord: async () => { calls += 1; return true; } });
  assert.equal(await verify(evidence), true);
  assert.equal(calls, 1);
});

it('returns false when no matching trusted record exists', async () => {
  const verify = createWorkflowSourceVerifier({ verifyTrustedRecord: async () => false });
  assert.equal(await verify(validEvidence()), false);
});

it('fails closed when the trusted provider rejects or throws', async () => {
  const rejecting = createWorkflowSourceVerifier({ verifyTrustedRecord: async () => { throw new Error('provider unavailable'); } });
  const throwing = createWorkflowSourceVerifier({ verifyTrustedRecord: () => { throw new Error('provider unavailable'); } });
  assert.equal(await rejecting(validEvidence()), false);
  assert.equal(await throwing(validEvidence()), false);
});

it('passes the complete validated evidence to the trusted provider', async () => {
  const evidence = validEvidence();
  let received;
  const verify = createWorkflowSourceVerifier({ verifyTrustedRecord: async (record) => {
    received = record;
    return true;
  } });
  assert.equal(await verify(evidence), true);
  assert.deepEqual(received, evidence);
});
