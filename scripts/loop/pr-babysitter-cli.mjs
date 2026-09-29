import { createHash } from 'node:crypto';

import { decidePrAction } from './pr-babysitter.mjs';
import { buildEscalationPacket, buildRepairPacket } from './pr-packets.mjs';
import { classifyFailure } from './classify-failure.mjs';
import {
  buildFailureEvidence, normalizeCheckObservation, normalizePrSnapshot, normalizeRequiredCheckSnapshot,
} from './pr-evidence.mjs';
import {
  reconcilePrBabysitterState, recordActionableFailure, recordCheckObservation, recordFlakyRetry, recordRepairRequest,
  validatePrBabysitterState,
} from './pr-state.mjs';
import { redactVerificationOutput } from './verify.mjs';

export const PR_BABYSITTER_EXIT_CODES = Object.freeze({ ready: 0, wait: 1, escalated: 2, refused: 3, infrastructure: 4 });
const COMMANDS = new Set(['inspect', 'decide', 'rerun-flaky', 'begin-repair', 'validate-repair', 'escalation']);
const SHA = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i;

export function parsePrBabysitterArguments(argv) {
  if (!Array.isArray(argv) || argv.length < 5 || !COMMANDS.has(argv[0])) throw new TypeError('invalid command arguments');
  const command = argv[0];
  let repository; let prNumber; let patch; let dryRun = false;
  for (let i = 1; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === '--dry-run') { dryRun = true; continue; }
    const value = argv[++i];
    if (!value || value.startsWith('--')) throw new TypeError('missing option value');
    if (key === '--repo' && repository === undefined) repository = value;
    else if (key === '--pr' && prNumber === undefined) prNumber = value;
    else if (key === '--patch' && patch === undefined) patch = value;
    else throw new TypeError('unsupported or duplicate option');
  }
  if (!/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/.test(repository ?? '')
      || !/^[1-9][0-9]{0,8}$/.test(prNumber ?? '')) throw new TypeError('invalid repository or PR number');
  if ((command === 'validate-repair') !== (patch !== undefined) || (patch && (patch.length > 4096 || patch.startsWith('-')))) {
    throw new TypeError('invalid patch option');
  }
  return Object.freeze({ command, repository: repository.toLowerCase(), prNumber: Number(prNumber), ...(patch ? { patch } : {}), dryRun });
}

