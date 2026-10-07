import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';

import {
  createWorkflowSourceVerifier,
  isVerifiedWorkflowSourceRecord,
} from '../workflow-source-attestation.mjs';
import { serializeWorkflowSourceDescriptor } from '../workflow-source-descriptor.mjs';

const REPOSITORY = 'memories-quy-2002/digital-e-shop';
const WORKFLOW_PATH = '.github/workflows/loop-foundation.yml';
const WORKFLOW_REF = 'refs/pull/17/merge';
const SOURCE_SHA = 'd'.repeat(40);
const TESTED_SHA = 'a'.repeat(40);
const BASE_SHA = 'b'.repeat(40);
const HEAD_SHA = 'c'.repeat(40);
const RUN_CREATED_AT = '2026-10-07T12:00:00.000Z';
const RUN_UPDATED_AT = '2026-10-07T12:05:00.000Z';
const VERIFIED_AT = '2026-10-07T12:02:00.000Z';
const SIGNER_URI = `https://github.com/${REPOSITORY}/${WORKFLOW_PATH}@${WORKFLOW_REF}`;
const RUN_URI = `https://github.com/${REPOSITORY}/actions/runs/123/attempts/2`;

function validEvidence() {
  const identity = {
    type: 'workflow',
    repositoryId: 9,
    path: WORKFLOW_PATH,
    ref: WORKFLOW_REF,
    sha: SOURCE_SHA,
  };
  const run = {
    id: 123,
    runAttempt: 2,
    repositoryId: 9,
    workflowId: 42,
    path: WORKFLOW_PATH,
    ref: WORKFLOW_REF,
    event: 'pull_request',
    headSha: TESTED_SHA,
    testedSha: TESTED_SHA,
    createdAt: RUN_CREATED_AT,
    updatedAt: RUN_UPDATED_AT,
    sourceSha: 'e'.repeat(40),
    sourceShaAttested: false,
  };
  const snapshot = {
    repositoryId: 9,
    number: 17,
    baseSha: BASE_SHA,
    headSha: HEAD_SHA,
    mergeSha: TESTED_SHA,
  };
  return { identity, run, snapshot };
}

function expectedDescriptorDigest({ run, snapshot }) {
  const descriptor = serializeWorkflowSourceDescriptor({
    repositoryId: snapshot.repositoryId,
    workflowId: run.workflowId,
    workflowPath: run.path,
    workflowRef: run.ref,
    runId: run.id,
    runAttempt: run.runAttempt,
    eventName: run.event,
    testedSha: run.testedSha,
    pullRequest: {
      number: snapshot.number,
      baseSha: snapshot.baseSha,
      headSha: snapshot.headSha,
      mergeSha: snapshot.mergeSha,
    },
  });
  return createHash('sha256').update(descriptor).digest('hex');
}

function verifiedClaims(evidence, overrides = {}) {
  return {
    repositoryId: evidence.snapshot.repositoryId,
    issuer: 'https://token.actions.githubusercontent.com',
    sourceRepositoryIdentifier: '9',
    githubWorkflowRepository: REPOSITORY,
    workflowPath: evidence.run.path,
    githubWorkflowRef: WORKFLOW_REF,
    githubWorkflowSHA: SOURCE_SHA,
    buildSignerDigest: SOURCE_SHA,
    workflowId: evidence.run.workflowId,
    testedSha: evidence.run.testedSha,
    runId: evidence.run.id,
    runAttempt: evidence.run.runAttempt,
    subjectAlternativeName: { type: 'URI', value: SIGNER_URI },
    buildSignerURI: SIGNER_URI,
    runInvocationURI: RUN_URI,
    subjectName: 'digital-e-loop-workflow-source.json',
    subjectDigest: expectedDescriptorDigest(evidence),
    descriptorSha256: expectedDescriptorDigest(evidence),
    verifiedTimestamps: [VERIFIED_AT],
    ...overrides,
  };
}

