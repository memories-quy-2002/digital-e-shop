import { createHash } from 'node:crypto';

import { serializeWorkflowSourceDescriptor } from './workflow-source-descriptor.mjs';

const OIDC_ISSUER = 'https://token.actions.githubusercontent.com';
const SUBJECT_NAME = 'digital-e-loop-workflow-source.json';
const DEFAULT_REPOSITORY = 'memories-quy-2002/digital-e-shop';
const SHA_PATTERN = /^[a-f0-9]{40}$/;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;
const verifiedWorkflowSourceRecords = new WeakSet();

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function isSha(value) {
  return typeof value === 'string' && SHA_PATTERN.test(value);
}

function validRepository(value) {
  if (typeof value !== 'string' || value.length > 201) return false;
  const parts = value.split('/');
  return parts.length === 2 && parts.every((part) => /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/.test(part)
    && !part.includes('..'));
}

function timestampMilliseconds(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value ? milliseconds : null;
}

function invocationMatches(value, repository, runId, runAttempt) {
  if (typeof value !== 'string') return false;
  const escapedRepository = repository.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = value.match(new RegExp(`^https://github\\.com/${escapedRepository}/actions/runs/(\\d+)/attempts/(\\d+)$`));
  return match !== null && Number(match[1]) === runId && Number(match[2]) === runAttempt;
}

function captureEvidence({ identity, run, snapshot } = {}) {
  if (!isRecord(identity) || !isRecord(run) || !isRecord(snapshot)) return null;
  try {
    return Object.freeze({
      identity: Object.freeze({
        type: identity.type,
        repositoryId: identity.repositoryId,
        path: identity.path,
        ref: identity.ref,
        sha: identity.sha,
      }),
      run: Object.freeze({
        id: run.id,
        runAttempt: run.runAttempt,
        repositoryId: run.repositoryId,
        workflowId: run.workflowId,
        path: run.path,
        ref: run.ref,
        event: run.event,
        headSha: run.headSha,
        testedSha: run.testedSha,
        createdAt: run.createdAt,
        updatedAt: run.updatedAt,
      }),
      snapshot: Object.freeze({
        repositoryId: snapshot.repositoryId,
        number: snapshot.number,
        baseSha: snapshot.baseSha,
        headSha: snapshot.headSha,
        mergeSha: snapshot.mergeSha,
      }),
    });
  } catch {
    return null;
  }
}

function prepareEvidence({ identity, run, snapshot, repository }) {
  if (!validRepository(repository) || !isRecord(identity) || identity.type !== 'workflow'
      || !isPositiveInteger(identity.repositoryId) || !isSha(identity.sha)
      || typeof identity.path !== 'string' || typeof identity.ref !== 'string'
      || !isRecord(run) || !isPositiveInteger(run.id) || !isPositiveInteger(run.runAttempt)
      || !isPositiveInteger(run.repositoryId) || run.repositoryId !== identity.repositoryId
      || !isPositiveInteger(run.workflowId) || run.path !== identity.path || run.ref !== identity.ref
      || run.event !== 'pull_request' || !isSha(run.testedSha) || run.headSha !== run.testedSha
      || !isRecord(snapshot) || snapshot.repositoryId !== identity.repositoryId
      || !isPositiveInteger(snapshot.number) || !isSha(snapshot.baseSha)
      || !isSha(snapshot.headSha) || !isSha(snapshot.mergeSha)
      || (run.testedSha !== snapshot.headSha && run.testedSha !== snapshot.mergeSha)) return null;

  const createdAt = timestampMilliseconds(run.createdAt);
  const updatedAt = timestampMilliseconds(run.updatedAt);
  if (createdAt === null || updatedAt === null || createdAt > updatedAt) return null;

  let descriptorBytes;
  try {
    descriptorBytes = serializeWorkflowSourceDescriptor({
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
  } catch {
    return null;
  }

  return {
    descriptorSha256: createHash('sha256').update(descriptorBytes).digest('hex'),
    createdAt,
    updatedAt,
    signerUri: `https://github.com/${repository}/${identity.path}@${identity.ref}`,
  };
}

function findVerifiedTimestamp(claims, expected) {
  if (!Array.isArray(claims.verifiedTimestamps) || claims.verifiedTimestamps.length === 0
      || claims.verifiedTimestamps.length > 16) return null;
  const accepted = claims.verifiedTimestamps
    .map(timestampMilliseconds)
    .filter((value) => value !== null && value >= expected.createdAt && value <= expected.updatedAt)
    .sort((left, right) => left - right);
  return accepted.length > 0 ? new Date(accepted[0]).toISOString() : null;
}

export function isVerifiedWorkflowSourceRecord(value) {
  return isRecord(value) && verifiedWorkflowSourceRecords.has(value);
}

export function createWorkflowSourceVerifier({
  inspectAttestation,
  repository = DEFAULT_REPOSITORY,
} = {}) {
  return async function verifyWorkflowSourceAttestation({ identity, run, snapshot } = {}) {
    if (typeof inspectAttestation !== 'function') return null;
    const captured = captureEvidence({ identity, run, snapshot });
    if (!captured) return null;
    const expected = prepareEvidence({ ...captured, repository });
    if (!expected) return null;

    let claims;
    try {
      claims = await inspectAttestation(captured);
    } catch {
      return null;
    }
    if (!isRecord(claims)) return null;

    const verifiedAt = findVerifiedTimestamp(claims, expected);
    if (claims.repositoryId !== captured.identity.repositoryId
        || claims.issuer !== OIDC_ISSUER
        || claims.sourceRepositoryIdentifier !== String(captured.identity.repositoryId)
        || claims.githubWorkflowRepository !== repository
        || claims.workflowPath !== captured.identity.path
        || claims.githubWorkflowRef !== captured.identity.ref
        || !isSha(claims.githubWorkflowSHA)
        || claims.githubWorkflowSHA !== captured.identity.sha
        || claims.githubWorkflowSHA !== claims.buildSignerDigest
        || claims.workflowId !== captured.run.workflowId
        || claims.testedSha !== captured.run.testedSha
        || claims.runId !== captured.run.id
        || claims.runAttempt !== captured.run.runAttempt
        || claims.subjectName !== SUBJECT_NAME
        || !isShaDigest(claims.subjectDigest)
        || claims.subjectDigest !== expected.descriptorSha256
        || claims.descriptorSha256 !== expected.descriptorSha256
        || claims.subjectAlternativeName?.type !== 'URI'
        || claims.subjectAlternativeName.value !== expected.signerUri
        || claims.buildSignerURI !== expected.signerUri
        || !invocationMatches(claims.runInvocationURI, repository, captured.run.id, captured.run.runAttempt)
        || !verifiedAt) return null;

    const record = Object.freeze({
      repositoryId: captured.identity.repositoryId,
      workflowPath: captured.identity.path,
      workflowRef: captured.identity.ref,
      sourceSha: claims.githubWorkflowSHA,
      runId: captured.run.id,
      runAttempt: captured.run.runAttempt,
      testedSha: captured.run.testedSha,
      descriptorSha256: expected.descriptorSha256,
      verifiedAt,
    });
    verifiedWorkflowSourceRecords.add(record);
    return record;
  };
}

function isShaDigest(value) {
  return typeof value === 'string' && DIGEST_PATTERN.test(value);
}
