import { readFile, realpath } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULE_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const POLICY_DIRECTORY = '.agent/policy';
const POLICY_FILES = Object.freeze({
  protectedPaths: 'protected-paths.yml',
  riskRules: 'risk-rules.yml',
  stopConditions: 'stop-conditions.yml',
  autonomy: 'autonomy.yml',
});

const AUTONOMY_CAPABILITIES = Object.freeze(['observe', 'propose_patch', 'run_fixed_verifier', 'open_draft_pr']);
const AUTONOMY_CATEGORIES = Object.freeze(['documentation', 'frontend']);
const AUTONOMY_RISKS = Object.freeze(['low', 'medium']);

const STOP_CONDITION_KEYS = Object.freeze([
  'maxIterations',
  'maxSameFailure',
  'maxFlakyRetries',
  'maxChangedFiles',
  'maxChangedLines',
  'maxWallClockSeconds',
  'tokenLimit',
  'ciRunLimit',
]);

const REQUIRED_CRITICAL_ACTIONS = Object.freeze([
  'production_secret_access',
  'production_db_mutation',
  'branch_protection_bypass',
  'direct_push_main',
  'disable_security_checks',
  'production_deployment_promotion',
]);
const REQUIRED_HIGH_RISK_ACTIONS = Object.freeze(['stage1_required_check_recovery']);
const execFileAsync = promisify(execFile);

export class PolicyParseError extends Error {
  constructor(source, cause) {
    super(`Invalid JSON-compatible YAML in ${source}: ${cause.message}`, { cause });
    this.name = 'PolicyParseError';
    this.source = source;
  }
}

export class PolicyValidationError extends Error {
  constructor(source, message) {
    super(`Invalid policy ${source}: ${message}`);
    this.name = 'PolicyValidationError';
    this.source = source;
  }
}

export function parsePolicyDocument(text, source) {
  let value;

  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new PolicyParseError(source, error);
  }

  if (value === null || Array.isArray(value) || typeof value !== 'object') {
    throw new PolicyValidationError(source, 'document must be a JSON object');
  }

  return value;
}

function assertExactKeys(value, keys, source) {
  const actualKeys = Object.keys(value).sort();
  const expectedKeys = [...keys].sort();
  const missing = expectedKeys.filter((key) => !actualKeys.includes(key));
  const unknown = actualKeys.filter((key) => !expectedKeys.includes(key));

  if (missing.length || unknown.length) {
    const details = [
      missing.length ? `missing key(s): ${missing.join(', ')}` : null,
      unknown.length ? `unknown key(s): ${unknown.join(', ')}` : null,
    ].filter(Boolean);
    throw new PolicyValidationError(source, details.join('; '));
  }
}

function assertSchemaVersion(value, source) {
  if (value.schemaVersion !== 1) {
    throw new PolicyValidationError(source, 'schemaVersion must equal 1');
  }
}

function validatePattern(pattern, source) {
  if (typeof pattern !== 'string' || pattern.length === 0) {
    throw new PolicyValidationError(source, 'path patterns must be non-empty strings');
  }

  if (pattern.startsWith('/') || pattern.includes('\\') || /[?{}[\]]/.test(pattern)) {
    throw new PolicyValidationError(source, `unsupported path pattern: ${pattern}`);
  }

  const segments = pattern.split('/');
  if (segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')) {
    throw new PolicyValidationError(source, `unsupported path pattern: ${pattern}`);
  }

  for (const segment of segments) {
    if (segment.includes('**') && segment !== '**') {
      throw new PolicyValidationError(source, `** must occupy a complete path segment: ${pattern}`);
    }
  }
}

function validatePatternList(value, keys, source) {
  for (const key of keys) {
    if (!Array.isArray(value[key])) {
      throw new PolicyValidationError(source, `${key} must be an array`);
    }

    const seen = new Set();
    for (const pattern of value[key]) {
      validatePattern(pattern, source);
      if (seen.has(pattern)) {
        throw new PolicyValidationError(source, `${key} contains duplicate pattern: ${pattern}`);
      }
      seen.add(pattern);
    }
  }
}