function isRecord(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function validHost(host) {
  return isRecord(host) && isRecord(host.config) && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(host.config.repository)
    && Number.isSafeInteger(host.config.repositoryId) && host.config.repositoryId > 0
    && typeof host.config.repoRoot === 'string' && typeof host.config.taskId === 'string'
    && isRecord(host.config.policy) && isRecord(host.adapters) && isRecord(host.adapters.pr)
    && typeof host.adapters.pr.collect === 'function' && typeof host.adapters.pr.refresh === 'function'
    && isRecord(host.adapters.state) && typeof host.adapters.state.load === 'function'
    && typeof host.adapters.state.save === 'function' && isRecord(host.adapters.auth)
    && isRecord(host.adapters.repair) && isRecord(host.adapters.writer)
    && typeof host.adapters.budget === 'function' && typeof host.adapters.telemetry === 'function';
}
function validHostFor(host, command) {
  if (!validHost(host)) return false;
  const { actions, repair, verifier, writer, auth } = host.adapters;
  if (command === 'rerun-flaky') return isRecord(actions) && isRecord(actions.host)
    && typeof actions.getTarget === 'function' && typeof actions.rerunFailedJobs === 'function'
    && typeof auth.authenticateApprover === 'function' && typeof auth.requestApproval === 'function';
  if (command === 'validate-repair') return repair.session !== undefined
    && typeof repair.readProposal === 'function' && typeof repair.validateRepairProposal === 'function'
    && isRecord(verifier) && typeof verifier.buildFullPlan === 'function' && typeof verifier.run === 'function'
    && typeof writer.readFinalDiff === 'function' && typeof writer.readHeadSha === 'function'
    && typeof writer.readWorkspaceFingerprint === 'function' && typeof writer.push === 'function'
    && typeof auth.authenticateApprover === 'function' && typeof auth.requestApproval === 'function'
    && typeof auth.consumeApproval === 'function' && typeof auth.getInstallationToken === 'function';
  return true;
}
function redact(value) {
  return redactVerificationOutput(String(value ?? 'operation failed')).slice(0, 1000);
}
function emit(io, stream, value) { stream.write(`${JSON.stringify(value)}\n`); }
export function exitCodeForAction(action) {
  if (action === 'ready-for-human' || action === 'ready') return PR_BABYSITTER_EXIT_CODES.ready;
  if (action === 'wait') return PR_BABYSITTER_EXIT_CODES.wait;
  if (action === 'escalate' || action === 'escalated') return PR_BABYSITTER_EXIT_CODES.escalated;
  if (action === 'refused') return PR_BABYSITTER_EXIT_CODES.refused;
  if (action === 'request-repair' || action === 'retry-check') return PR_BABYSITTER_EXIT_CODES.wait;
  return PR_BABYSITTER_EXIT_CODES.infrastructure;
}
const exitFor = exitCodeForAction;
function tuple(snapshot) { return { baseSha: snapshot.baseSha, headSha: snapshot.headSha, mergeSha: snapshot.mergeSha }; }
function sameTuple(a, b) { return a.baseSha === b.baseSha && a.headSha === b.headSha && a.mergeSha === b.mergeSha; }
async function collectCurrentPr(pr, repository, prNumber) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const evidence = await pr.collect(prNumber);
    if (!isRecord(evidence)) throw new Error('invalid_pr_snapshot');
    const rawSnapshot = evidence.prSnapshot;
    const snapshot = normalizePrSnapshot(Object.fromEntries(['repository', 'number', 'state', 'draft', 'baseRef', 'baseSha',
      'headRef', 'headSha', 'mergeSha', 'headRepository', 'updatedAt'].map((key) => [key, rawSnapshot[key]])));
    if (snapshot.number !== prNumber || snapshot.repository !== repository) throw new Error('invalid_pr_snapshot');
    const fresh = await pr.refresh(prNumber);
    if (fresh?.number === prNumber && fresh.repository?.toLowerCase() === repository && sameTuple(tuple(snapshot), tuple(fresh))) {
      return {
        ...evidence,
        prSnapshot: snapshot,
        requiredCheckSnapshot: normalizeRequiredCheckSnapshot({
          baseRef: evidence.requiredCheckSnapshot.baseRef,
          policyFingerprint: evidence.requiredCheckSnapshot.policyFingerprint,
          requiredChecks: evidence.requiredCheckSnapshot.requiredChecks ?? evidence.requiredCheckSnapshot.requiredCheckKeys.map((key) => {
            const separator = key.lastIndexOf('|');
            const context = key.slice(0, separator); const app = key.slice(separator + 1);
            if (app === 'legacy') return { context, appId: null };
            const match = /^app:([1-9][0-9]*)$/.exec(app);
            if (!match) throw new TypeError('required-check identity is invalid');
            return { context, appId: Number(match[1]) };
          }),
          requiredWorkflows: evidence.requiredCheckSnapshot.requiredWorkflows.map(({ key: _key, ...rule }) => rule),
          collectionStatus: evidence.requiredCheckSnapshot.collectionStatus,
        }),
        checkObservations: evidence.checkObservations.map(normalizeCheckObservation),
      };
    }
  }
  throw Object.assign(new Error('PR tuple changed during evidence collection'), { code: 'stale_pr_tuple' });
}

function recordCurrentObservations(state, prSnapshot, observations) {
  let next = reconcilePrBabysitterState(validatePrBabysitterState(state), prSnapshot);
  for (const observation of observations) {
    next = recordCheckObservation(next, observation);
    const failure = buildFailureEvidence(observation, {
      currentHeadSha: prSnapshot.headSha, currentBaseSha: prSnapshot.baseSha, currentMergeSha: prSnapshot.mergeSha,
    });
    if (failure?.status !== 'actionable') continue;
    classifyFailure(failure.evidence);
    next = recordActionableFailure(next, {
      headSha: observation.headSha, baseSha: observation.baseSha, mergeSha: observation.mergeSha,
      attemptKey: observation.attemptKey, failureFingerprint: observation.failureFingerprint,
    });
  }
  return next;
}

