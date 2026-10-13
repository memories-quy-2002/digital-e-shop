import { describe, expect, it, vi } from 'vitest';

import type { GitHubApiClient } from '../src/github/api';
import { loadCanonicalAutonomyPolicy } from '../src/handlers/issue-policy';

const repositoryId = 743050379;
const revision = 'a'.repeat(40);
const policy = {
  schemaVersion: 1,
  enabled: true,
  autoMergeEnabled: false,
  ownerActorIds: [93824124],
  eligibleActors: [93824124],
  optInLabel: 'autonomous:run',
  eligibleCategories: ['documentation', 'frontend'],
  eligiblePaths: ['docs/API.md'],
  eligibleRisks: ['low', 'medium'],
  runner: { provider: 'openai', model: 'GPT-6-Luna' },
  capabilities: ['observe', 'propose_patch', 'run_fixed_verifier'],
  budgets: { maxModelCalls: 8, maxDeliveryGenerations: 2, taskConcurrency: 1, maxHostedWorkflowRuns: 3 },
};

function apiFixture(overrides: Record<string, unknown> = {}) {
  return {
    getRepository: vi.fn(async () => ({ id: repositoryId, default_branch: 'main' })),
    getCommit: vi.fn(async () => ({ sha: revision })),
    getPolicyFile: vi.fn(async () => ({
      encoding: 'base64',
      content: btoa(new TextEncoder().encode(JSON.stringify(policy)).reduce((text, byte) => text + String.fromCharCode(byte), '')),
    })),
    ...overrides,
  } as unknown as GitHubApiClient;
}

describe('canonical autonomy policy source for Issue ingress', () => {
  it('loads the policy only at the immutable SHA of the configured repository default branch', async () => {
    const api = apiFixture();
    const result = await loadCanonicalAutonomyPolicy(api, repositoryId);
    expect(result.sourceRevision).toBe(revision);
    expect(result.policy).toMatchObject({ enabled: true, trustedRevision: revision, optInLabel: 'autonomous:run' });
    expect(Object.isFrozen(result.policy)).toBe(true);
    expect(Object.isFrozen(result.policy.eligibleActors)).toBe(true);
    expect(api.getRepository).toHaveBeenCalledTimes(1);
    expect(api.getCommit).toHaveBeenCalledWith('main');
    expect(api.getPolicyFile).toHaveBeenCalledWith('autonomy.yml', revision);
  });

  it('fails closed for a mismatched repository, invalid commit, or malformed canonical policy', async () => {
    await expect(loadCanonicalAutonomyPolicy(apiFixture({
      getRepository: vi.fn(async () => ({ id: repositoryId + 1, default_branch: 'main' })),
    }), repositoryId)).rejects.toThrow('canonical_autonomy_policy_unavailable');
    await expect(loadCanonicalAutonomyPolicy(apiFixture({
      getCommit: vi.fn(async () => ({ sha: 'main' })),
    }), repositoryId)).rejects.toThrow('canonical_autonomy_policy_unavailable');
    await expect(loadCanonicalAutonomyPolicy(apiFixture({
      getPolicyFile: vi.fn(async () => ({ encoding: 'base64', content: btoa('{"enabled":true}') })),
    }), repositoryId)).rejects.toThrow('canonical_autonomy_policy_invalid');
  });
});