function validateProtectedPaths(value, source) {
  assertExactKeys(value, ['schemaVersion', 'high', 'critical'], source);
  assertSchemaVersion(value, source);
  validatePatternList(value, ['high', 'critical'], source);
}

function validateRiskRules(value, source) {
  assertExactKeys(value, ['schemaVersion', 'low', 'medium', 'high', 'criticalActions', 'highRiskActions'], source);
  assertSchemaVersion(value, source);
  validatePatternList(value, ['low', 'medium', 'high'], source);

  if (!Array.isArray(value.criticalActions) || value.criticalActions.some((action) => typeof action !== 'string')) {
    throw new PolicyValidationError(source, 'criticalActions must be an array of action identifiers');
  }

  const actionSet = new Set(value.criticalActions);
  if (actionSet.size !== value.criticalActions.length) {
    throw new PolicyValidationError(source, 'criticalActions must not contain duplicates');
  }

  const missingActions = REQUIRED_CRITICAL_ACTIONS.filter((action) => !actionSet.has(action));
  const unknownActions = value.criticalActions.filter((action) => !REQUIRED_CRITICAL_ACTIONS.includes(action));
  if (missingActions.length || unknownActions.length) {
    const details = [
      missingActions.length ? `missing action(s): ${missingActions.join(', ')}` : null,
      unknownActions.length ? `unknown action(s): ${unknownActions.join(', ')}` : null,
    ].filter(Boolean);
    throw new PolicyValidationError(source, details.join('; '));
  }

  if (!Array.isArray(value.highRiskActions) || value.highRiskActions.some((action) => typeof action !== 'string')) {
    throw new PolicyValidationError(source, 'highRiskActions must be an array of action identifiers');
  }
  const highRiskActionSet = new Set(value.highRiskActions);
  if (highRiskActionSet.size !== value.highRiskActions.length) {
    throw new PolicyValidationError(source, 'highRiskActions must not contain duplicates');
  }
  const missingHighRiskActions = REQUIRED_HIGH_RISK_ACTIONS.filter((action) => !highRiskActionSet.has(action));
  const unknownHighRiskActions = value.highRiskActions.filter((action) => !REQUIRED_HIGH_RISK_ACTIONS.includes(action));
  const overlappingHighRiskActions = value.highRiskActions.filter((action) => REQUIRED_CRITICAL_ACTIONS.includes(action));
  if (missingHighRiskActions.length || unknownHighRiskActions.length || overlappingHighRiskActions.length) {
    const details = [
      missingHighRiskActions.length ? `missing high-risk action(s): ${missingHighRiskActions.join(', ')}` : null,
      unknownHighRiskActions.length ? `unknown high-risk action(s): ${unknownHighRiskActions.join(', ')}` : null,
      overlappingHighRiskActions.length ? `high-risk action(s) overlap critical actions: ${overlappingHighRiskActions.join(', ')}` : null,
    ].filter(Boolean);
    throw new PolicyValidationError(source, details.join('; '));
  }
}

function validateStopConditions(value, source) {
  assertExactKeys(value, ['schemaVersion', ...STOP_CONDITION_KEYS], source);
  assertSchemaVersion(value, source);

  for (const key of STOP_CONDITION_KEYS) {
    const budget = value[key];
    if (key === 'tokenLimit' || key === 'ciRunLimit') {
      if (budget !== null && (!Number.isSafeInteger(budget) || budget <= 0)) {
        throw new PolicyValidationError(source, `${key} must be a positive safe integer or null`);
      }
      continue;
    }

    if (!Number.isSafeInteger(budget) || budget <= 0) {
      throw new PolicyValidationError(source, `${key} must be a positive safe integer`);
    }
  }
}