function requiredWorkflowKey(identity) {
  return `workflow|repo:${identity.repositoryId}|path:${encodeURIComponent(identity.path)}|ref:${encodeURIComponent(identity.ref)}|sha:${identity.sha}`;
}
function validateActionTarget(target, snapshot, observations, requiredCheckSnapshot, repositoryId, prNumber) {
  if (!isRecord(target) || target.repositoryId !== repositoryId || target.prNumber !== prNumber
      || target.baseSha !== snapshot.baseSha || target.headSha !== snapshot.headSha || target.mergeSha !== snapshot.mergeSha
      || !SHA.test(target.testedSha) || (target.testedSha !== snapshot.headSha && target.testedSha !== snapshot.mergeSha)
      || !isRecord(target.requiredIdentity) || target.requiredIdentity.type !== 'workflow'
      || target.requiredIdentity.repositoryId !== repositoryId || typeof target.requiredIdentity.path !== 'string'
      || typeof target.requiredIdentity.ref !== 'string' || !SHA.test(target.requiredIdentity.sha)
      || !Number.isSafeInteger(target.workflowId) || !Number.isSafeInteger(target.runId)
      || !Number.isSafeInteger(target.runAttempt) || !Array.isArray(target.failedJobIds)
      || typeof target.failureAttemptKey !== 'string') return false;
  const workflowKey = requiredWorkflowKey(target.requiredIdentity);
  const workflowIsRequired = requiredCheckSnapshot.requiredWorkflows.some((identity) => requiredWorkflowKey(identity) === workflowKey);
  return workflowIsRequired && observations.some((observation) => observation.status === 'completed' && observation.conclusion === 'failure'
    && observation.requiredWorkflowKey === workflowKey && observation.attemptKey === target.failureAttemptKey
    && observation.testedSha === target.testedSha && observation.headSha === snapshot.headSha
    && observation.baseSha === snapshot.baseSha && observation.mergeSha === snapshot.mergeSha);
}

function actionTargetScope(target) {
  return {
    workflowId: target.workflowId, runId: target.runId, runAttempt: target.runAttempt,
    failedJobIds: target.failedJobIds, requiredIdentity: target.requiredIdentity,
  };
}

