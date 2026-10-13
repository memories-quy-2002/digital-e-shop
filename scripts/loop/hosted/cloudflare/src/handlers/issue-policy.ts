import type { GitHubApiClient } from '../github/api';

const REVISION = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i;
const POLICY_KEYS = [
  'schemaVersion', 'enabled', 'autoMergeEnabled', 'ownerActorIds', 'eligibleActors', 'optInLabel',
  'eligibleCategories', 'eligiblePaths', 'eligibleRisks', 'runner', 'capabilities', 'budgets',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function positiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function decodePolicyFile(value: unknown): unknown {
  if (!isRecord(value) || value.encoding !== 'base64' || typeof value.content !== 'string') {
    throw new Error('canonical_autonomy_policy_unavailable');
  }
  const content = value.content.replace(/[\r\n\s]/g, '');
  if (content.length > 128 * 1024 || content.length === 0 || content.length % 4 !== 0
      || !/^[A-Za-z0-9+/]*={0,2}$/.test(content)) throw new Error('canonical_autonomy_policy_unavailable');
  try {
    const binary = atob(content);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new Error('canonical_autonomy_policy_invalid');
  }
}

function freezePolicy(value: unknown, trustedRevision: string): Record<string, unknown> {
  if (!isRecord(value) || Object.keys(value).sort().join('|') !== [...POLICY_KEYS].sort().join('|')
      || value.schemaVersion !== 1 || typeof value.enabled !== 'boolean'
      || typeof value.autoMergeEnabled !== 'boolean'
      || !Array.isArray(value.ownerActorIds) || !Array.isArray(value.eligibleActors)
      || value.ownerActorIds.length === 0 || value.eligibleActors.length === 0
      || value.ownerActorIds.some((id) => !positiveInteger(id))
      || value.eligibleActors.some((id) => !positiveInteger(id))
      || new Set(value.ownerActorIds).size !== value.ownerActorIds.length
      || new Set(value.eligibleActors).size !== value.eligibleActors.length
      || !value.ownerActorIds.every((id) => (value.eligibleActors as number[]).includes(id))
      || typeof value.optInLabel !== 'string' || !/^[a-z0-9][a-z0-9:_-]{0,49}$/.test(value.optInLabel)) {
    throw new Error('canonical_autonomy_policy_invalid');
  }
  const ownerActorIds = value.ownerActorIds as number[];
  const eligibleActors = value.eligibleActors as number[];
  for (const key of ['eligibleCategories', 'eligiblePaths', 'eligibleRisks', 'capabilities'] as const) {
    const list = value[key];
    if (!Array.isArray(list) || list.some((item) => typeof item !== 'string')
        || new Set(list).size !== list.length) throw new Error('canonical_autonomy_policy_invalid');
  }
  if (!isRecord(value.runner) || Object.keys(value.runner).sort().join('|') !== 'model|provider'
      || value.runner.provider !== 'openai' || value.runner.model !== 'GPT-6-Luna'
      || !isRecord(value.budgets)
      || Object.keys(value.budgets).sort().join('|') !== 'maxDeliveryGenerations|maxHostedWorkflowRuns|maxModelCalls|taskConcurrency') {
    throw new Error('canonical_autonomy_policy_invalid');
  }
  const budgetCaps = { maxModelCalls: 8, maxDeliveryGenerations: 2, taskConcurrency: 1, maxHostedWorkflowRuns: 3 };
  for (const [key, cap] of Object.entries(budgetCaps)) {
    if (!positiveInteger(value.budgets[key]) || (value.budgets[key] as number) > cap) {
      throw new Error('canonical_autonomy_policy_invalid');
    }
  }
  const eligibleCategories = value.eligibleCategories as string[];
  const eligiblePaths = value.eligiblePaths as string[];
  const eligibleRisks = value.eligibleRisks as string[];
  const capabilities = value.capabilities as string[];
  return Object.freeze({
    schemaVersion: 1,
    enabled: value.enabled,
    autoMergeEnabled: value.autoMergeEnabled,
    ownerActorIds: Object.freeze([...ownerActorIds]),
    eligibleActors: Object.freeze([...eligibleActors]),
    optInLabel: value.optInLabel,
    eligibleCategories: Object.freeze([...eligibleCategories]),
    eligiblePaths: Object.freeze([...eligiblePaths]),
    eligibleRisks: Object.freeze([...eligibleRisks]),
    runner: Object.freeze({ provider: value.runner.provider, model: value.runner.model }),
    capabilities: Object.freeze([...capabilities]),
    budgets: Object.freeze({ ...value.budgets }),
    trustedRevision,
  });
}

/** Read autonomy policy from the exact immutable revision of the current default branch. */
export async function loadCanonicalAutonomyPolicy(
  api: GitHubApiClient,
  configuredRepositoryId: number,
): Promise<{ policy: Record<string, unknown>; sourceRevision: string }> {
  const repository = await api.getRepository();
  if (!isRecord(repository) || repository.id !== configuredRepositoryId
      || typeof repository.default_branch !== 'string' || repository.default_branch.length > 255) {
    throw new Error('canonical_autonomy_policy_unavailable');
  }
  const branchCommit = await api.getCommit(repository.default_branch);
  if (!isRecord(branchCommit) || typeof branchCommit.sha !== 'string' || !REVISION.test(branchCommit.sha)) {
    throw new Error('canonical_autonomy_policy_unavailable');
  }
  const sourceRevision = branchCommit.sha.toLowerCase();
  const policy = freezePolicy(decodePolicyFile(await api.getPolicyFile('autonomy.yml', sourceRevision)), sourceRevision);
  return { policy, sourceRevision };
}
