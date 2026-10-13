import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

import {
  PolicyParseError,
  PolicyValidationError,
  loadLoopPolicy,
  loadAutonomyPolicy,
  parsePolicyDocument,
} from '../policy.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const temporaryRoots = new Set();

const baseDocuments = {
  'protected-paths.yml': {
    schemaVersion: 1,
    high: ['.github/workflows/**'],
    critical: ['**/.env*'],
  },
  'risk-rules.yml': {
    schemaVersion: 1,
    low: ['docs/**'],
    medium: ['client/src/**'],
    high: ['.github/workflows/**'],
    highRiskActions: ['stage1_required_check_recovery'],
    criticalActions: [
      'production_secret_access',
      'production_db_mutation',
      'branch_protection_bypass',
      'direct_push_main',
      'disable_security_checks',
      'production_deployment_promotion',
    ],
  },
  'stop-conditions.yml': {
    schemaVersion: 1,
    maxIterations: 5,
    maxSameFailure: 2,
    maxFlakyRetries: 3,
    maxChangedFiles: 25,
    maxChangedLines: 1000,
    maxWallClockSeconds: 1800,
    tokenLimit: null,
    ciRunLimit: null,
  },
  'autonomy.yml': {
    schemaVersion: 1,
    enabled: false,
    autoMergeEnabled: false,
    ownerActorIds: [93824124],
    eligibleActors: [93824124],
    optInLabel: 'autonomous:run',
    eligibleCategories: ['documentation', 'frontend'],
    eligiblePaths: ['docs/**', 'client/src/**'],
    eligibleRisks: ['low', 'medium'],
    runner: { provider: 'openai', model: 'GPT-6-Luna' },
    capabilities: ['observe', 'propose_patch', 'run_fixed_verifier', 'open_draft_pr'],
    budgets: { maxModelCalls: 8, maxDeliveryGenerations: 2, taskConcurrency: 1, maxHostedWorkflowRuns: 3 },
  },
};

async function createPolicyFixture(overrides = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'digital-e-policy-'));
  temporaryRoots.add(root);
  const policyDirectory = path.join(root, '.agent', 'policy');
  await mkdir(policyDirectory, { recursive: true });

  for (const [filename, document] of Object.entries({ ...baseDocuments, ...overrides })) {
    const contents = typeof document === 'string' ? document : JSON.stringify(document);
    await writeFile(path.join(policyDirectory, filename), contents, 'utf8');
  }

  execFileSync('git', ['-C', root, 'init', '--quiet']);
  execFileSync('git', ['-C', root, 'config', 'user.name', 'Loop Policy Test']);
  execFileSync('git', ['-C', root, 'config', 'user.email', 'loop-policy-test@example.invalid']);
  execFileSync('git', ['-C', root, 'add', '.agent/policy']);
  execFileSync('git', ['-C', root, 'commit', '--quiet', '-m', 'test policy fixture']);

  return root;
}

function getHeadRevision(root) {
  return execFileSync('git', ['-C', root, 'rev-parse', '--verify', 'HEAD'], { encoding: 'utf8' }).trim();
}

afterEach(async () => {
  const roots = [...temporaryRoots];
  temporaryRoots.clear();
  for (const root of roots) {
    const resolved = await realpath(root);
    assert.equal(path.dirname(resolved), await realpath(os.tmpdir()));
    await rm(resolved, { recursive: true, force: true });
  }
});

