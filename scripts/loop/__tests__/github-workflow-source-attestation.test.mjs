import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { describe, it } from 'node:test';

import { createGitHubWorkflowSourceAttestationProvider } from '../github-workflow-source-attestation.mjs';
import { serializeWorkflowSourceDescriptor } from '../workflow-source-descriptor.mjs';

const REPOSITORY = 'memories-quy-2002/digital-e-shop';
const TOKEN = 'ghs_test_token_must_not_be_logged';
const WORKFLOW_PATH = '.github/workflows/loop-foundation.yml';
const WORKFLOW_REF = 'refs/pull/17/merge';
const WORKFLOW_SHA = 'd'.repeat(40);
const TESTED_SHA = 'a'.repeat(40);
const BASE_SHA = 'b'.repeat(40);
const HEAD_SHA = 'c'.repeat(40);
const SUBJECT_NAME = 'digital-e-loop-workflow-source.json';
const OIDC_ISSUER = 'https://token.actions.githubusercontent.com';
const SIGNER_URI = `https://github.com/${REPOSITORY}/${WORKFLOW_PATH}@${WORKFLOW_REF}`;

function makeInputs({ allowlistedSha = WORKFLOW_SHA, runOverrides = {}, snapshotOverrides = {} } = {}) {
  const identity = {
    type: 'workflow',
    repositoryId: 9,
    path: WORKFLOW_PATH,
    ref: WORKFLOW_REF,
    ...(allowlistedSha ? { sha: allowlistedSha } : {}),
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
    createdAt: '2026-10-07T12:00:00.000Z',
    updatedAt: '2026-10-07T12:05:00.000Z',
    ...runOverrides,
  };
  const snapshot = {
    repositoryId: 9,
    number: 17,
    baseSha: BASE_SHA,
    headSha: HEAD_SHA,
    mergeSha: TESTED_SHA,
    ...snapshotOverrides,
  };
  return { identity, run, snapshot };
}

