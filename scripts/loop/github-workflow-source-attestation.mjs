import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { serializeWorkflowSourceDescriptor } from './workflow-source-descriptor.mjs';

const OIDC_ISSUER = 'https://token.actions.githubusercontent.com';
const SUBJECT_NAME = 'digital-e-loop-workflow-source.json';
const SHA_PATTERN = /^[a-f0-9]{40}$/;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;
const MAX_OUTPUT_BYTES = 256 * 1024;
const MAX_TIMESTAMP_RESULTS = 16;
const CLI_TIMEOUT_MS = 20_000;
const MINIMUM_GH_VERSION = Object.freeze([2, 92, 0]);

class WorkflowSourceAttestationError extends Error {
  constructor(code) {
    super(code);
    this.name = 'WorkflowSourceAttestationError';
    this.code = code;
  }
}

function reject(code) {
  throw new WorkflowSourceAttestationError(code);
}

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

function parseGhVersion(stdout) {
  if (typeof stdout !== 'string' || Buffer.byteLength(stdout, 'utf8') > 4096) return null;
  const match = stdout.match(/^gh version (\d+)\.(\d+)\.(\d+)(?:\b|$)/m);
  if (!match) return null;
  return match.slice(1).map(Number);
}

function versionAtLeast(version, minimum) {
  for (let index = 0; index < minimum.length; index += 1) {
    if (version[index] > minimum[index]) return true;
    if (version[index] < minimum[index]) return false;
  }
  return true;
}

function sanitizedEnvironment(token) {
  const allowedKeys = [
    'PATH', 'HOME', 'USERPROFILE', 'SystemRoot', 'WINDIR',
    'TMP', 'TEMP', 'TMPDIR', 'SSL_CERT_FILE', 'SSL_CERT_DIR',
    'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY',
  ];
  const env = {};
  for (const key of allowedKeys) {
    if (typeof process.env[key] === 'string' && process.env[key].length > 0) env[key] = process.env[key];
  }
  env.GH_TOKEN = token;
  env.GH_HOST = 'github.com';
  env.GH_PROMPT = 'disabled';
  return env;
}

function mapExecutionError(error, phase) {
  if (error?.code === 'ENOENT') return 'attestation_cli_unavailable';
  if (error?.code === 'ETIMEDOUT' || error?.killed === true) return 'attestation_cli_timeout';
  if (error?.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') return 'attestation_output_overflow';
  if (phase === 'verify') return 'attestation_cli_failed';
  return 'attestation_cli_unavailable';
}

function validDescriptorInput({ repository, identity, run, snapshot }) {
  if (!validRepository(repository) || !isRecord(identity) || identity.type !== 'workflow'
      || !isPositiveInteger(identity.repositoryId) || !isPositiveInteger(snapshot?.repositoryId)
      || identity.repositoryId !== snapshot.repositoryId
      || !isPositiveInteger(run?.repositoryId) || run.repositoryId !== snapshot.repositoryId
      || !isPositiveInteger(run?.id) || !isPositiveInteger(run?.runAttempt)
      || !isPositiveInteger(run?.workflowId) || !isSha(run?.testedSha)
      || run?.headSha !== run.testedSha || typeof run?.event !== 'string'
      || typeof run?.path !== 'string' || typeof run?.ref !== 'string'
      || identity.path !== run.path || identity.ref !== run.ref
      || (identity.sha !== undefined && !isSha(identity.sha))) return null;

  const timestamp = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value))
    ? Date.parse(value)
    : null;
  const createdAt = timestamp(run.createdAt);
  const updatedAt = timestamp(run.updatedAt);
  if (createdAt === null || updatedAt === null || createdAt > updatedAt) return null;

  let pullRequest = null;
  if (run.event === 'pull_request') {
    if (!isPositiveInteger(snapshot.number) || !isSha(snapshot.baseSha)
        || !isSha(snapshot.headSha) || !isSha(snapshot.mergeSha)
        || (run.testedSha !== snapshot.headSha && run.testedSha !== snapshot.mergeSha)) return null;
    pullRequest = {
      number: snapshot.number,
      baseSha: snapshot.baseSha,
      headSha: snapshot.headSha,
      mergeSha: snapshot.mergeSha,
    };
  }

  try {
    const descriptorBytes = serializeWorkflowSourceDescriptor({
      repositoryId: snapshot.repositoryId,
      workflowId: run.workflowId,
      workflowPath: run.path,
      workflowRef: run.ref,
      runId: run.id,
      runAttempt: run.runAttempt,
      eventName: run.event,
      testedSha: run.testedSha,
      pullRequest,
    });
    return {
      descriptorBytes,
      descriptorSha256: createHash('sha256').update(descriptorBytes).digest('hex'),
      createdAt,
      updatedAt,
      runId: run.id,
      runAttempt: run.runAttempt,
      workflowId: run.workflowId,
      testedSha: run.testedSha,
      workflowPath: run.path,
      workflowRef: run.ref,
      repositoryId: snapshot.repositoryId,
    };
  } catch {
    return null;
  }
}