describe('Loop policy loading', () => {
  it('loads the disabled autonomy policy only for its trusted revision and pins Luna and finite budgets', async () => {
    const policy = await loadAutonomyPolicy(repoRoot, getHeadRevision(repoRoot));
    assert.equal(policy.enabled, false);
    assert.equal(policy.autoMergeEnabled, false);
    assert.deepEqual(policy.runner, { provider: 'openai', model: 'GPT-6-Luna' });
    assert.equal(policy.budgets.maxModelCalls, 8);
    assert.equal(policy.budgets.maxDeliveryGenerations, 2);
    assert.equal(policy.budgets.taskConcurrency, 1);
    assert.equal(policy.budgets.maxHostedWorkflowRuns, 3);
    assert.equal(policy.trustedRevision, getHeadRevision(repoRoot));
    assert.ok(Object.isFrozen(policy));
  });

  it('refuses absent, malformed, unknown-key, and stale-revision autonomy policy inputs', async () => {
    const missingRoot = await createPolicyFixture();
    await rm(path.join(missingRoot, '.agent', 'policy', 'autonomy.yml'));
    await assert.rejects(loadAutonomyPolicy(missingRoot, getHeadRevision(missingRoot)), PolicyValidationError);

    const malformedRoot = await createPolicyFixture({ 'autonomy.yml': '{ invalid' });
    await assert.rejects(loadAutonomyPolicy(malformedRoot, getHeadRevision(malformedRoot)), PolicyParseError);

    const unknownRoot = await createPolicyFixture({ 'autonomy.yml': { ...baseDocuments['autonomy.yml'], surprise: true } });
    await assert.rejects(loadAutonomyPolicy(unknownRoot, getHeadRevision(unknownRoot)), PolicyValidationError);
    await assert.rejects(loadAutonomyPolicy(repoRoot, 'a'.repeat(40)), PolicyValidationError);
  });

  it('does not let autonomy path allowlists downgrade existing protected paths', async () => {
    const fixtureRoot = await createPolicyFixture({
      'autonomy.yml': { ...baseDocuments['autonomy.yml'], eligiblePaths: ['docs/**', '.github/workflows/**'] },
    });
    await assert.rejects(loadAutonomyPolicy(fixtureRoot, getHeadRevision(fixtureRoot)), (error) => {
      assert.ok(error instanceof PolicyValidationError);
      assert.match(error.message, /protected/i);
      return true;
    });
  });

  it('rejects every model identity except GPT-6-Luna', async () => {
    const fixtureRoot = await createPolicyFixture({
      'autonomy.yml': { ...baseDocuments['autonomy.yml'], runner: { provider: 'openai', model: 'GPT-6-Sol' } },
    });
    await assert.rejects(loadAutonomyPolicy(fixtureRoot, getHeadRevision(fixtureRoot)), (error) => {
      assert.ok(error instanceof PolicyValidationError);
      assert.match(error.message, /GPT-6-Luna/);
      return true;
    });
  });

  it('loads and validates the three checked-in policy documents as one versioned policy', async () => {
    const policy = await loadLoopPolicy(repoRoot);

    assert.equal(policy.schemaVersion, 1);
    assert.ok(policy.protectedPaths.high.includes('.github/workflows/**'));
    assert.ok(policy.protectedPaths.critical.includes('**/.env*'));
    assert.deepEqual(policy.riskRules.criticalActions, [
      'production_secret_access',
      'production_db_mutation',
      'branch_protection_bypass',
      'direct_push_main',
      'disable_security_checks',
      'production_deployment_promotion',
    ]);
    assert.deepEqual(policy.riskRules.highRiskActions, ['stage1_required_check_recovery']);
    assert.ok(Object.isFrozen(policy.riskRules.highRiskActions));
    assert.equal(policy.stopConditions.maxIterations, 5);
    assert.equal(policy.stopConditions.maxSameFailure, 2);
    assert.equal(policy.stopConditions.maxFlakyRetries, 3);
    assert.equal(policy.stopConditions.maxChangedFiles, 25);
    assert.equal(policy.stopConditions.maxChangedLines, 1000);
    assert.equal(policy.stopConditions.maxWallClockSeconds, 1800);
  });

  it('rejects a policy document with an unsupported schema version', async () => {
    const fixtureRoot = await createPolicyFixture({
      'risk-rules.yml': { ...baseDocuments['risk-rules.yml'], schemaVersion: 2 },
    });

    await assert.rejects(loadLoopPolicy(fixtureRoot), (error) => {
      assert.ok(error instanceof PolicyValidationError);
      assert.match(error.message, /schemaVersion/);
      return true;
    });
  });

  it('wraps malformed JSON-compatible YAML and preserves the source path', () => {
    assert.throws(() => parsePolicyDocument('{ not-json', '.agent/policy/risk-rules.yml'), (error) => {
      assert.ok(error instanceof PolicyParseError);
      assert.match(error.message, /\.agent\/policy\/risk-rules\.yml/);
      return true;
    });
  });

  it('rejects a missing required key with a validation error naming its source', async () => {
    const incompleteRiskRules = { ...baseDocuments['risk-rules.yml'] };
    delete incompleteRiskRules.high;
    const fixtureRoot = await createPolicyFixture({ 'risk-rules.yml': incompleteRiskRules });

    await assert.rejects(loadLoopPolicy(fixtureRoot), (error) => {
      assert.ok(error instanceof PolicyValidationError);
      assert.match(error.message, /risk-rules\.yml/);
      assert.match(error.message, /high/);
      return true;
    });
  });

  it('requires exactly the canonical high-risk action ID', async () => {
    for (const highRiskActions of [undefined, [], ['stage1_required_check_recovery', 'stage1_required_check_recovery'], ['unknown_action'], ['production_db_mutation']]) {
      const riskRules = { ...baseDocuments['risk-rules.yml'] };
      if (highRiskActions === undefined) delete riskRules.highRiskActions;
      else riskRules.highRiskActions = highRiskActions;
      const fixtureRoot = await createPolicyFixture({ 'risk-rules.yml': riskRules });
      await assert.rejects(loadLoopPolicy(fixtureRoot), PolicyValidationError);
    }
  });

  it('requires positive integer stop conditions while allowing nullable optional budgets', async () => {
    for (const key of ['maxIterations', 'maxSameFailure', 'maxFlakyRetries', 'maxChangedFiles', 'maxChangedLines', 'maxWallClockSeconds']) {
      for (const invalidValue of [0, -1, 1.5]) {
        const invalidStopConditions = { ...baseDocuments['stop-conditions.yml'], [key]: invalidValue };
        const fixtureRoot = await createPolicyFixture({ 'stop-conditions.yml': invalidStopConditions });

        await assert.rejects(loadLoopPolicy(fixtureRoot), (error) => {
          assert.ok(error instanceof PolicyValidationError);
          assert.match(error.message, new RegExp(key));
          return true;
        });
      }
    }

    for (const key of ['tokenLimit', 'ciRunLimit']) {
      for (const invalidValue of [0, -1, 1.5]) {
        const invalidStopConditions = { ...baseDocuments['stop-conditions.yml'], [key]: invalidValue };
        const fixtureRoot = await createPolicyFixture({ 'stop-conditions.yml': invalidStopConditions });

        await assert.rejects(loadLoopPolicy(fixtureRoot), (error) => {
          assert.ok(error instanceof PolicyValidationError);
          assert.match(error.message, new RegExp(key));
          return true;
        });
      }
    }

    const validRoot = await createPolicyFixture();
    const validPolicy = await loadLoopPolicy(validRoot);
    assert.equal(validPolicy.stopConditions.tokenLimit, null);
    assert.equal(validPolicy.stopConditions.ciRunLimit, null);
  });

  it('rejects unsupported glob syntax in any policy path rule', async () => {
    const invalidRiskRules = {
      ...baseDocuments['risk-rules.yml'],
      high: ['server/src/[orders]/**'],
    };
    const fixtureRoot = await createPolicyFixture({ 'risk-rules.yml': invalidRiskRules });

    await assert.rejects(loadLoopPolicy(fixtureRoot), (error) => {
      assert.ok(error instanceof PolicyValidationError);
      assert.match(error.message, /risk-rules\.yml/);
      assert.match(error.message, /pattern/i);
      return true;
    });
  });
});