export async function runPrBabysitterCli({ argv, trustedHost, io = {} }) {
  const output = { stdout: io.stdout ?? process.stdout, stderr: io.stderr ?? process.stderr };
  let args;
  try { args = parsePrBabysitterArguments(argv); }
  catch (error) { emit(output, output.stderr, { status: 'refused', reasonCode: 'invalid_arguments', message: redact(error.message) }); return { exitCode: PR_BABYSITTER_EXIT_CODES.refused }; }
  if (args.dryRun) {
    emit(output, output.stdout, { status: 'dry-run', command: args.command, repository: args.repository, prNumber: args.prNumber });
    return { exitCode: 0 };
  }
  if (!validHost(trustedHost) || trustedHost.config.repository.toLowerCase() !== args.repository) {
    emit(output, output.stderr, { status: 'refused', reasonCode: 'trusted_host_unavailable' });
    return { exitCode: PR_BABYSITTER_EXIT_CODES.refused };
  }
  try {
    const host = trustedHost; const { pr, state, auth, repair, writer } = host.adapters;
    if (!validHostFor(host, args.command)) {
      emit(output, output.stderr, { status: 'refused', reasonCode: 'command_adapter_unavailable' });
      return { exitCode: PR_BABYSITTER_EXIT_CODES.refused };
    }
    const collected = await collectCurrentPr(pr, args.repository, args.prNumber);
    const initialTuple = tuple(collected.prSnapshot);
    let prState = recordCurrentObservations(await state.load(args.repository, args.prNumber, collected.prSnapshot), collected.prSnapshot, collected.checkObservations);
    await state.save(args.repository, args.prNumber, prState, null);
    const decision = decidePrAction({ ...collected, prState, policy: host.config.policy });
    if (args.command === 'inspect') {
      emit(output, output.stdout, { status: 'observed', pr: collected.prSnapshot, decision }); return { exitCode: exitFor(decision.action), decision };
    }
    if (args.command === 'decide') {
      await state.save(args.repository, args.prNumber, prState, decision);
      await host.adapters.telemetry({ repository: args.repository, prNumber: args.prNumber, headSha: initialTuple.headSha, action: decision.action, reasonCode: decision.reasonCode });
      emit(output, output.stdout, { status: decision.action, decision }); return { exitCode: exitFor(decision.action), decision };
    }
    if (args.command === 'escalation') {
      if (decision.action !== 'escalate') return { exitCode: exitFor(decision.action), decision };
      const packet = buildEscalationPacket({ prSnapshot: collected.prSnapshot, decision, prState, checkObservations: collected.checkObservations,
        protectedPaths: collected.protectedPaths ?? [] });
      emit(output, output.stdout, { status: 'escalated', packet }); return { exitCode: 2, packet };
    }
    if (args.command === 'begin-repair') {
      if (decision.action !== 'request-repair') { emit(output, output.stderr, { status: decision.action, decision }); return { exitCode: exitFor(decision.action) }; }
      const budget = await host.adapters.budget('repair:workspace');
      if (budget?.stop) return { exitCode: 3 };
      prState = recordRepairRequest(prState, { reasonCode: decision.reasonCode,
        ...(decision.failureFingerprints[0] ? { failureFingerprint: decision.failureFingerprints[0] } : {}) });
      await state.save(args.repository, args.prNumber, prState, decision);
      const packet = buildRepairPacket({ prSnapshot: collected.prSnapshot, decision, prState, checkObservations: collected.checkObservations,
        affectedPaths: collected.affectedPaths, policy: host.config.policy });
      emit(output, output.stdout, { status: 'repair-requested', packet }); return { exitCode: 1, packet };
    }
    if (args.command === 'rerun-flaky') {
      if (io.isTTY !== true) return { exitCode: PR_BABYSITTER_EXIT_CODES.refused };
      if (decision.action !== 'retry-check') return { exitCode: exitFor(decision.action), decision };
      const budget = await host.adapters.budget('actions:rerun');
      if (budget?.stop) return { exitCode: PR_BABYSITTER_EXIT_CODES.refused };
      await auth.authenticateApprover();
      const target = await host.adapters.actions.getTarget({ decision, observations: collected.checkObservations, prSnapshot: collected.prSnapshot });
      if (!validateActionTarget(target, collected.prSnapshot, collected.checkObservations, collected.requiredCheckSnapshot, host.config.repositoryId, args.prNumber)) {
        return { exitCode: PR_BABYSITTER_EXIT_CODES.refused };
      }
      const scope = { ...tuple(collected.prSnapshot), repositoryId: host.config.repositoryId, prNumber: args.prNumber,
        capability: 'actions:rerun', paths: [target.requiredIdentity.path], testedSha: target.testedSha,
        actionTarget: actionTargetScope(target) };
      const approval = await auth.requestApproval(scope);
      const fresh = await pr.refresh(args.prNumber);
      if (!fresh || fresh.state !== 'open' || !sameTuple(initialTuple, tuple(fresh))) return { exitCode: PR_BABYSITTER_EXIT_CODES.refused };
      const result = await host.adapters.actions.rerunFailedJobs({ host: host.adapters.actions.host, decision, target, approval });
      if (result?.status === 'submitted') {
        for (const checkId of decision.checkIds) prState = recordFlakyRetry(prState, checkId);
        await state.save(args.repository, args.prNumber, prState, decision);
      }
      emit(output, output.stdout, {
        status: result?.status === 'submitted' ? 'wait' : result?.status ?? 'refused',
        reasonCode: result?.reasonCode ?? null,
        ...(typeof result?.actionAttemptKey === 'string' ? { actionAttemptKey: result.actionAttemptKey } : {}),
      });
      return { exitCode: result?.status === 'submitted' ? PR_BABYSITTER_EXIT_CODES.wait : exitFor(result?.status) };
    }
    if (args.command === 'validate-repair') {
      if (io.isTTY !== true || !auth.authenticateApprover) return { exitCode: 3 };
      if (decision.action !== 'request-repair') return { exitCode: exitFor(decision.action), decision };
      const repairBudget = await host.adapters.budget('repair:workspace');
      if (repairBudget?.stop) return { exitCode: PR_BABYSITTER_EXIT_CODES.refused };
      await auth.authenticateApprover();
      const freshBeforeRepair = await pr.refresh(args.prNumber);
      if (!sameTuple(initialTuple, tuple(freshBeforeRepair)) || freshBeforeRepair.state !== 'open') return { exitCode: 3 };
      const proposal = await repair.readProposal(args.patch);
      // The trusted adapter is bound to validateRepairProposal(session, proposal, context).
      // That existing API consumes exact repair:workspace approval before applying or committing.
      const outcome = await repair.validateRepairProposal(repair.session, proposal, {});
      if (outcome.status !== 'verified' || !outcome.changedPaths?.length) return { exitCode: 3 };
      const verifierBudget = await host.adapters.budget('verify:full');
      if (verifierBudget?.stop) return { exitCode: 3 };
      const fullPlan = await host.adapters.verifier.buildFullPlan(outcome.changedPaths);
      if (fullPlan?.mode !== 'full') return { exitCode: PR_BABYSITTER_EXIT_CODES.infrastructure };
      const verified = await host.adapters.verifier.run(fullPlan);
      if (!verified.passed || !verified.commands?.length || !Array.isArray(verified.requiredExternalChecks)
          || verified.commands.some((result) => result.exitCode !== 0 || result.signal !== null || result.spawnErrorCode !== null)
          || !verified.revisionStable || !verified.workspaceStable || !SHA.test(verified.verifiedRevision)
          || verified.verifiedRevision !== verified.currentRevision
          || !/^[a-f0-9]{64}$/i.test(verified.verifiedWorkspaceFingerprint ?? '')
          || verified.verifiedWorkspaceFingerprint !== verified.currentWorkspaceFingerprint) return { exitCode: 4 };
      const finalDiff = await writer.readFinalDiff(outcome.changedPaths);
      if (typeof finalDiff !== 'string' || Buffer.byteLength(finalDiff, 'utf8') > 256 * 1024) return { exitCode: 3 };
      const diffHash = createHash('sha256').update(finalDiff).digest('hex');
      output.stdout.write(`${finalDiff}\nSHA-256 ${diffHash}\n`);
      const scope = { ...tuple(collected.prSnapshot), repositoryId: host.config.repositoryId, prNumber: args.prNumber, capability: 'contents:write', paths: outcome.changedPaths };
      const approval = await auth.requestApproval(scope);
      auth.consumeApproval(approval, scope);
      const token = await auth.getInstallationToken('contents:write');
      const [fresh, targetCommitSha, fingerprint, currentDiff, budget] = await Promise.all([
        pr.refresh(args.prNumber), writer.readHeadSha(), writer.readWorkspaceFingerprint(), writer.readFinalDiff(outcome.changedPaths),
        host.adapters.budget('contents:write', { diff: { changedFiles: outcome.changedPaths.length } }),
      ]);
      if (!sameTuple(initialTuple, tuple(fresh)) || fresh.state !== 'open' || targetCommitSha !== verified.currentRevision
          || !/^[a-f0-9]{64}$/i.test(fingerprint ?? '') || fingerprint !== verified.verifiedWorkspaceFingerprint
          || createHash('sha256').update(currentDiff).digest('hex') !== diffHash || budget?.stop) return { exitCode: 3 };
      const pushed = await writer.push({ token, targetCommitSha, expectedHeadSha: initialTuple.headSha, diffHash, paths: outcome.changedPaths });
      if (pushed.status !== 'pushed' || pushed.commitSha !== targetCommitSha) return { exitCode: 2 };
      const after = await collectCurrentPr(pr, args.repository, args.prNumber);
      if (!after || after.prSnapshot?.repository?.toLowerCase() !== args.repository || after.prSnapshot.number !== args.prNumber
          || after.prSnapshot.headSha !== targetCommitSha) return { exitCode: 3 };
      const postPushState = recordCurrentObservations(await state.load(args.repository, args.prNumber, after.prSnapshot), after.prSnapshot, after.checkObservations);
      const postPushDecision = decidePrAction({ ...after, prState: postPushState, policy: host.config.policy });
      await state.save(args.repository, args.prNumber, postPushState, postPushDecision);
      const status = postPushDecision.action === 'ready-for-human' ? 'ready-for-human' : postPushDecision.action === 'escalate' ? 'escalate' : 'wait';
      emit(output, output.stdout, { status, commitSha: targetCommitSha, decision: postPushDecision });
      return { exitCode: exitFor(status), decision: postPushDecision };
    }
    return { exitCode: 3 };
  } catch (error) {
    emit(output, output.stderr, { status: 'infrastructure-error', reasonCode: /^[a-z0-9_]+$/.test(error?.code ?? '') ? error.code : 'adapter_failure', message: redact(error?.message) });
    return { exitCode: 4 };
  }
}
