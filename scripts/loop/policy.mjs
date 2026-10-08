import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULE_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const POLICY_DIRECTORY = '.agent/policy';
const POLICY_FILES = Object.freeze({
  protectedPaths: 'protected-paths.yml',
  riskRules: 'risk-rules.yml',
  stopConditions: 'stop-conditions.yml',
});

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

function isPathInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

async function readPolicyFile(realRoot, filename, validator) {
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

  const text = await readFile(realFile, 'utf8');
  const document = parsePolicyDocument(text, source);
  validator(document, source);
  return document;
}

export async function loadLoopPolicy(repoRoot) {
  const requestedRoot = repoRoot ?? path.resolve(MODULE_DIRECTORY, '../..');
  const realRoot = await realpath(path.resolve(requestedRoot));

  const [protectedPathsDocument, riskRulesDocument, stopConditionsDocument] = await Promise.all([
    readPolicyFile(realRoot, POLICY_FILES.protectedPaths, validateProtectedPaths),
    readPolicyFile(realRoot, POLICY_FILES.riskRules, validateRiskRules),
    readPolicyFile(realRoot, POLICY_FILES.stopConditions, validateStopConditions),
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