function parseRunInvocationURI(value, repository) {
  if (typeof value !== 'string') return null;
  const escapedRepository = repository.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = value.match(new RegExp(`^https://github\\.com/${escapedRepository}/actions/runs/(\\d+)/attempts/(\\d+)$`));
  if (!match) return null;
  const runId = Number(match[1]);
  const runAttempt = Number(match[2]);
  return isPositiveInteger(runId) && isPositiveInteger(runAttempt) ? { runId, runAttempt } : null;
}

function verifiedRunTimestamps(verifiedTimestamps, createdAt, updatedAt) {
  if (!Array.isArray(verifiedTimestamps) || verifiedTimestamps.length === 0
      || verifiedTimestamps.length > MAX_TIMESTAMP_RESULTS) return null;
  const matching = [];
  for (const entry of verifiedTimestamps) {
    const value = entry?.timestamp;
    if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return null;
    const milliseconds = Date.parse(value);
    if (milliseconds >= createdAt && milliseconds <= updatedAt) matching.push(new Date(milliseconds).toISOString());
  }
  return matching.length > 0 ? Object.freeze([...new Set(matching)].sort()) : null;
}

function parseVerifiedResult(stdout, { repository, identity, expected }) {
  if (typeof stdout !== 'string' || Buffer.byteLength(stdout, 'utf8') > MAX_OUTPUT_BYTES) {
    reject('attestation_output_overflow');
  }

  let results;
  try {
    results = JSON.parse(stdout);
  } catch {
    reject('attestation_output_malformed');
  }
  if (!Array.isArray(results) || results.length === 0) reject('attestation_result_unavailable');
  if (results.length !== 1 || results.length >= 30) reject('attestation_result_ambiguous');

  const verification = results[0]?.verificationResult;
  const certificate = verification?.signature?.certificate;
  const subjects = verification?.statement?.subject;
  if (!isRecord(certificate) || !Array.isArray(subjects) || subjects.length !== 1) {
    reject('attestation_claim_mismatch');
  }

  const subject = subjects[0];
  const subjectDigest = subject?.digest;
  const subjectDigestKeys = isRecord(subjectDigest) ? Object.keys(subjectDigest) : [];
  const invocation = parseRunInvocationURI(certificate.runInvocationURI, repository);
  const expectedSignerURI = `https://github.com/${repository}/${expected.workflowPath}@${expected.workflowRef}`;
  const san = certificate.subjectAlternativeName;
  const timestampClaims = verifiedRunTimestamps(
    verification.verifiedTimestamps,
    expected.createdAt,
    expected.updatedAt,
  );

  if (certificate.issuer !== OIDC_ISSUER
      || certificate.githubWorkflowRepository !== repository
      || certificate.sourceRepositoryIdentifier !== String(expected.repositoryId)
      || certificate.githubWorkflowRef !== expected.workflowRef
      || !isSha(certificate.githubWorkflowSHA)
      || certificate.githubWorkflowSHA !== certificate.buildSignerDigest
      || (identity.sha !== undefined && certificate.githubWorkflowSHA !== identity.sha)
      || san?.type !== 'URI' || san.value !== expectedSignerURI
      || certificate.buildSignerURI !== expectedSignerURI
      || !invocation || invocation.runId !== expected.runId
      || invocation.runAttempt !== expected.runAttempt
      || subject?.name !== SUBJECT_NAME
      || subjectDigestKeys.length !== 1 || subjectDigestKeys[0] !== 'sha256'
      || !DIGEST_PATTERN.test(subjectDigest.sha256)
      || subjectDigest.sha256 !== expected.descriptorSha256
      || !timestampClaims) {
    reject('attestation_claim_mismatch');
  }

  return Object.freeze({
    repositoryId: expected.repositoryId,
    issuer: certificate.issuer,
    sourceRepositoryIdentifier: certificate.sourceRepositoryIdentifier,
    githubWorkflowRepository: certificate.githubWorkflowRepository,
    workflowPath: expected.workflowPath,
    githubWorkflowRef: certificate.githubWorkflowRef,
    githubWorkflowSHA: certificate.githubWorkflowSHA,
    buildSignerDigest: certificate.buildSignerDigest,
    subjectAlternativeName: Object.freeze({ type: san.type, value: san.value }),
    buildSignerURI: certificate.buildSignerURI,
    runId: invocation.runId,
    runAttempt: invocation.runAttempt,
    workflowId: expected.workflowId,
    testedSha: expected.testedSha,
    runInvocationURI: certificate.runInvocationURI,
    subjectName: subject.name,
    subjectDigest: subjectDigest.sha256,
    descriptorSha256: expected.descriptorSha256,
    verifiedTimestamps: timestampClaims,
  });
}