function segmentPatternsIntersect(left, right) {
  const a = [...left.toLowerCase()];
  const b = [...right.toLowerCase()];
  const pending = [[0, 0, false]];
  const visited = new Set();

  while (pending.length) {
    const [i, j, consumed] = pending.pop();
    const key = `${i}:${j}:${consumed}`;
    if (visited.has(key)) continue;
    visited.add(key);
    if (i === a.length && j === b.length && consumed) return true;
    if (a[i] === '*') pending.push([i + 1, j, consumed]);
    if (b[j] === '*') pending.push([i, j + 1, consumed]);

    if (i < a.length && j < b.length) {
      const compatible = a[i] === '*' || b[j] === '*' || a[i] === b[j];
      if (compatible) {
        pending.push([a[i] === '*' ? i : i + 1, b[j] === '*' ? j : j + 1, true]);
      }
    }
  }
  return false;
}

function policyPatternsIntersect(left, right) {
  const a = left.split('/');
  const b = right.split('/');
  const pending = [[0, 0]];
  const visited = new Set();

  while (pending.length) {
    const [i, j] = pending.pop();
    const key = `${i}:${j}`;
    if (visited.has(key)) continue;
    visited.add(key);
    if (i === a.length && j === b.length) return true;
    if (a[i] === '**') pending.push([i + 1, j]);
    if (b[j] === '**') pending.push([i, j + 1]);
    if (a[i] === '**' && j < b.length && b[j] !== '**') pending.push([i, j + 1]);
    if (b[j] === '**' && i < a.length && a[i] !== '**') pending.push([i + 1, j]);
    if (i < a.length && j < b.length && a[i] !== '**' && b[j] !== '**'
      && segmentPatternsIntersect(a[i], b[j])) pending.push([i + 1, j + 1]);
  }
  return false;
}

function validateUniqueList(value, key, source, allowedValues) {
  if (!Array.isArray(value[key]) || value[key].length === 0) {
    throw new PolicyValidationError(source, `${key} must be a non-empty array`);
  }
  const values = value[key];
  if (values.some((item) => typeof item !== 'string') || new Set(values).size !== values.length) {
    throw new PolicyValidationError(source, `${key} must contain unique strings`);
  }
  const unknown = values.filter((item) => !allowedValues.includes(item));
  if (unknown.length) throw new PolicyValidationError(source, `${key} contains unsupported value(s): ${unknown.join(', ')}`);
}

function validateAutonomyPolicy(value, source, protectedPaths, riskRules) {
  assertExactKeys(value, [
    'schemaVersion', 'enabled', 'autoMergeEnabled', 'ownerActorIds', 'eligibleActors', 'optInLabel',
    'eligibleCategories', 'eligiblePaths', 'eligibleRisks', 'runner', 'capabilities', 'budgets',
  ], source);
  assertSchemaVersion(value, source);
  for (const key of ['enabled', 'autoMergeEnabled']) {
    if (typeof value[key] !== 'boolean') throw new PolicyValidationError(source, `${key} must be boolean`);
  }
  for (const key of ['ownerActorIds', 'eligibleActors']) {
    if (!Array.isArray(value[key]) || value[key].length === 0 || value[key].some((id) => !Number.isSafeInteger(id) || id <= 0)
      || new Set(value[key]).size !== value[key].length) {
      throw new PolicyValidationError(source, `${key} must contain unique positive actor IDs`);
    }
  }
  if (!value.ownerActorIds.every((id) => value.eligibleActors.includes(id))) {
    throw new PolicyValidationError(source, 'eligibleActors must include every owner actor ID');
  }
  if (typeof value.optInLabel !== 'string' || !/^[a-z0-9][a-z0-9:_-]{0,49}$/.test(value.optInLabel)) {
    throw new PolicyValidationError(source, 'optInLabel must be a bounded lowercase label');
  }
  validateUniqueList(value, 'eligibleCategories', source, AUTONOMY_CATEGORIES);
  validateUniqueList(value, 'eligibleRisks', source, AUTONOMY_RISKS);
  validateUniqueList(value, 'capabilities', source, AUTONOMY_CAPABILITIES);
  validatePatternList(value, ['eligiblePaths'], source);

  assertExactKeys(value.runner, ['provider', 'model'], source);
  if (value.runner.provider !== 'openai' || value.runner.model !== 'GPT-6-Luna') {
    throw new PolicyValidationError(source, 'runner must be OpenAI GPT-6-Luna with no fallback');
  }
  assertExactKeys(value.budgets, ['maxModelCalls', 'maxDeliveryGenerations', 'taskConcurrency', 'maxHostedWorkflowRuns'], source);
  for (const [key, maximum] of Object.entries({ maxModelCalls: 8, maxDeliveryGenerations: 2, taskConcurrency: 1, maxHostedWorkflowRuns: 3 })) {
    if (!Number.isSafeInteger(value.budgets[key]) || value.budgets[key] <= 0 || value.budgets[key] > maximum) {
      throw new PolicyValidationError(source, `${key} must be a positive integer no greater than ${maximum}`);
    }
  }

  for (const eligiblePath of value.eligiblePaths) {
    const protectedPatterns = [...protectedPaths.high, ...protectedPaths.critical, ...riskRules.high];
    if (protectedPatterns.some((protectedPattern) => policyPatternsIntersect(eligiblePath, protectedPattern))) {
      throw new PolicyValidationError(source, `eligible path ${eligiblePath} intersects a protected or high-risk path`);
    }
  }
}

function isPathInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

async function readPolicyText(realRoot, filename) {
  const source = path.posix.join(POLICY_DIRECTORY, filename);
  const policyRoot = await realpath(path.join(realRoot, POLICY_DIRECTORY)).catch((error) => {
    throw new PolicyValidationError(source, `cannot resolve policy directory: ${error.message}`);
  });

  if (!isPathInside(realRoot, policyRoot)) {
    throw new PolicyValidationError(source, 'policy directory resolves outside the repository root');
  }

  const expectedPath = path.join(policyRoot, filename);
  const realFile = await realpath(expectedPath).catch((error) => {
    throw new PolicyValidationError(source, `cannot resolve policy file: ${error.message}`);
  });

  if (!isPathInside(policyRoot, realFile)) {
    throw new PolicyValidationError(source, 'policy file resolves outside the policy directory');
  }

  return readFile(realFile, 'utf8');
}

async function readPolicyFile(realRoot, filename, validator, trustedRevision) {
  const source = path.posix.join(POLICY_DIRECTORY, filename);
  let text = await readPolicyText(realRoot, filename);
  if (trustedRevision) {
    let committedText;
    try {
      ({ stdout: committedText } = await execFileAsync('git', ['-C', realRoot, 'show', `${trustedRevision}:${source}`], { windowsHide: true, timeout: 5000 }));
    } catch {
      throw new PolicyValidationError(source, 'cannot load canonical policy bytes from trustedRevision');
    }
    const normalizeLineEndings = (value) => value.replace(/\r\n?/g, '\n');
    if (normalizeLineEndings(text) !== normalizeLineEndings(committedText)) {
      throw new PolicyValidationError(source, 'working-tree policy bytes do not match trustedRevision');
    }
    text = committedText;
  }
  const document = parsePolicyDocument(text, source);
  validator(document, source);
  return document;
}

async function loadLoopPolicyFromRoot(realRoot, trustedRevision) {
  const [protectedPathsDocument, riskRulesDocument, stopConditionsDocument] = await Promise.all([
    readPolicyFile(realRoot, POLICY_FILES.protectedPaths, validateProtectedPaths, trustedRevision),
    readPolicyFile(realRoot, POLICY_FILES.riskRules, validateRiskRules, trustedRevision),
    readPolicyFile(realRoot, POLICY_FILES.stopConditions, validateStopConditions, trustedRevision),
  ]);

  return Object.freeze({
    schemaVersion: 1,
    protectedPaths: Object.freeze({
      high: Object.freeze([...protectedPathsDocument.high]),
      critical: Object.freeze([...protectedPathsDocument.critical]),
    }),
    riskRules: Object.freeze({
      low: Object.freeze([...riskRulesDocument.low]),
      medium: Object.freeze([...riskRulesDocument.medium]),
      high: Object.freeze([...riskRulesDocument.high]),
      criticalActions: Object.freeze([...riskRulesDocument.criticalActions]),
      highRiskActions: Object.freeze([...riskRulesDocument.highRiskActions]),
    }),
    stopConditions: Object.freeze({
      maxIterations: stopConditionsDocument.maxIterations,
      maxSameFailure: stopConditionsDocument.maxSameFailure,
      maxFlakyRetries: stopConditionsDocument.maxFlakyRetries,
      maxChangedFiles: stopConditionsDocument.maxChangedFiles,
      maxChangedLines: stopConditionsDocument.maxChangedLines,
      maxWallClockSeconds: stopConditionsDocument.maxWallClockSeconds,
      tokenLimit: stopConditionsDocument.tokenLimit,
      ciRunLimit: stopConditionsDocument.ciRunLimit,
    }),
  });
}