function descriptorDigest({ identity, run, snapshot }) {
  const bytes = serializeWorkflowSourceDescriptor({
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
  assert.equal(identity.repositoryId, snapshot.repositoryId);
  return hashDescriptor(bytes);
}

function hashDescriptor(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function verifiedOutput(inputs, overrides = {}) {
  const subjectDigest = overrides.subjectDigest ?? await descriptorDigest(inputs);
  const result = {
    attestation: { bundle: 'ignored by the adapter' },
    verificationResult: {
      statement: {
        subject: [{ name: overrides.subjectName ?? SUBJECT_NAME, digest: { sha256: subjectDigest } }],
        predicate: overrides.predicate ?? { sourceSha: 'e'.repeat(40), runId: 999, runAttempt: 999 },
      },
      signature: {
        certificate: {
          issuer: OIDC_ISSUER,
          githubWorkflowRepository: REPOSITORY,
          githubWorkflowRef: WORKFLOW_REF,
          githubWorkflowSHA: WORKFLOW_SHA,
          buildSignerDigest: WORKFLOW_SHA,
          sourceRepositoryIdentifier: '9',
          sourceRepositoryDigest: TESTED_SHA,
          subjectAlternativeName: SIGNER_URI,
          buildSignerURI: SIGNER_URI,
          runInvocationURI: `https://github.com/${REPOSITORY}/actions/runs/123/attempts/2`,
          ...overrides.certificate,
        },
      },
      verifiedTimestamps: overrides.verifiedTimestamps ?? [{
        type: 'Tlog',
        timestamp: '2026-10-07T12:02:00.000Z',
      }],
    },
  };
  return JSON.stringify(Array.from({ length: overrides.resultCount ?? 1 }, () => result));
}

function makeExecFile({ verificationOutput, version = 'gh version 2.92.0 (2026-04-28)\n', firstError, secondError } = {}) {
  const calls = [];
  const execFileImpl = (file, args, options, callback) => {
    calls.push({ file, args, options });
    const callIndex = calls.length;
    const error = callIndex === 1 ? firstError : secondError;
    const stdout = callIndex === 1 ? version : verificationOutput;
    queueMicrotask(() => callback(error ?? null, stdout ?? '', 'private stderr must not escape'));
  };
  return { calls, execFileImpl };
}

function providerFor(execFileImpl, options = {}) {
  return createGitHubWorkflowSourceAttestationProvider({
    repository: REPOSITORY,
    getToken: async () => TOKEN,
    execFileImpl,
    ...options,
  });
}

describe('GitHub workflow source attestation provider', () => {
  it('reads the workflow source from githubWorkflowSHA and ignores sourceRepositoryDigest', async () => {
    const inputs = makeInputs();
    const output = await verifiedOutput(inputs);
    const { calls, execFileImpl } = makeExecFile({ verificationOutput: output });
    const provider = providerFor(execFileImpl);

    const claims = await provider.inspectWorkflowSourceAttestation(inputs);

    assert.equal(claims.githubWorkflowSHA, WORKFLOW_SHA);
    assert.equal(claims.sourceRepositoryDigest, undefined);
    assert.equal(claims.subjectName, SUBJECT_NAME);
    assert.deepEqual(claims.subjectAlternativeName, { type: 'URI', value: SIGNER_URI });
    assert.equal(claims.descriptorSha256, await descriptorDigest(inputs));
    assert.equal(Object.isFrozen(claims), true);
    assert.equal(Object.isFrozen(claims.verifiedTimestamps), true);
    assert.equal(calls[1].args.includes('--signer-digest'), true);
    assert.equal(calls[1].args.at(-1), WORKFLOW_SHA);
  });

  it('binds the signed certificate to the exact run and attempt', async () => {
    const inputs = makeInputs();
    const output = await verifiedOutput(inputs, {
      certificate: { runInvocationURI: `https://github.com/${REPOSITORY}/actions/runs/123/attempts/1` },
    });
    const provider = providerFor(makeExecFile({ verificationOutput: output }).execFileImpl);

    await assert.rejects(provider.inspectWorkflowSourceAttestation(inputs), { code: 'attestation_claim_mismatch' });
  });

  it('omits signer-digest in probe mode but enforces the allowlisted digest in trust mode', async () => {
    const probeInputs = makeInputs({ allowlistedSha: null });
    const probeOutput = await verifiedOutput(probeInputs);
    const probeExec = makeExecFile({ verificationOutput: probeOutput });
    const probeProvider = providerFor(probeExec.execFileImpl);
    await probeProvider.inspectWorkflowSourceAttestation(probeInputs);
    assert.equal(probeExec.calls[1].args.includes('--signer-digest'), false);

    const trustInputs = makeInputs();
    const wrongSignerOutput = await verifiedOutput(trustInputs, {
      certificate: { githubWorkflowSHA: 'e'.repeat(40), buildSignerDigest: 'e'.repeat(40) },
    });
    const trustProvider = providerFor(makeExecFile({ verificationOutput: wrongSignerOutput }).execFileImpl);
    await assert.rejects(trustProvider.inspectWorkflowSourceAttestation(trustInputs), { code: 'attestation_claim_mismatch' });
  });

  it('rejects predicate-only identity claims', async () => {
    const inputs = makeInputs();
    const output = await verifiedOutput(inputs, {
      certificate: {
        githubWorkflowSHA: undefined,
        buildSignerDigest: undefined,
        runInvocationURI: undefined,
      },
      predicate: {
        githubWorkflowSHA: WORKFLOW_SHA,
        buildSignerDigest: WORKFLOW_SHA,
        runId: 123,
        runAttempt: 2,
      },
    });
    const provider = providerFor(makeExecFile({ verificationOutput: output }).execFileImpl);

    await assert.rejects(provider.inspectWorkflowSourceAttestation(inputs), { code: 'attestation_claim_mismatch' });
  });

  it('calls gh without a shell, passes the observe token only through GH_TOKEN, and removes the temporary descriptor', async () => {
    const inputs = makeInputs();
    const output = await verifiedOutput(inputs);
    const { calls, execFileImpl } = makeExecFile({ verificationOutput: output });
    const provider = providerFor(execFileImpl);

    await provider.inspectWorkflowSourceAttestation(inputs);

    assert.equal(calls[0].file, 'gh');
    assert.deepEqual(calls[0].args, ['--version']);
    assert.equal(calls[1].file, 'gh');
    assert.deepEqual(calls[1].args.slice(0, 2), ['attestation', 'verify']);
    assert.deepEqual(calls[1].args.slice(3), [
      '--repo', REPOSITORY,
      '--signer-workflow', `${REPOSITORY}/${WORKFLOW_PATH}`,
      '--cert-oidc-issuer', OIDC_ISSUER,
      '--format', 'json',
      '--limit', '30',
      '--signer-digest', WORKFLOW_SHA,
    ]);
    assert.equal(calls[1].options.shell, false);
    assert.equal(calls[1].options.timeout > 0, true);
    assert.equal(calls[1].options.maxBuffer > 0, true);
    assert.equal(calls[1].options.env.GH_TOKEN, TOKEN);
    assert.equal(calls[1].args.some((argument) => argument.includes(TOKEN)), false);
    assert.equal(calls[1].options.env.GITHUB_TOKEN, undefined);
    await assert.rejects(stat(calls[1].args[2]));
  });

  it('rejects a missing or unsupported gh CLI', async () => {
    const inputs = makeInputs();
    const missing = makeExecFile({ firstError: Object.assign(new Error(TOKEN), { code: 'ENOENT' }) });
    await assert.rejects(providerFor(missing.execFileImpl).inspectWorkflowSourceAttestation(inputs), {
      code: 'attestation_cli_unavailable',
    });

    const oldVersion = makeExecFile({ version: 'gh version 2.91.9\n' });
    await assert.rejects(providerFor(oldVersion.execFileImpl).inspectWorkflowSourceAttestation(inputs), {
      code: 'attestation_cli_unsupported',
    });
  });

  it('rejects nonzero, timed-out, and oversized CLI output without leaking details', async () => {
    const inputs = makeInputs();
    const failed = makeExecFile({ secondError: Object.assign(new Error(TOKEN), { code: 1 }) });
    await assert.rejects(providerFor(failed.execFileImpl).inspectWorkflowSourceAttestation(inputs), (error) => {
      assert.equal(error.code, 'attestation_cli_failed');
      assert.equal(error.message.includes(TOKEN), false);
      assert.equal(error.message.includes('private stderr'), false);
      return true;
    });

    const timedOut = makeExecFile({ secondError: Object.assign(new Error(TOKEN), { code: 'ETIMEDOUT' }) });
    await assert.rejects(providerFor(timedOut.execFileImpl).inspectWorkflowSourceAttestation(inputs), {
      code: 'attestation_cli_timeout',
    });

    const oversized = makeExecFile({ verificationOutput: 'x'.repeat(256 * 1024 + 1) });
    await assert.rejects(providerFor(oversized.execFileImpl).inspectWorkflowSourceAttestation(inputs), {
      code: 'attestation_output_overflow',
    });
  });

  it('rejects malformed, empty, duplicate, and limit-truncated verification results', async () => {
    const inputs = makeInputs();
    const outputs = [
      '{not-json',
      '[]',
      await verifiedOutput(inputs, { resultCount: 2 }),
      await verifiedOutput(inputs, { resultCount: 30 }),
    ];
    const expectedCodes = [
      'attestation_output_malformed',
      'attestation_result_unavailable',
      'attestation_result_ambiguous',
      'attestation_result_ambiguous',
    ];
    for (let index = 0; index < outputs.length; index += 1) {
      const provider = providerFor(makeExecFile({ verificationOutput: outputs[index] }).execFileImpl);
      await assert.rejects(provider.inspectWorkflowSourceAttestation(inputs), { code: expectedCodes[index] });
    }
  });

  it('rejects issuer, repository, workflow, ref, digest, subject, and timestamp mismatches', async () => {
    const inputs = makeInputs();
    const variants = [
      { certificate: { issuer: 'https://wrong.example' } },
      { certificate: { githubWorkflowRepository: 'other/repository' } },
      { certificate: { subjectAlternativeName: 'https://github.com/other/repo/.github/workflows/ci.yml@refs/heads/main' } },
      { certificate: { githubWorkflowRef: 'refs/heads/main' } },
      { certificate: { sourceRepositoryIdentifier: '10' } },
      { certificate: { githubWorkflowSHA: 'e'.repeat(40), buildSignerDigest: 'e'.repeat(40) } },
      { subjectName: 'other.json' },
      { subjectDigest: 'f'.repeat(64) },
      { verifiedTimestamps: [] },
      { verifiedTimestamps: [{ timestamp: '2026-10-07T12:06:00.000Z' }] },
      { verifiedTimestamps: [{ timestamp: 'not-a-time' }] },
    ];
    for (const overrides of variants) {
      const output = await verifiedOutput(inputs, overrides);
      const provider = providerFor(makeExecFile({ verificationOutput: output }).execFileImpl);
      await assert.rejects(provider.inspectWorkflowSourceAttestation(inputs), { code: 'attestation_claim_mismatch' });
    }
  });

  it('rejects replayed attestations for another run, attempt, tested SHA, or PR tuple', async () => {
    const originalInputs = makeInputs();
    const output = await verifiedOutput(originalInputs);
    const changedInputs = [
      makeInputs({ runOverrides: { id: 124 } }),
      makeInputs({ runOverrides: { runAttempt: 3 } }),
      makeInputs({ runOverrides: { testedSha: HEAD_SHA } }),
      makeInputs({ snapshotOverrides: { number: 18 } }),
      makeInputs({ snapshotOverrides: { baseSha: 'e'.repeat(40) } }),
    ];
    for (const inputs of changedInputs) {
      const provider = providerFor(makeExecFile({ verificationOutput: output }).execFileImpl);
      await assert.rejects(provider.inspectWorkflowSourceAttestation(inputs));
    }
  });
});