export function createGitHubWorkflowSourceAttestationProvider({
  repository,
  getToken,
  execFileImpl = execFile,
} = {}) {
  if (!validRepository(repository) || typeof execFileImpl !== 'function'
      || (getToken !== undefined && typeof getToken !== 'function')) {
    throw new WorkflowSourceAttestationError('invalid_attestation_provider_configuration');
  }
  async function executeGh(args, token, phase) {
    try {
      const stdout = await new Promise((resolve, rejectPromise) => {
        execFileImpl('gh', args, {
          encoding: 'utf8',
          timeout: CLI_TIMEOUT_MS,
          maxBuffer: MAX_OUTPUT_BYTES,
          windowsHide: true,
          shell: false,
          env: sanitizedEnvironment(token),
        }, (error, output) => {
          if (error) rejectPromise(error);
          else resolve(output);
        });
      });
      return typeof stdout === 'string' ? stdout : '';
    } catch (error) {
      reject(mapExecutionError(error, phase));
    }
  }

  async function inspectWorkflowSourceAttestation({ identity, run, snapshot } = {}) {
    const expected = validDescriptorInput({ repository, identity, run, snapshot });
    if (!expected) reject('invalid_attestation_inputs');

    let token;
    try {
      token = typeof getToken === 'function' ? await getToken('observe') : process.env.GH_TOKEN;
    } catch {
      reject('attestation_cli_unavailable');
    }
    if (typeof token !== 'string' || token.length === 0 || token.length > 8192 || /[\x00-\x1f\x7f]/.test(token)) {
      reject('attestation_cli_unavailable');
    }

    let temporaryDirectory;
    try {
      temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'digital-e-loop-attestation-'));
      const descriptorPath = path.join(temporaryDirectory, SUBJECT_NAME);
      await writeFile(descriptorPath, expected.descriptorBytes, { flag: 'wx', mode: 0o600 });
      const versionOutput = await executeGh(['--version'], token, 'version');
      const version = parseGhVersion(versionOutput);
      if (!version || !versionAtLeast(version, MINIMUM_GH_VERSION)) reject('attestation_cli_unsupported');

      const args = [
        'attestation', 'verify', descriptorPath,
        '--repo', repository,
        '--signer-workflow', `${repository}/${identity.path}`,
        '--cert-oidc-issuer', OIDC_ISSUER,
        '--format', 'json',
        '--limit', '30',
      ];
      if (identity.sha !== undefined) args.push('--signer-digest', identity.sha);
      const output = await executeGh(args, token, 'verify');
      return parseVerifiedResult(output, { repository, identity, expected });
    } catch (error) {
      if (error instanceof WorkflowSourceAttestationError) throw error;
      reject(temporaryDirectory ? 'attestation_cli_failed' : 'attestation_temp_unavailable');
    } finally {
      if (temporaryDirectory) {
        try {
          await rm(temporaryDirectory, { recursive: true, force: true });
        } catch {
          reject('attestation_cleanup_failed');
        }
      }
    }
  }

  return Object.freeze({ inspectWorkflowSourceAttestation });
}
