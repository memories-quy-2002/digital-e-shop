import { constants as fsConstants } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { open, lstat, realpath, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createGitHubAuthProvider } from './github-auth-provider.mjs';
import { createGitHubPrClient } from './github-pr-client.mjs';
import { loadLoopPolicy } from './policy.mjs';
import { parsePrBabysitterArguments, runPrBabysitterCli, PR_BABYSITTER_EXIT_CODES } from './pr-babysitter-cli.mjs';
import {
  PrBabysitterStateNotFoundError,
  createPrBabysitterState,
  loadPrBabysitterState,
  savePrBabysitterState,
} from './pr-state.mjs';

export const STAGE0_REPOSITORY = 'memories-quy-2002/digital-e-shop';
export const STAGE0_REPOSITORY_ID = 743050379;

const execFileAsync = promisify(execFile);
const SHA = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i;
const POLICY_FILES = ['protected-paths.yml', 'risk-rules.yml', 'stop-conditions.yml'];
const MAX_APP_KEY_BYTES = 16 * 1024;
const MAX_OUTPUT_IDENTITIES = 100;
const MAX_OUTPUT_OBSERVATIONS = 200;

class Stage0HostError extends Error {
  constructor(reasonCode, exitCode = PR_BABYSITTER_EXIT_CODES.refused) {
    super(reasonCode);
    this.name = 'Stage0HostError';
    this.reasonCode = reasonCode;
    this.exitCode = exitCode;
  }
}

function isInside(parent, target) {
  const relative = path.relative(parent, target);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function samePath(left, right) {
  const a = path.resolve(left);
  const b = path.resolve(right);
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function parsePositiveId(value) {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,19}$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function normalizeGitHubOrigin(value) {
  if (typeof value !== 'string' || value.trim() !== value || value.length > 2048) return null;
  let candidate;
  if (value.startsWith('https://')) {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'github.com' || url.port
          || url.username || url.password || url.search || url.hash) return null;
      candidate = url.pathname.replace(/^\//, '').replace(/\.git$/i, '');
    } catch {
      return null;
    }
  } else {
    const match = /^(?:git@github\.com:|ssh:\/\/git@github\.com\/)([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)(?:\.git)?$/i.exec(value);
    if (!match) return null;
    candidate = match[1];
  }
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(candidate)) return null;
  return candidate.toLowerCase();
}

async function git(repoRoot, args, options = {}) {
  try {
    const result = await execFileAsync('git', ['-C', repoRoot, ...args], {
      encoding: 'utf8',
      timeout: 15_000,
      windowsHide: true,
      maxBuffer: options.maxBuffer ?? 256 * 1024,
    });
    return result.stdout.trimEnd();
  } catch {
    throw new Stage0HostError(options.reasonCode ?? 'checkout_validation_failed');
  }
}

async function validateCheckout(repoRootInput) {
  let root;
  try {
    root = await realpath(path.resolve(repoRootInput));
  } catch {
    throw new Stage0HostError('repository_checkout_unavailable');
  }
  const gitRoot = await git(root, ['rev-parse', '--show-toplevel']);
  let realGitRoot;
  try {
    realGitRoot = await realpath(gitRoot);
  } catch {
    throw new Stage0HostError('repository_checkout_unavailable');
  }
  if (!samePath(root, realGitRoot)) throw new Stage0HostError('repository_root_mismatch');

  const origin = await git(root, ['remote', 'get-url', 'origin']);
  if (normalizeGitHubOrigin(origin) !== STAGE0_REPOSITORY) throw new Stage0HostError('repository_origin_rejected');
  return root;
}

async function validateAppConfig(env, repoRoot) {
  const appId = parsePositiveId(env?.LOOP_GITHUB_APP_ID);
  const installationId = parsePositiveId(env?.LOOP_GITHUB_APP_INSTALLATION_ID);
  const appClientId = env?.LOOP_GITHUB_APP_CLIENT_ID;
  const keyPathValue = env?.LOOP_GITHUB_APP_PRIVATE_KEY_FILE;
  if (!appId || !installationId || typeof appClientId !== 'string' || appClientId.length < 1
      || appClientId.length > 200 || appClientId.trim() !== appClientId
      || typeof keyPathValue !== 'string' || keyPathValue.trim() !== keyPathValue || keyPathValue.length > 2048) {
    throw new Stage0HostError('app_configuration_missing');
  }

  const keyPath = path.resolve(keyPathValue);
  if (isInside(repoRoot, keyPath)) throw new Stage0HostError('app_key_path_rejected');
  let pathInfo;
  try {
    pathInfo = await lstat(keyPath);
  } catch {
    throw new Stage0HostError('app_key_unavailable');
  }
  if (pathInfo.isSymbolicLink() || !pathInfo.isFile() || pathInfo.size < 1 || pathInfo.size > MAX_APP_KEY_BYTES) {
    throw new Stage0HostError('app_key_path_rejected');
  }
  let canonicalKeyPath;
  try {
    canonicalKeyPath = await realpath(keyPath);
  } catch {
    throw new Stage0HostError('app_key_unavailable');
  }
  if (isInside(repoRoot, canonicalKeyPath)) throw new Stage0HostError('app_key_path_rejected');

  let keyHandle;
  try {
    const flags = fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0);
    keyHandle = await open(keyPath, flags);
    const openedInfo = await keyHandle.stat();
    const currentInfo = await lstat(keyPath);
    if (!openedInfo.isFile() || currentInfo.isSymbolicLink() || openedInfo.size < 1
        || openedInfo.size > MAX_APP_KEY_BYTES || openedInfo.dev !== currentInfo.dev || openedInfo.ino !== currentInfo.ino) {
      throw new Stage0HostError('app_key_path_rejected');
    }
    const key = await keyHandle.readFile('utf8');
    return { appId, appClientId, installationId, key };
  } catch (error) {
    if (error instanceof Stage0HostError) throw error;
    throw new Stage0HostError('app_key_unavailable');
  } finally {
    await keyHandle?.close().catch(() => {});
  }
}

