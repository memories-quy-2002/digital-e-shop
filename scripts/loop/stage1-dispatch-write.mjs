import { createHash } from 'node:crypto';

const API_ORIGIN = 'https://api.github.com';
const API_VERSION = '2026-03-10';
const contexts = new WeakMap();

function refuse(reasonCode) {
  return Object.freeze({ status: 'escalate', reasonCode });
}

function sameTarget(a, b) {
  return ['repository', 'repositoryId', 'prNumber', 'baseSha', 'headSha', 'mergeSha', 'testedSha', 'context', 'appId',
    'checkRunId', 'policyFingerprint', 'workflowId', 'workflowPath', 'workflowRef', 'workflowSourceSha', 'requestId', 'actorId', 'actorLogin']
    .every((key) => a?.[key] === b?.[key]);
}

export function createStage1DispatchHost(options) {
  if (!options || options.repository !== 'memories-quy-2002/digital-e-shop'
    || !Number.isSafeInteger(options.repositoryId) || options.repositoryId < 1
    || !Number.isSafeInteger(options.workflowId) || options.workflowId < 1
    || options.workflowPath !== '.github/workflows/stage1-trusted-retry.yml'
    || typeof options.getReadToken !== 'function' || typeof options.getWriteToken !== 'function'
    || typeof options.revalidate !== 'function' || typeof options.consumeApproval !== 'function'
    || typeof options.reserveBudget !== 'function' || typeof options.fetchImpl !== 'function') {
    throw Object.assign(new Error('stage1_dispatch_host_invalid'), { reasonCode: 'stage1_dispatch_host_invalid' });
  }
  const host = Object.freeze(Object.create(null));
  contexts.set(host, Object.freeze({ ...options }));
  return host;
}

export async function dispatchStage1Retry(input) {
  if (!input || Object.keys(input).some((key) => !['host', 'decision', 'target', 'approval'].includes(key))) return refuse('invalid_request');
  const host = contexts.get(input.host);
  const target = input.target;
  if (!host) return refuse('invalid_host_context');
  if (input.decision?.action !== 'retry-check' || input.decision.reasonCode !== 'same_revision_pass_then_fail') return refuse('retry_decision_required');
  if (target?.repository !== host.repository || target.repositoryId !== host.repositoryId || target.workflowId !== host.workflowId
    || target.workflowPath !== host.workflowPath || target.workflowRef !== 'main' || target.workflowSourceSha !== target.baseSha
    || !['client', 'server'].includes(target.context) || target.appId !== 15368 || !Number.isSafeInteger(target.checkRunId)
    || !/^[a-f0-9]{32}$/.test(target.requestId ?? '') || ![target.headSha, target.mergeSha].includes(target.testedSha)
    || !Number.isSafeInteger(target.actorId) || target.actorId < 1 || target.actorLogin !== 'digital-e-loop-runner[bot]') return refuse('invalid_target');
  try {
    const current = await host.revalidate(target, await host.getReadToken());
    if (!sameTarget(target, current)) return refuse('stage1_target_stale');
    await host.consumeApproval(input.approval, target);
  } catch {
    return refuse('approval_or_revalidation_failed');
  }
  let token;
  try { token = await host.getWriteToken(); } catch { return refuse('write_token_unavailable'); }
  if (typeof token !== 'string' || token.length === 0 || token.length > 8192 || /[\x00-\x20\x7f]/.test(token)) return refuse('write_token_unavailable');
  const attemptKey = createHash('sha256').update(JSON.stringify(target)).digest('hex');
  try {
    const reservation = await host.reserveBudget(attemptKey);
    if (reservation !== true) return refuse('ci_budget_unavailable');
  } catch {
    return refuse('ci_budget_unavailable');
  }
  try {
    const url = new URL(`/repos/${target.repository}/actions/workflows/${target.workflowId}/dispatches`, API_ORIGIN);
    const body = {
      ref: 'main',
      inputs: {
        request_id: target.requestId,
        pr_number: String(target.prNumber),
        base_sha: target.baseSha,
        head_sha: target.headSha,
        merge_sha: target.mergeSha ?? '',
        tested_sha: target.testedSha,
        context: target.context,
        app_id: String(target.appId),
        check_run_id: String(target.checkRunId),
        policy_fingerprint: target.policyFingerprint,
      },
      return_run_details: true,
    };
    if (url.origin !== API_ORIGIN || url.pathname !== `/repos/${target.repository}/actions/workflows/${host.workflowId}/dispatches`) return refuse('dispatch_route_rejected');
    const response = await host.fetchImpl(url, {
      method: 'POST', redirect: 'manual',
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-GitHub-Api-Version': API_VERSION },
      body: JSON.stringify(body),
    });
    if (response.status >= 300 && response.status < 400) return refuse('dispatch_outcome_uncertain');
    if (response.status !== 200) return refuse(response.status >= 200 && response.status < 300 ? 'dispatch_run_id_missing' : 'dispatch_rejected');
    const result = await response.json();
    if (!result || !Number.isSafeInteger(result.workflow_run_id) || result.workflow_run_id < 1) return refuse('dispatch_run_id_missing');
    return Object.freeze({ status: 'submitted', workflowRunId: result.workflow_run_id, requestId: target.requestId, attemptKey });
  } catch {
    return refuse('dispatch_outcome_uncertain');
  }
}