describe('workflow source verifier', () => {
  it('returns no record when the certificate inspector is absent', async () => {
    const verify = createWorkflowSourceVerifier();
    assert.equal(await verify(validEvidence()), null);
  });

  it('refuses incomplete inputs without calling the certificate inspector', async () => {
    let calls = 0;
    const verify = createWorkflowSourceVerifier({ inspectAttestation: async () => { calls += 1; } });
    const evidence = validEvidence();

    assert.equal(await verify(), null);
    assert.equal(await verify({ ...evidence, identity: null }), null);
    assert.equal(await verify({ ...evidence, run: null }), null);
    assert.equal(await verify({ ...evidence, snapshot: null }), null);
    assert.equal(calls, 0);
  });

  it('issues a frozen verifier-owned record from exact certificate claims', async () => {
    const evidence = validEvidence();
    const claims = verifiedClaims(evidence);
    let received;
    const verify = createWorkflowSourceVerifier({
      repository: REPOSITORY,
      inspectAttestation: async (input) => {
        received = input;
        return claims;
      },
    });

    const record = await verify(evidence);

    assert.deepEqual(received.identity, evidence.identity);
    assert.deepEqual(received.snapshot, evidence.snapshot);
    assert.equal(received.run.id, evidence.run.id);
    assert.equal(received.run.sourceSha, undefined);
    assert.equal(received.run.sourceShaAttested, undefined);
    assert.deepEqual(record, {
      repositoryId: 9,
      workflowPath: WORKFLOW_PATH,
      workflowRef: WORKFLOW_REF,
      sourceSha: SOURCE_SHA,
      runId: 123,
      runAttempt: 2,
      testedSha: TESTED_SHA,
      descriptorSha256: claims.subjectDigest,
      verifiedAt: VERIFIED_AT,
    });
    assert.equal(Object.isFrozen(record), true);
    assert.equal(isVerifiedWorkflowSourceRecord(record), true);
    assert.equal(isVerifiedWorkflowSourceRecord({ ...record }), false);
    assert.equal(isVerifiedWorkflowSourceRecord(null), false);
  });

  it('derives source SHA from githubWorkflowSHA and ignores raw run flags and predicate-shaped data', async () => {
    const evidence = validEvidence();
    const claims = verifiedClaims(evidence, {
      sourceRepositoryDigest: TESTED_SHA,
      predicate: { sourceSha: 'f'.repeat(40), runId: 999, runAttempt: 999 },
    });
    const verify = createWorkflowSourceVerifier({ inspectAttestation: async () => claims });

    const record = await verify(evidence);

    assert.equal(record.sourceSha, SOURCE_SHA);
    assert.notEqual(record.sourceSha, evidence.run.sourceSha);
    assert.equal(record.sourceShaAttested, undefined);
  });

  it('pins the PR and run tuple while the certificate inspector is waiting', async () => {
    const evidence = validEvidence();
    const originalClaims = verifiedClaims(evidence);
    let releaseInspection;
    const inspectionPaused = new Promise((resolve) => { releaseInspection = resolve; });
    const verify = createWorkflowSourceVerifier({ inspectAttestation: async (input) => {
      assert.equal(Object.isFrozen(input.identity), true);
      assert.equal(Object.isFrozen(input.run), true);
      assert.equal(Object.isFrozen(input.snapshot), true);
      await inspectionPaused;
      return originalClaims;
    } });

    const pending = verify(evidence);
    evidence.identity.sha = 'e'.repeat(40);
    evidence.run.id = 124;
    evidence.snapshot.headSha = 'f'.repeat(40);
    releaseInspection();

    const record = await pending;
    assert.equal(record.sourceSha, SOURCE_SHA);
    assert.equal(record.runId, 123);
    assert.equal(record.testedSha, TESTED_SHA);
  });

  it('rejects repository, allowlist, workflow path/ref, signer, and descriptor mismatches', async () => {
    const evidence = validEvidence();
    const variants = [
      { identity: { repositoryId: 10 } },
      { identity: { sha: 'e'.repeat(40) } },
      { run: { repositoryId: 10 } },
      { run: { path: '.github/workflows/other.yml' } },
      { run: { ref: 'refs/pull/18/merge' } },
      { snapshot: { baseSha: 'e'.repeat(40) } },
      { claims: { issuer: 'https://wrong.example' } },
      { claims: { sourceRepositoryIdentifier: '10' } },
      { claims: { githubWorkflowRepository: 'other/repository' } },
      { claims: { githubWorkflowRef: 'refs/heads/main' } },
      { claims: { githubWorkflowSHA: 'e'.repeat(40), buildSignerDigest: 'e'.repeat(40) } },
      { claims: { buildSignerDigest: 'e'.repeat(40) } },
      { claims: { subjectAlternativeName: { type: 'URI', value: 'https://github.com/other/repo/workflow.yml@refs/heads/main' } } },
      { claims: { subjectName: 'other.json' } },
      { claims: { subjectDigest: 'f'.repeat(64) } },
    ];

    for (const variant of variants) {
      const changedEvidence = {
        identity: { ...evidence.identity, ...variant.identity },
        run: { ...evidence.run, ...variant.run },
        snapshot: { ...evidence.snapshot, ...variant.snapshot },
      };
      const claims = verifiedClaims(evidence, variant.claims);
      const verify = createWorkflowSourceVerifier({ inspectAttestation: async () => claims });
      assert.equal(await verify(changedEvidence), null);
    }
  });

  it('requires a verified timestamp inside the exact observed run interval', async () => {
    const evidence = validEvidence();
    const invalidTimestamps = [
      [],
      ['2026-10-07T11:59:59.999Z'],
      ['2026-10-07T12:05:00.001Z'],
      ['not-a-timestamp'],
    ];
    for (const verifiedTimestamps of invalidTimestamps) {
      const verify = createWorkflowSourceVerifier({
        inspectAttestation: async () => verifiedClaims(evidence, { verifiedTimestamps }),
      });
      assert.equal(await verify(evidence), null);
    }
  });

  it('binds the signed invocation URI to this run attempt and PR descriptor', async () => {
    const evidence = validEvidence();
    const invalidClaims = [
      { runInvocationURI: `https://github.com/${REPOSITORY}/actions/runs/124/attempts/2` },
      { runInvocationURI: `https://github.com/${REPOSITORY}/actions/runs/123/attempts/1` },
      { subjectDigest: 'e'.repeat(64) },
    ];
    for (const overrides of invalidClaims) {
      const verify = createWorkflowSourceVerifier({
        inspectAttestation: async () => verifiedClaims(evidence, overrides),
      });
      assert.equal(await verify(evidence), null);
    }
  });

  it('rejects malformed runs, incomplete PR tuples, and tested SHAs outside the current tuple', async () => {
    const evidence = validEvidence();
    let calls = 0;
    const verify = createWorkflowSourceVerifier({ inspectAttestation: async () => { calls += 1; return verifiedClaims(evidence); } });
    assert.equal(await verify({ ...evidence, run: { ...evidence.run, id: 0 } }), null);
    assert.equal(await verify({ ...evidence, run: { ...evidence.run, runAttempt: 0 } }), null);
    assert.equal(await verify({ ...evidence, run: { ...evidence.run, testedSha: 'f'.repeat(40) } }), null);
    assert.equal(await verify({ ...evidence, snapshot: { ...evidence.snapshot, mergeSha: null } }), null);
    assert.equal(calls, 0);
  });

  it('returns null when the provider has no matching result or rejects', async () => {
    const evidence = validEvidence();
    const unavailable = createWorkflowSourceVerifier({ inspectAttestation: async () => null });
    const throwing = createWorkflowSourceVerifier({ inspectAttestation: async () => { throw new Error('secret'); } });
    assert.equal(await unavailable(evidence), null);
    assert.equal(await throwing(evidence), null);
  });
});