async function loadPolicyAtBaseCommit(repoRoot, baseSha) {
  if (!SHA.test(baseSha)) throw new Stage0HostError('pr_base_revision_invalid');
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'digital-e-loop-stage0-policy-'));
  try {
    const policyDirectory = path.join(temporaryRoot, '.agent', 'policy');
    await mkdir(policyDirectory, { recursive: true });
    for (const filename of POLICY_FILES) {
      let content;
      try {
        content = await execFileAsync('git', ['-C', repoRoot, 'show', `${baseSha}:.agent/policy/${filename}`], {
          encoding: 'utf8', timeout: 15_000, windowsHide: true, maxBuffer: 64 * 1024,
        });
      } catch {
        throw new Stage0HostError('canonical_base_policy_unavailable');
      }
      await writeFile(path.join(policyDirectory, filename), content.stdout, { encoding: 'utf8', mode: 0o600 });
    }
    try {
      return await loadLoopPolicy(temporaryRoot);
    } catch {
      throw new Stage0HostError('canonical_base_policy_invalid');
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

function assertEligiblePullRequest(snapshot) {
  if (snapshot.repository !== STAGE0_REPOSITORY || snapshot.repositoryId !== STAGE0_REPOSITORY_ID
      || snapshot.baseRepositoryId !== STAGE0_REPOSITORY_ID || snapshot.headRepositoryId !== STAGE0_REPOSITORY_ID
      || snapshot.defaultBranch !== 'main' || snapshot.state !== 'open' || snapshot.baseRef !== 'main'
      || snapshot.headRepository !== STAGE0_REPOSITORY || snapshot.headRef === 'main') {
    throw new Stage0HostError('pr_not_eligible');
  }
  if (!SHA.test(snapshot.baseSha) || !SHA.test(snapshot.headSha)
      || (snapshot.mergeSha !== null && !SHA.test(snapshot.mergeSha))) {
    throw new Stage0HostError('pr_revision_invalid');
  }
}

async function assertCheckoutMatchesPr(repoRoot, snapshot) {
  const [head, branch, status] = await Promise.all([
    git(repoRoot, ['rev-parse', 'HEAD']),
    git(repoRoot, ['symbolic-ref', '--quiet', '--short', 'HEAD']),
    git(repoRoot, ['status', '--porcelain=v1', '--untracked-files=all']),
  ]);
  if (head.toLowerCase() !== snapshot.headSha.toLowerCase()) throw new Stage0HostError('checkout_head_does_not_match_pr');
  if (branch !== snapshot.headRef) throw new Stage0HostError('checkout_branch_does_not_match_pr');
  if (status.length > 0) throw new Stage0HostError('checkout_must_be_clean');
}

function sameTuple(left, right) {
  return left.baseSha === right.baseSha && left.headSha === right.headSha && left.mergeSha === right.mergeSha;
}

function isCurrentResult(result, snapshot) {
  return result?.status === 'current' && result.snapshot && sameTuple(result.snapshot, snapshot);
}

function observationCoverage(result, requiredCheckKeys) {
  const matching = (result?.observations ?? []).filter((observation) => requiredCheckKeys.has(observation.requiredCheckKey));
  const keys = new Set(matching.map((observation) => observation.requiredCheckKey));
  return { observations: matching, count: keys.size };
}

function summarizeCheckObservation(observation) {
  return {
    checkId: observation.checkId,
    requiredCheckKey: observation.requiredCheckKey,
    requiredWorkflowKey: observation.requiredWorkflowKey,
    provider: observation.provider,
    testedSha: observation.testedSha,
    status: observation.status,
    conclusion: observation.conclusion,
    attemptKey: observation.attemptKey,
  };
}

function summarizeCheckCollection(collection, requiredCheckSnapshot, requiredCheckKeys, snapshot, metadataWithinOutputBound) {
  const snapshotCurrent = isCurrentResult(collection.result, snapshot);
  const coverage = snapshotCurrent
    ? observationCoverage(collection.result, requiredCheckKeys)
    : { observations: [], count: 0 };
  const observedKeys = new Set(coverage.observations.map((observation) => observation.requiredCheckKey));
  const unmatched = snapshotCurrent
    ? requiredCheckSnapshot.requiredChecks.filter(({ context, appId }) => {
      const key = context + (appId === null ? '|legacy' : '|app:' + appId);
      return !observedKeys.has(key);
    })
    : null;
  const checkCollectionComplete = metadataWithinOutputBound && snapshotCurrent
    && collection.result.checkCollectionComplete === true;

  return {
    testedSha: collection.testedSha,
    collectionStatus: !collection.result ? 'unavailable' : !snapshotCurrent
      ? 'stale' : checkCollectionComplete ? 'complete' : 'incomplete',
    snapshotCurrent,
    checkCollectionComplete,
    requiredIdentityCoverage: {
      matched: coverage.count,
      total: requiredCheckKeys.size,
      unmatched: unmatched === null ? null : unmatched.slice(0, MAX_OUTPUT_IDENTITIES).map(({ context, appId }) => ({ context, appId })),
      unmatchedTotal: unmatched === null ? null : unmatched.length,
      unmatchedTruncated: unmatched !== null && unmatched.length > MAX_OUTPUT_IDENTITIES,
    },
    observationsTotal: coverage.observations.length,
    observationsTruncated: coverage.observations.length > MAX_OUTPUT_OBSERVATIONS,
    observations: coverage.observations.slice(0, MAX_OUTPUT_OBSERVATIONS).map(summarizeCheckObservation),
  };
}

function chooseCheckCollection(results, requiredCheckKeys, snapshot) {
  const usable = results.filter(({ result }) => isCurrentResult(result, snapshot));
  const completeAndCovering = usable.filter(({ result }) => result.checkCollectionComplete === true
    && observationCoverage(result, requiredCheckKeys).count === requiredCheckKeys.size);
  const merge = completeAndCovering.find(({ testedSha }) => testedSha === snapshot.mergeSha);
  if (merge) return merge;
  const head = completeAndCovering.find(({ testedSha }) => testedSha === snapshot.headSha);
  if (head) return head;
  return usable.find(({ testedSha }) => testedSha === snapshot.mergeSha)
    ?? usable.find(({ testedSha }) => testedSha === snapshot.headSha)
    ?? { testedSha: snapshot.headSha, result: null };
}

function summarizeReviews(reviews) {
  const counts = { approved: 0, changesRequested: 0, commented: 0, dismissed: 0, pending: 0, other: 0 };
  for (const review of reviews?.reviews ?? []) {
    if (review.state === 'APPROVED') counts.approved += 1;
    else if (review.state === 'CHANGES_REQUESTED') counts.changesRequested += 1;
    else if (review.state === 'COMMENTED') counts.commented += 1;
    else if (review.state === 'DISMISSED') counts.dismissed += 1;
    else if (review.state === 'PENDING') counts.pending += 1;
    else counts.other += 1;
  }
  return {
    collectionStatus: reviews?.collectionStatus === 'complete' ? 'complete' : 'incomplete',
    reviewCount: (reviews?.reviews ?? []).length,
    commentCount: (reviews?.reviewComments ?? []).length,
    counts,
  };
}

function summarizeWorkflowEvidence(requiredWorkflows, collection, testedSha) {
  return requiredWorkflows.map((identity) => {
    let reasonCode = 'workflow_source_sha_unattested';
    if (!collection || collection.status !== 'current' || collection.collectionStatus !== 'complete') {
      reasonCode = 'workflow_collection_incomplete';
    } else {
      const matchingRuns = collection.runs.filter((run) => run.repositoryId === identity.repositoryId
        && run.path === identity.path && run.ref === identity.ref && run.testedSha === testedSha);
      if (matchingRuns.length === 0) reasonCode = 'required_workflow_not_found';
    }
    return {
      identity: { repositoryId: identity.repositoryId, path: identity.path, ref: identity.ref, sha: identity.sha },
      testedSha,
      status: 'unavailable',
      sourceSha: null,
      reasonCode,
    };
  });
}

function buildStage0Summary(requiredCheckSnapshot, selected, checkCollectionComplete, checkCollectionsBySha,
  workflowEvidence, files, reviews) {
  const observations = selected.result && isCurrentResult(selected.result, selected.result.snapshot)
    ? observationCoverage(selected.result, new Set(requiredCheckSnapshot.requiredCheckKeys)).observations
    : [];
  const requiredChecks = requiredCheckSnapshot.requiredChecks;
  const requiredWorkflows = requiredCheckSnapshot.requiredWorkflows;
  return {
    requiredCheckSnapshot: {
      collectionStatus: requiredCheckSnapshot.collectionStatus,
      policyFingerprint: requiredCheckSnapshot.policyFingerprint,
      requiredChecksTotal: requiredChecks.length,
      requiredWorkflowsTotal: requiredWorkflows.length,
      identitiesTruncated: requiredChecks.length > MAX_OUTPUT_IDENTITIES || requiredWorkflows.length > MAX_OUTPUT_IDENTITIES,
      requiredChecks: requiredChecks.slice(0, MAX_OUTPUT_IDENTITIES).map(({ context, appId }) => ({ context, appId })),
      requiredWorkflows: requiredWorkflows.slice(0, MAX_OUTPUT_IDENTITIES).map(({ repositoryId, path: workflowPath, ref, sha }) => ({
        repositoryId, path: workflowPath, ref, sha,
      })),
    },
    checkCollectionsBySha,
    testedSha: selected.testedSha,
    checkCollectionComplete,
    observationsTotal: observations.length,
    observationsTruncated: observations.length > MAX_OUTPUT_OBSERVATIONS,
    observations: observations.slice(0, MAX_OUTPUT_OBSERVATIONS).map(summarizeCheckObservation),
    workflowEvidence,
    changedFiles: {
      collectionStatus: files?.collectionStatus === 'complete' ? 'complete' : 'incomplete',
      count: Array.isArray(files?.files) ? files.files.length : 0,
    },
    reviewSummary: summarizeReviews(reviews),
  };
}

export async function createPrBabysitterStage0Host({ prNumber, repoRoot = process.cwd(), env = process.env } = {}) {
  if (!Number.isSafeInteger(prNumber) || prNumber < 1) throw new Stage0HostError('invalid_arguments');
  const root = await validateCheckout(repoRoot);
  const appConfig = await validateAppConfig(env, root);

  const prompt = Object.assign(async () => false, { isTTY: false });
  const authProvider = createGitHubAuthProvider({
    appId: appConfig.appId,
    appClientId: appConfig.appClientId,
    installationId: appConfig.installationId,
    repositoryId: STAGE0_REPOSITORY_ID,
    getAppPrivateKey: async () => appConfig.key,
    trustedApproverIds: [],
    prompt,
  });
  let installationToken;
  const getObserveToken = async (capability = 'observe') => {
    if (capability !== 'observe') throw new Stage0HostError('stage0_read_only');
    if (!installationToken) installationToken = await authProvider.getInstallationToken('observe');
    return installationToken;
  };
  // Mint one tightly scoped token now so an invalid App installation fails before inspection starts.
  await getObserveToken('observe');

  const prClient = createGitHubPrClient({ repository: STAGE0_REPOSITORY, getToken: getObserveToken });
  let initialSnapshot;
  try {
    initialSnapshot = await prClient.getPullRequest(prNumber);
  } catch {
    throw new Stage0HostError('github_pr_observation_failed', PR_BABYSITTER_EXIT_CODES.infrastructure);
  }
  assertEligiblePullRequest(initialSnapshot);
  await assertCheckoutMatchesPr(root, initialSnapshot);
  const policy = await loadPolicyAtBaseCommit(root, initialSnapshot.baseSha);

  async function readCurrentSnapshot(number) {
    let snapshot;
    try {
      snapshot = await prClient.getPullRequest(number);
    } catch {
      throw new Stage0HostError('github_pr_observation_failed', PR_BABYSITTER_EXIT_CODES.infrastructure);
    }
    assertEligiblePullRequest(snapshot);
    if (snapshot.baseSha !== initialSnapshot.baseSha) throw new Stage0HostError('pr_base_changed_during_stage0');
    await assertCheckoutMatchesPr(root, snapshot);
    return snapshot;
  }

  const host = {
    config: {
      repository: STAGE0_REPOSITORY,
      repositoryId: STAGE0_REPOSITORY_ID,
      repoRoot: root,
      taskId: `stage0-pr-${prNumber}-${initialSnapshot.headSha.slice(0, 12)}`,
      policy,
    },
    adapters: {
      pr: {
        async collect(number) {
          const prSnapshot = await readCurrentSnapshot(number);
          const testedShas = [...new Set([prSnapshot.mergeSha, prSnapshot.headSha].filter(Boolean))];
          const [files, requiredCheckSnapshot, reviews, ...checkResults] = await Promise.all([
            prClient.getPullRequestFiles(number),
            prClient.getRequiredCheckSnapshot({ baseRef: prSnapshot.baseRef, headSha: prSnapshot.headSha }),
            prClient.getReviewMetadata(number),
            ...testedShas.map(async (testedSha) => ({
              testedSha,
              result: await prClient.getCommitCheckRuns(testedSha),
            })),
          ]);
          const requiredKeys = new Set(requiredCheckSnapshot.requiredCheckKeys);
          const selected = chooseCheckCollection(checkResults, requiredKeys, prSnapshot);
          const isCurrent = selected.result && isCurrentResult(selected.result, prSnapshot);
          const metadataWithinOutputBound = requiredCheckSnapshot.requiredChecks.length <= MAX_OUTPUT_IDENTITIES
            && requiredCheckSnapshot.requiredWorkflows.length <= MAX_OUTPUT_IDENTITIES;
          const checkCollectionComplete = metadataWithinOutputBound && isCurrent && selected.result.checkCollectionComplete === true;
          const checkCollectionsBySha = checkResults.map((collection) => summarizeCheckCollection(
            collection, requiredCheckSnapshot, requiredKeys, prSnapshot, metadataWithinOutputBound,
          ));

          let workflowCollection = null;
          if (requiredCheckSnapshot.requiredWorkflows.length > 0) {
            try { workflowCollection = await prClient.getWorkflowRuns(selected.testedSha); }
            catch { workflowCollection = null; }
          }
          const workflowEvidence = summarizeWorkflowEvidence(
            requiredCheckSnapshot.requiredWorkflows,
            workflowCollection,
            selected.testedSha,
          );
          const observations = isCurrent
            ? observationCoverage(selected.result, requiredKeys).observations
            : [];

          return {
            prSnapshot,
            requiredCheckSnapshot,
            checkObservations: observations,
            checkCollectionComplete,
            stage0Summary: buildStage0Summary(requiredCheckSnapshot, selected, checkCollectionComplete, checkCollectionsBySha,
              workflowEvidence, files, reviews),
          };
        },
        async refresh(number) {
          return readCurrentSnapshot(number);
        },
      },
      state: {
        async load(repository, number, snapshot) {
          try {
            return await loadPrBabysitterState(root, repository, number);
          } catch (error) {
            if (!(error instanceof PrBabysitterStateNotFoundError)) throw error;
            return createPrBabysitterState(snapshot);
          }
        },
        async save(_repository, _number, state) {
          await savePrBabysitterState(root, state);
        },
      },
      auth: { getInstallationToken: getObserveToken },
      repair: Object.freeze({}),
      writer: Object.freeze({}),
      budget: async () => ({ stop: true, reasonCode: 'stage0_read_only' }),
      telemetry: async () => {},
    },
  };
  return Object.freeze({ ...host, adapters: Object.freeze(host.adapters) });
}

function writeJson(stream, value) {
  stream.write(`${JSON.stringify(value)}\n`);
}

export async function runPrBabysitterStage0({ argv = process.argv.slice(2), repoRoot = process.cwd(), env = process.env, io = {} } = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  let args;
  try {
    args = parsePrBabysitterArguments(argv);
  } catch {
    writeJson(stderr, { status: 'refused', reasonCode: 'invalid_arguments' });
    return { exitCode: PR_BABYSITTER_EXIT_CODES.refused };
  }
  if (args.command !== 'inspect') {
    writeJson(stderr, { status: 'refused', reasonCode: 'stage0_read_only' });
    return { exitCode: PR_BABYSITTER_EXIT_CODES.refused };
  }
  if (args.repository !== STAGE0_REPOSITORY) {
    writeJson(stderr, { status: 'refused', reasonCode: 'repository_not_allowlisted' });
    return { exitCode: PR_BABYSITTER_EXIT_CODES.refused };
  }
  if (args.dryRun) {
    return runPrBabysitterCli({ argv, trustedHost: null, io: { ...io, stdout, stderr } });
  }
  try {
    const trustedHost = await createPrBabysitterStage0Host({ prNumber: args.prNumber, repoRoot, env });
    return await runPrBabysitterCli({ argv, trustedHost, io: { ...io, stdout, stderr } });
  } catch (error) {
    const reasonCode = error instanceof Stage0HostError ? error.reasonCode : 'stage0_observation_failed';
    const exitCode = error instanceof Stage0HostError ? error.exitCode : PR_BABYSITTER_EXIT_CODES.infrastructure;
    writeJson(stderr, { status: exitCode === PR_BABYSITTER_EXIT_CODES.infrastructure ? 'error' : 'refused', reasonCode });
    return { exitCode };
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  const result = await runPrBabysitterStage0({
    argv: process.argv.slice(2),
    repoRoot: process.cwd(),
    env: process.env,
    io: { stdout: process.stdout, stderr: process.stderr, isTTY: process.stdin.isTTY === true },
  });
  process.exitCode = result.exitCode;
}
