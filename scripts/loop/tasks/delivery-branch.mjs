import { classifyRisk, normalizeRepoPath } from '../classify-risk.mjs';

const SHA = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i;

export class DeliveryPlanError extends Error {
  constructor(code) { super(code); this.name = new.target.name; this.code = code; }
}

function fail(code) { throw new DeliveryPlanError(code); }

function safeBranchPart(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,119}$/.test(value)
    && !value.includes('..') && !value.endsWith('/') && !value.endsWith('.lock');
}

function matchesPattern(pattern, value) {
  const patternSegments = pattern.split('/');
  const valueSegments = value.split('/');
  const memo = Array.from({ length: patternSegments.length + 1 }, () => []);
  function visit(i, j) {
    if (memo[i][j] !== undefined) return memo[i][j];
    let matched;
    if (i === patternSegments.length) matched = j === valueSegments.length;
    else if (patternSegments[i] === '**') matched = visit(i + 1, j) || (j < valueSegments.length && visit(i, j + 1));
    else if (j >= valueSegments.length) matched = false;
    else {
      const expression = '^' + patternSegments[i].split('*').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*') + '$';
      matched = new RegExp(expression).test(valueSegments[j]) && visit(i + 1, j + 1);
    }
    memo[i][j] = matched;
    return matched;
  }
  return visit(0, 0);
}

/** Derive delivery identity from trusted task metadata and the host-observed checkout snapshot. */
export function deriveIssueDeliveryPlan({ task, policy, loopPolicy, baseSha, changedPaths }) {
  if (!task || typeof task !== 'object' || task.schemaVersion !== 2
      || !Number.isSafeInteger(task.key?.repositoryId) || task.key.repositoryId < 1
      || !Number.isSafeInteger(task.key?.issueNumber) || task.key.issueNumber < 1
      || !Number.isSafeInteger(task.key?.generation) || task.key.generation < 1
      || !/^[a-f0-9]{64}$/.test(task.requestDigest)
      || !SHA.test(task.sourceRevision) || !SHA.test(task.policyRevision)) fail('task_identity_invalid');
  if (!policy || !Object.isFrozen(policy) || policy.schemaVersion !== 1
      || policy.trustedRevision?.toLowerCase() !== task.policyRevision.toLowerCase()) fail('canonical_policy_invalid');
  if (!policy.enabled) fail('policy_disabled');
  if (!policy.capabilities.includes('open_draft_pr')) fail('draft_pr_capability_disabled');
  if (task.sourceRevision.toLowerCase() !== baseSha.toLowerCase() || !SHA.test(baseSha)) fail('stale_local_base');
  if (!Array.isArray(changedPaths) || changedPaths.length < 1 || changedPaths.length > 100) fail('changed_paths_invalid');
  if (!Number.isSafeInteger(loopPolicy?.stopConditions?.maxChangedFiles)
      || loopPolicy.stopConditions.maxChangedFiles < 1
      || changedPaths.length > loopPolicy.stopConditions.maxChangedFiles) fail('changed_file_budget_exhausted');

  let normalized;
  try { normalized = [...new Set(changedPaths.map(normalizeRepoPath))].sort(); }
  catch { fail('changed_paths_invalid'); }
  if (normalized.length !== changedPaths.length) fail('changed_paths_duplicate');
  if (normalized.some((candidate) => !policy.eligiblePaths.some((pattern) => matchesPattern(pattern, candidate)))) fail('path_not_eligible');
  const categories = new Set(normalized.map((candidate) => (
    candidate === 'docs' || candidate.startsWith('docs/') ? 'documentation'
      : candidate === 'client' || candidate.startsWith('client/') ? 'frontend'
        : null
  )));
  if (categories.has(null) || [...categories].some((category) => !policy.eligibleCategories.includes(category))) fail('category_not_eligible');

  let risk;
  try { risk = classifyRisk({ paths: normalized }, loopPolicy); }
  catch { fail('risk_policy_invalid'); }
  if (!policy.eligibleRisks.includes(risk.level) || risk.level === 'critical' || risk.level === 'high') {
    fail('risk_not_eligible');
  }

  const branch = `codex/issue-${task.key.issueNumber}-g${task.key.generation}`;
  if (!safeBranchPart(branch)) fail('branch_name_invalid');
  return Object.freeze({
    taskId: task.taskId,
    repositoryId: task.key.repositoryId,
    issueNumber: task.key.issueNumber,
    generation: task.key.generation,
    baseBranch: 'main',
    baseSha: baseSha.toLowerCase(),
    branch,
    paths: Object.freeze(normalized),
    categories: Object.freeze([...categories].sort()),
    risk: risk.level,
  });
}
