import { validateTaskRecord } from './contracts.mjs';

const REVISION = /^[a-f0-9]{40,64}$/i;
const MAX_ISSUE_BODY_BYTES = 64 * 1024;

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function exactPolicyShape(policy) {
  return policy && typeof policy === 'object' && !Array.isArray(policy)
    && Object.isFrozen(policy) && policy.schemaVersion === 1
    && typeof policy.enabled === 'boolean'
    && Array.isArray(policy.ownerActorIds) && Object.isFrozen(policy.ownerActorIds)
    && policy.ownerActorIds.length > 0
    && Array.isArray(policy.eligibleActors) && Object.isFrozen(policy.eligibleActors)
    && policy.eligibleActors.length > 0
    && policy.ownerActorIds.every((id) => positiveInteger(id) && policy.eligibleActors.includes(id))
    && policy.eligibleActors.every(positiveInteger)
    && new Set(policy.eligibleActors).size === policy.eligibleActors.length
    && typeof policy.optInLabel === 'string' && /^[a-z0-9][a-z0-9:_-]{0,49}$/.test(policy.optInLabel)
    && ['eligibleCategories', 'eligiblePaths', 'eligibleRisks', 'capabilities']
      .every((key) => Array.isArray(policy[key]) && Object.isFrozen(policy[key])
        && policy[key].every((value) => typeof value === 'string')
        && new Set(policy[key]).size === policy[key].length)
    && Object.isFrozen(policy.runner) && policy.runner.provider === 'openai'
    && policy.runner.model === 'GPT-6-Luna'
    && Object.isFrozen(policy.budgets)
    && ['maxModelCalls', 'maxDeliveryGenerations', 'taskConcurrency', 'maxHostedWorkflowRuns']
      .every((key) => positiveInteger(policy.budgets[key]))
    && typeof policy.trustedRevision === 'string' && REVISION.test(policy.trustedRevision);
}

function canonicalTime(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

async function sha256(text) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Apply the authenticated Issue envelope to a canonical, host-loaded policy.
 * Raw Issue text is accepted only to compute its digest and is never returned.
 */
export async function authorizeIssueTask(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
      || !positiveInteger(input.repositoryId) || !positiveInteger(input.configuredRepositoryId)
      || !positiveInteger(input.issueNumber)
      || !positiveInteger(input.actorId) || typeof input.action !== 'string'
      || !Array.isArray(input.labels) || input.labels.some((label) => typeof label !== 'string')
      || typeof input.body !== 'string' || new TextEncoder().encode(input.body).byteLength > MAX_ISSUE_BODY_BYTES
      || typeof input.isPullRequest !== 'boolean' || typeof input.sourceRevision !== 'string'
      || !REVISION.test(input.sourceRevision) || !canonicalTime(input.now) || !canonicalTime(input.deadline)
      || Date.parse(input.deadline) <= Date.parse(input.now)
      || Date.parse(input.deadline) - Date.parse(input.now) > 24 * 60 * 60 * 1000) {
    throw new TypeError('issue task input is invalid');
  }
  const policy = input.policy;
  if (!exactPolicyShape(policy)) throw new TypeError('trusted canonical autonomy policy is required');
  if (policy.trustedRevision.toLowerCase() !== input.sourceRevision.toLowerCase()) {
    return { status: 'ignored', reasonCode: 'policy_revision_mismatch' };
  }
  if (!policy.enabled) return { status: 'ignored', reasonCode: 'policy_disabled' };
  if (input.repositoryId !== input.configuredRepositoryId) return { status: 'ignored', reasonCode: 'wrong_repository' };
  if (input.isPullRequest) return { status: 'ignored', reasonCode: 'pull_request_issue' };
  if (input.action !== 'opened' && input.action !== 'labeled') return { status: 'ignored', reasonCode: 'unsupported_action' };
  if (!policy.eligibleActors.includes(input.actorId)) return { status: 'ignored', reasonCode: 'actor_not_eligible' };
  if (!input.labels.includes(policy.optInLabel)) return { status: 'ignored', reasonCode: 'opt_in_missing' };
  if (input.body.trim().length === 0) throw new TypeError('issue task body is empty');

  const taskId = `repo-${input.repositoryId}-issue-${input.issueNumber}-g1`;
  const record = validateTaskRecord({
    schemaVersion: 2,
    key: { repositoryId: input.repositoryId, issueNumber: input.issueNumber, generation: 1 },
    taskId,
    requestDigest: await sha256(input.body),
    acceptanceIds: [],
    sourceRevision: input.sourceRevision,
    policyRevision: policy.trustedRevision,
    state: 'queued',
    version: 1,
    attempt: 0,
    epoch: 0,
    deadline: input.deadline,
    budgets: { modelCalls: 0, repairs: 0, deliveries: 0, lastModelTokenUsed: null },
    links: { loopStateTaskId: taskId, pr: null },
    outcomeReason: null,
    confirmedMergeSha: null,
  });
  return { status: 'authorized', record };
}
