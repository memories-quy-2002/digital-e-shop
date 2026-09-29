import { createHash } from 'node:crypto';

import { decidePrAction } from './pr-babysitter.mjs';
import { buildEscalationPacket, buildRepairPacket } from './pr-packets.mjs';
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
function redact(value) {
  return redactVerificationOutput(String(value ?? 'operation failed')).slice(0, 1000);
}
function emit(io, stream, value) { stream.write(`${JSON.stringify(value)}\n`); }
function exitFor(action) {
  if (action === 'ready-for-human' || action === 'ready') return PR_BABYSITTER_EXIT_CODES.ready;
  if (action === 'wait') return PR_BABYSITTER_EXIT_CODES.wait;
  if (action === 'escalate' || action === 'escalated') return PR_BABYSITTER_EXIT_CODES.escalated;
  if (action === 'refused') return PR_BABYSITTER_EXIT_CODES.refused;
  return PR_BABYSITTER_EXIT_CODES.infrastructure;
}
function tuple(snapshot) { return { baseSha: snapshot.baseSha, headSha: snapshot.headSha, mergeSha: snapshot.mergeSha }; }
function sameTuple(a, b) { return a.baseSha === b.baseSha && a.headSha === b.headSha && a.mergeSha === b.mergeSha; }
async function collectCurrentPr(pr, repository, prNumber) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const evidence = await pr.collect(prNumber);
    const snapshot = evidence?.prSnapshot;
    if (!snapshot || snapshot.number !== prNumber || snapshot.repository?.toLowerCase() !== repository
        || !SHA.test(snapshot.baseSha) || !SHA.test(snapshot.headSha)
        || (snapshot.mergeSha !== null && !SHA.test(snapshot.mergeSha))) throw new Error('invalid_pr_snapshot');
    const fresh = await pr.refresh(prNumber);
    if (fresh?.number === prNumber && fresh.repository?.toLowerCase() === repository && sameTuple(tuple(snapshot), tuple(fresh))) {
      return evidence;
    }
  }
  throw Object.assign(new Error('PR tuple changed during evidence collection'), { code: 'stale_pr_tuple' });
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
    return { exitCode: PR_BABYSITTER_EXIT_CODES.infrastructure };
  }
  try {
    const host = trustedHost; const { pr, state, auth, repair, writer } = host.adapters;
    const collected = await collectCurrentPr(pr, args.repository, args.prNumber);
    const initialTuple = tuple(collected.prSnapshot);
    const prState = await state.load(args.repository, args.prNumber, collected.prSnapshot);
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
      const packet = buildRepairPacket({ prSnapshot: collected.prSnapshot, decision, prState, checkObservations: collected.checkObservations,
        affectedPaths: collected.affectedPaths, policy: host.config.policy });
      emit(output, output.stdout, { status: 'repair-requested', packet }); return { exitCode: 1, packet };
    }
    if (args.command === 'rerun-flaky') {
      if (io.isTTY !== true || !auth.authenticateApprover || !auth.requestApproval || !auth.consumeApproval) return { exitCode: 3 };
      if (decision.action !== 'retry-check') return { exitCode: exitFor(decision.action), decision };
      await host.adapters.budget('actions:rerun');
      const identity = await auth.authenticateApprover();
      const approval = await auth.requestApproval({ ...tuple(collected.prSnapshot), repositoryId: host.config.repositoryId, prNumber: args.prNumber, capability: 'actions:rerun', paths: collected.failedPaths });
      const fresh = await pr.refresh(args.prNumber);
      if (!sameTuple(initialTuple, tuple(fresh))) return { exitCode: 3 };
      auth.consumeApproval(approval, { ...tuple(fresh), repositoryId: host.config.repositoryId, prNumber: args.prNumber, capability: 'actions:rerun', paths: collected.failedPaths });
      const token = await auth.getInstallationToken('actions:rerun');
      const result = await host.adapters.actions.rerun({ token, snapshot: fresh, decision, identity });
      emit(output, output.stdout, { status: result.status === 'submitted' ? 'wait' : result.status ?? 'wait', result });
      return { exitCode: result.status === 'submitted' ? PR_BABYSITTER_EXIT_CODES.wait : exitFor(result.status) };
    }
    if (args.command === 'validate-repair') {
      if (io.isTTY !== true || !auth.authenticateApprover) return { exitCode: 3 };
      await host.adapters.budget('repair:workspace');
      await auth.authenticateApprover();
      const freshBeforeRepair = await pr.refresh(args.prNumber);
      if (!sameTuple(initialTuple, tuple(freshBeforeRepair)) || freshBeforeRepair.state !== 'open') return { exitCode: 3 };
      const outcome = await repair.validate(args.patch, collected);
      if (outcome.status !== 'verified' || !outcome.changedPaths?.length) return { exitCode: 3 };
      const verifierBudget = await host.adapters.budget('verify:full');
      if (verifierBudget?.stop) return { exitCode: 3 };
      const fullPlan = await host.adapters.verifier.buildFullPlan(outcome.changedPaths);
      const verified = await host.adapters.verifier.run(fullPlan);
      if (!verified.passed || !verified.commands?.length || verified.commands.some((result) => result.exitCode !== 0 || result.signal !== null || result.spawnErrorCode !== null)
          || !verified.revisionStable || !verified.workspaceStable || !SHA.test(verified.verifiedRevision)
          || verified.verifiedRevision !== verified.currentRevision) return { exitCode: 4 };
      const finalDiff = await writer.readFinalDiff(outcome.changedPaths);
      if (typeof finalDiff !== 'string' || finalDiff.length > 256 * 1024) return { exitCode: 3 };
      const diffHash = createHash('sha256').update(finalDiff).digest('hex');
      output.stdout.write(`${finalDiff}\nSHA-256 ${diffHash}\n`);
      const scope = { ...tuple(collected.prSnapshot), repositoryId: host.config.repositoryId, prNumber: args.prNumber, capability: 'contents:write', paths: outcome.changedPaths };
      const approval = await auth.requestApproval(scope);
      const [fresh, head, fingerprint, currentDiff, budget] = await Promise.all([
        pr.refresh(args.prNumber), writer.readHeadSha(), writer.readWorkspaceFingerprint(), writer.readFinalDiff(outcome.changedPaths), host.adapters.budget('contents:write', { diff: { changedFiles: outcome.changedPaths.length } }),
      ]);
      if (!sameTuple(initialTuple, tuple(fresh)) || head !== verified.currentRevision || fingerprint !== verified.currentWorkspaceFingerprint
          || createHash('sha256').update(currentDiff).digest('hex') !== diffHash || budget?.stop) return { exitCode: 3 };
      auth.consumeApproval(approval, scope);
      const token = await auth.getInstallationToken('contents:write');
      const pushed = await writer.push({ token, targetCommitSha: head, expectedHeadSha: head, diffHash, paths: outcome.changedPaths });
      if (pushed.status !== 'pushed' || pushed.commitSha !== head) return { exitCode: 2 };
      const after = await collectCurrentPr(pr, args.repository, args.prNumber);
      if (!after || after.prSnapshot?.repository?.toLowerCase() !== args.repository || after.prSnapshot.number !== args.prNumber
          || after.prSnapshot.headSha !== head) return { exitCode: 3 };
      const postPushState = await state.load(args.repository, args.prNumber, after.prSnapshot);
      const postPushDecision = decidePrAction({ ...after, prState: postPushState, policy: host.config.policy });
      await state.save(args.repository, args.prNumber, postPushState, postPushDecision);
      const status = postPushDecision.action === 'ready-for-human' ? 'ready-for-human' : postPushDecision.action === 'escalate' ? 'escalate' : 'wait';
      emit(output, output.stdout, { status, commitSha: head, decision: postPushDecision });
      return { exitCode: exitFor(status), decision: postPushDecision };
    }
    return { exitCode: 3 };
  } catch (error) {
    emit(output, output.stderr, { status: 'infrastructure-error', reasonCode: /^[a-z0-9_]+$/.test(error?.code ?? '') ? error.code : 'adapter_failure', message: redact(error?.message) });
    return { exitCode: 4 };
  }
}
