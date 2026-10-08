import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import { classifyRisk, normalizeRepoPath } from '../classify-risk.mjs';
import { loadLoopPolicy } from '../policy.mjs';

let policy;

before(async () => {
  policy = await loadLoopPolicy();
});

describe('repository path normalization', () => {
  it('normalizes Windows separators and leading dot segments to POSIX paths', () => {
    assert.equal(normalizeRepoPath('client\\src\\features\\products\\Card.tsx'), 'client/src/features/products/Card.tsx');
    assert.equal(normalizeRepoPath('./client/src/features/products/Card.tsx'), 'client/src/features/products/Card.tsx');
  });

  it('rejects traversal and absolute paths rather than reinterpreting them as repository-relative', () => {
    assert.throws(() => normalizeRepoPath('../server/src/auth/auth.service.ts'), /traversal/);
    assert.throws(() => normalizeRepoPath('server/src/../../.env'), /traversal/);
    assert.throws(() => normalizeRepoPath('C:\\repo\\client\\src\\App.tsx'), /absolute/);
    assert.throws(() => normalizeRepoPath('\\\\server\\share\\secret.txt'), /absolute/);
  });
});

describe('deterministic risk classification', () => {
  it('classifies documentation-only work as low risk', () => {
    const result = classifyRisk({ paths: ['docs/ARCHITECTURE.md'] }, policy);
    assert.equal(result.level, 'low');
    assert.equal(result.requiresHumanApproval, false);
  });

  it('defaults an empty path set to medium risk instead of assuming it is safe', () => {
    assert.equal(classifyRisk({ paths: [] }, policy).level, 'medium');
  });

  it('classifies an ordinary storefront feature as medium risk', () => {
    const result = classifyRisk({ paths: ['client/src/features/products/ProductCard.tsx'] }, policy);
    assert.equal(result.level, 'medium');
    assert.equal(result.requiresHumanApproval, false);
  });

  it('classifies protected workflow and payment code as high risk', () => {
    for (const file of ['.github/workflows/ci.yml', 'server/src/payments/payos.service.ts']) {
      const result = classifyRisk({ paths: [file] }, policy);
      assert.equal(result.level, 'high', file);
      assert.equal(result.requiresHumanApproval, true, file);
    }
  });

  it('protects the agent control plane and database target guard as high risk', () => {
    for (const file of [
      'AGENTS.md',
      '.agent/loops/feature.md',
      'scripts/loop/controller.mjs',
      'server/src/config/database-target.js',
    ]) {
      const result = classifyRisk({ paths: [file] }, policy);
      assert.equal(result.level, 'high', file);
      assert.equal(result.requiresHumanApproval, true, file);
      assert.ok(result.matchedRules.some((rule) => rule.startsWith('protectedPaths.high:')), file);
    }
  });

  it('keeps case variants of protected paths at high or critical risk', () => {
    for (const file of [
      '.GITHUB/WORKFLOWS/ci.yml',
      'SCRIPTS/LOOP/controller.mjs',
      'SERVER/SRC/ORDERS/orders.service.ts',
    ]) {
      const result = classifyRisk({ paths: [file] }, policy);
      assert.equal(result.level, 'high', file);
      assert.equal(result.requiresHumanApproval, true, file);
    }

    const dotenv = classifyRisk({ paths: ['SERVER/.ENV.production'] }, policy);
    assert.equal(dotenv.level, 'critical');
  });

  it('classifies dotenv files as critical risk', () => {
    const result = classifyRisk({ paths: ['server/.env.production'] }, policy);
    assert.equal(result.level, 'critical');
    assert.equal(result.requiresHumanApproval, true);
    assert.ok(result.matchedRules.some((rule) => rule.includes('**/.env*')));
  });

  it('classifies critical actions by stable ID and rejects free-form action text', () => {
    const result = classifyRisk({ paths: ['docs/ARCHITECTURE.md'], actions: ['production_db_mutation'] }, policy);
    assert.equal(result.level, 'critical');
    assert.equal(result.requiresHumanApproval, true);
    assert.throws(
      () => classifyRisk({ paths: ['docs/ARCHITECTURE.md'], actions: ['please reset production'] }, policy),
      /unknown action/i,
    );
  });

  it('classifies the canonical Stage 1 recovery action as high risk', () => {
    const result = classifyRisk({ paths: ['docs/ARCHITECTURE.md'], actions: ['stage1_required_check_recovery'] }, policy);
    assert.equal(result.level, 'high');
    assert.equal(result.requiresHumanApproval, true);
    assert.ok(result.matchedRules.includes('highRiskAction:stage1_required_check_recovery'));
    assert.throws(() => classifyRisk({ paths: [], actions: ['unknown_action'] }, policy), /unknown action/i);
  });

  it('rejects malformed action lists in a supplied policy', () => {
    const invalidPolicies = [
      { ...policy.riskRules, highRiskActions: [] },
      { ...policy.riskRules, highRiskActions: ['stage1_required_check_recovery', 'stage1_required_check_recovery'] },
      { ...policy.riskRules, highRiskActions: ['unknown_action'] },
      { ...policy.riskRules, highRiskActions: ['production_db_mutation'] },
      { ...policy.riskRules, criticalActions: [...policy.riskRules.criticalActions, 'unknown_action'] },
      { ...policy.riskRules, criticalActions: [...policy.riskRules.criticalActions, 'production_db_mutation'] },
      { ...policy.riskRules, criticalActions: [...policy.riskRules.criticalActions, 'stage1_required_check_recovery'] },
      { ...policy.riskRules, criticalActions: [...policy.riskRules.criticalActions, 'branch_protection_bypass'] },
      { ...policy.riskRules, criticalActions: policy.riskRules.criticalActions.slice(1) },
    ];
    for (const riskRules of invalidPolicies) {
      assert.throws(() => classifyRisk({ paths: ['README.md'] }, { ...policy, riskRules }), /policy|action/i);
    }
  });

  it('uses the highest match across mixed paths and never lets hints downgrade deterministic risk', () => {
    const result = classifyRisk({
      paths: ['docs/ARCHITECTURE.md', 'server/src/orders/orders.service.ts'],
      hintedRisk: 'low',
    }, policy);

    assert.equal(result.level, 'high');
    assert.equal(result.requiresHumanApproval, true);
  });

  it('lets a hint raise risk but never lowers a deterministic critical match', () => {
    const raised = classifyRisk({ paths: ['README.md'], hintedRisk: 'high' }, policy);
    const protectedCritical = classifyRisk({ paths: ['server/.env.production'], hintedRisk: 'low' }, policy);

    assert.equal(raised.level, 'high');
    assert.equal(protectedCritical.level, 'critical');
  });

  it('matches recursive and segment wildcards against the full normalized path', () => {
    assert.equal(classifyRisk({ paths: ['server/src/feature.repository.ts'] }, policy).level, 'high');
    assert.equal(classifyRisk({ paths: ['server/src/catalog/catalog.repository.ts'] }, policy).level, 'high');
    assert.equal(classifyRisk({ paths: ['client/src/features/auth/Login.tsx'] }, policy).level, 'high');
    assert.equal(classifyRisk({ paths: ['elsewhere/server/src/orders/orders.service.ts'] }, policy).level, 'medium');
  });
});
