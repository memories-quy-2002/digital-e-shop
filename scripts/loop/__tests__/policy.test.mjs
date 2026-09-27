import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PolicyParseError,
  PolicyValidationError,
  loadLoopPolicy,
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

  return root;
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