export async function loadLoopPolicy(repoRoot) {
  const requestedRoot = repoRoot ?? path.resolve(MODULE_DIRECTORY, '../..');
  const realRoot = await realpath(path.resolve(requestedRoot));
  return loadLoopPolicyFromRoot(realRoot);
}

export async function loadAutonomyPolicy(repoRoot, trustedRevision) {
  if (typeof trustedRevision !== 'string' || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(trustedRevision)) {
    throw new PolicyValidationError(path.posix.join(POLICY_DIRECTORY, POLICY_FILES.autonomy), 'trustedRevision must be a full lowercase Git object ID');
  }

  const requestedRoot = repoRoot ?? path.resolve(MODULE_DIRECTORY, '../..');
  const realRoot = await realpath(path.resolve(requestedRoot));
  let checkedOutRevision;
  try {
    ({ stdout: checkedOutRevision } = await execFileAsync('git', ['-C', realRoot, 'rev-parse', '--verify', 'HEAD'], { windowsHide: true, timeout: 5000 }));
  } catch (error) {
    throw new PolicyValidationError(path.posix.join(POLICY_DIRECTORY, POLICY_FILES.autonomy), `cannot verify repository revision: ${error.message}`);
  }
  if (checkedOutRevision.trim() !== trustedRevision) {
    throw new PolicyValidationError(path.posix.join(POLICY_DIRECTORY, POLICY_FILES.autonomy), 'trustedRevision does not match the checked-out repository revision');
  }
  const loopPolicy = await loadLoopPolicyFromRoot(realRoot, trustedRevision);
  const document = await readPolicyFile(realRoot, POLICY_FILES.autonomy, (value, source) => {
    validateAutonomyPolicy(value, source, loopPolicy.protectedPaths, loopPolicy.riskRules);
  }, trustedRevision);
  let finalRevision;
  try {
    ({ stdout: finalRevision } = await execFileAsync('git', ['-C', realRoot, 'rev-parse', '--verify', 'HEAD'], { windowsHide: true, timeout: 5000 }));
  } catch {
    throw new PolicyValidationError(path.posix.join(POLICY_DIRECTORY, POLICY_FILES.autonomy), 'cannot recheck repository revision');
  }
  if (finalRevision.trim() !== trustedRevision) {
    throw new PolicyValidationError(path.posix.join(POLICY_DIRECTORY, POLICY_FILES.autonomy), 'repository revision changed while loading policy');
  }

  return Object.freeze({
    schemaVersion: 1,
    enabled: document.enabled,
    autoMergeEnabled: document.autoMergeEnabled,
    ownerActorIds: Object.freeze([...document.ownerActorIds]),
    eligibleActors: Object.freeze([...document.eligibleActors]),
    optInLabel: document.optInLabel,
    eligibleCategories: Object.freeze([...document.eligibleCategories]),
    eligiblePaths: Object.freeze([...document.eligiblePaths]),
    eligibleRisks: Object.freeze([...document.eligibleRisks]),
    runner: Object.freeze({ provider: document.runner.provider, model: document.runner.model }),
    capabilities: Object.freeze([...document.capabilities]),
    budgets: Object.freeze({ ...document.budgets }),
    trustedRevision,
  });
}
