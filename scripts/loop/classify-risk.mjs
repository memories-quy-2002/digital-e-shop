const RISK_ORDER = Object.freeze(['low', 'medium', 'high', 'critical']);
const RISK_INDEX = new Map(RISK_ORDER.map((risk, index) => [risk, index]));
const REGEX_META = '\\^$+?.()|{}[]';

export class RiskInputError extends TypeError {
  constructor(message) {
    super(message);
    this.name = 'RiskInputError';
  }
}

export function normalizeRepoPath(input) {
  if (typeof input !== 'string' || input.length === 0) {
    throw new RiskInputError('repository path must be a non-empty string');
  }

  if (/[\u0000-\u001f\u007f]/.test(input)) {
    throw new RiskInputError('repository path contains a control character');
  }

  const slashed = input.replaceAll('\\', '/');
  if (slashed.startsWith('/') || /^[a-z]:/i.test(slashed)) {
    throw new RiskInputError(`absolute repository path is not allowed: ${input}`);
  }

  const segments = [];
  for (const segment of slashed.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      throw new RiskInputError(`repository path contains traversal segment: ${input}`);
    }
    segments.push(segment);
  }

  if (segments.length === 0) {
    throw new RiskInputError('repository path must identify a repository-relative path');
  }

  return segments.join('/');
}

function matchPathSegment(pattern, value, caseInsensitive = false) {
  let source = '^';
  for (const character of pattern) {
    if (character === '*') {
      source += '[^/]*';
    } else {
      source += REGEX_META.includes(character) ? `\\${character}` : character;
    }
  }
  source += '$';
  return new RegExp(source, caseInsensitive ? 'i' : '').test(value);
}

function matchPolicyPattern(pattern, normalizedPath, caseInsensitive = false) {
  const patternSegments = pattern.split('/');
  const pathSegments = normalizedPath.split('/');
  const memo = Array.from({ length: patternSegments.length + 1 }, () => []);

  function visit(patternIndex, pathIndex) {
    const cached = memo[patternIndex][pathIndex];
    if (cached !== undefined) return cached;

    let matches;
    if (patternIndex === patternSegments.length) {
      matches = pathIndex === pathSegments.length;
    } else if (patternSegments[patternIndex] === '**') {
      matches = visit(patternIndex + 1, pathIndex)
        || (pathIndex < pathSegments.length && visit(patternIndex, pathIndex + 1));
    } else {
      matches = pathIndex < pathSegments.length
        && matchPathSegment(patternSegments[patternIndex], pathSegments[pathIndex], caseInsensitive)
        && visit(patternIndex + 1, pathIndex + 1);
    }

    memo[patternIndex][pathIndex] = matches;
    return matches;
  }

  return visit(0, 0);
}

function assertPolicyShape(policy) {
  if (!policy || typeof policy !== 'object'
      || !policy.protectedPaths || !policy.riskRules
      || !Array.isArray(policy.protectedPaths.high)
      || !Array.isArray(policy.protectedPaths.critical)
      || !Array.isArray(policy.riskRules.low)
      || !Array.isArray(policy.riskRules.medium)
      || !Array.isArray(policy.riskRules.high)
      || !Array.isArray(policy.riskRules.criticalActions)) {
    throw new RiskInputError('a validated LoopPolicy is required');
  }
}

function raiseRisk(current, candidate) {
  return RISK_INDEX.get(candidate) > RISK_INDEX.get(current) ? candidate : current;
}

export function classifyRisk(input, policy) {
  assertPolicyShape(policy);

  if (!input || !Array.isArray(input.paths)) {
    throw new RiskInputError('paths must be an array of repository-relative paths');
  }

  const normalizedPaths = [...new Set(input.paths.map(normalizeRepoPath))].sort();
  const actions = input.actions ?? [];
  if (!Array.isArray(actions) || actions.some((action) => typeof action !== 'string')) {
    throw new RiskInputError('actions must be an array of stable action identifiers');
  }

  for (const action of actions) {
    if (!policy.riskRules.criticalActions.includes(action)) {
      throw new RiskInputError(`unknown action identifier: ${action}`);
    }
  }

  if (input.hintedRisk !== undefined && !RISK_INDEX.has(input.hintedRisk)) {
    throw new RiskInputError(`unknown hinted risk level: ${input.hintedRisk}`);
  }

  let level = 'low';
  const matchedRules = new Set();
  const reasons = new Set();

  if (normalizedPaths.length === 0) {
    level = 'medium';
    matchedRules.add('default:medium');
    reasons.add('empty path sets default to medium risk');
  }

  for (const normalizedPath of normalizedPaths) {
    let pathMatched = false;
    let pathRisk = 'low';

    for (const pattern of policy.protectedPaths.critical) {
      if (matchPolicyPattern(pattern, normalizedPath, true)) {
        pathRisk = raiseRisk(pathRisk, 'critical');
        pathMatched = true;
        matchedRules.add(`protectedPaths.critical:${pattern}`);
        reasons.add('critical protected path requires escalation');
      }
    }

    for (const pattern of policy.protectedPaths.high) {
      if (matchPolicyPattern(pattern, normalizedPath, true)) {
        pathRisk = raiseRisk(pathRisk, 'high');
        pathMatched = true;
        matchedRules.add(`protectedPaths.high:${pattern}`);
        reasons.add('protected path requires human approval');
      }
    }

    for (const risk of ['low', 'medium', 'high']) {
      for (const pattern of policy.riskRules[risk]) {
        if (matchPolicyPattern(pattern, normalizedPath, risk === 'high')) {
          pathRisk = raiseRisk(pathRisk, risk);
          pathMatched = true;
          matchedRules.add(`riskRules.${risk}:${pattern}`);
          reasons.add(`${risk} path rule matched`);
        }
      }
    }

    if (!pathMatched) {
      pathRisk = 'medium';
      matchedRules.add('default:medium');
      reasons.add('unmatched paths default to medium risk');
    }

    level = raiseRisk(level, pathRisk);
  }

  if (actions.length > 0) {
    level = 'critical';
    for (const action of actions) matchedRules.add(`criticalAction:${action}`);
    reasons.add('critical action requires escalation');
  }

  if (input.hintedRisk !== undefined) {
    const hintedLevel = raiseRisk(level, input.hintedRisk);
    if (hintedLevel !== level) {
      level = hintedLevel;
      matchedRules.add(`hintedRisk:${input.hintedRisk}`);
      reasons.add('hinted risk raised the deterministic result');
    }
  }

  return {
    level,
    requiresHumanApproval: level === 'high' || level === 'critical',
    reasons: [...reasons].sort(),
    matchedRules: [...matchedRules].sort(),
  };
}
