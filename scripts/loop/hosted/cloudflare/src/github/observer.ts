import {
  normalizeCheckObservation,
  normalizePrSnapshot,
  normalizeRequiredCheckSnapshot,
} from '../../../../pr-evidence.mjs';
import { createGitHubApiClient, type GitHubApiClient, type GitHubListResult } from './api';
import { createGitHubAppAuth, type GitHubAppCredentials } from './app-auth';

const REVISION_PATTERN = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i;
const REQUIRED_POLICY_FILES = ['protected-paths.yml', 'risk-rules.yml', 'stop-conditions.yml'] as const;
const REQUIRED_CRITICAL_ACTIONS = [
  'production_secret_access',
  'production_db_mutation',
  'branch_protection_bypass',
  'direct_push_main',
  'disable_security_checks',
  'production_deployment_promotion',
];
const REQUIRED_HIGH_RISK_ACTIONS = ['stage1_required_check_recovery'];
const STOP_CONDITION_KEYS = [
  'maxIterations',
  'maxSameFailure',
  'maxFlakyRetries',
  'maxChangedFiles',
  'maxChangedLines',
  'maxWallClockSeconds',
  'tokenLimit',
  'ciRunLimit',
] as const;
const PROTECTED_PATH_KEYS = ['high', 'critical'] as const;
const RISK_RULE_KEYS = ['low', 'medium', 'high', 'criticalActions', 'highRiskActions'] as const;
const SUPPORTED_CONCLUSIONS = new Set([
  'success',
  'failure',
  'cancelled',
  'timed_out',
  'action_required',
  'neutral',
  'skipped',
]);
const OBSERVATION_STATUSES = new Set(['queued', 'in_progress', 'completed']);
const FINGERPRINT_REDACTIONS = [
  [/-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----[\s\S]*?(?:-----END (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----|$)/gi, '[REDACTED PRIVATE KEY]'],
  [/\b(authorization|proxy-authorization)\s*[:=]\s*(?:bearer|basic)\s+[^\s,;]+/gi, '$1: [REDACTED]'],
  [/\b(cookie|set-cookie)\s*[:=]\s*[^\r\n]*/gi, '$1: [REDACTED]'],
  [/\b([A-Z0-9_.-]*(?:SECRET|TOKEN|PASSWORD|PASSWD|API[_-]?KEY|PRIVATE[_-]?KEY|DATABASE_URL|ACCESS[_-]?KEY|CLIENT[_-]?SECRET)[A-Z0-9_.-]*\b\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;]+)/gi, '$1[REDACTED]'],
  [/\b(mysql|mariadb|postgres(?:ql)?|redis):\/\/[^\s:@/]+:[^\s@/]+@/gi, '$1://[REDACTED]@'],
  [/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]'],
  [/\b(?:gh[pousr]_[A-Za-z0-9_]{8,}|github_pat_[A-Za-z0-9_]{8,}|sk_(?:live|test)_[A-Za-z0-9]{8,}|AIza[A-Za-z0-9_-]{20,})\b/g, '[REDACTED TOKEN]'],
] as const;
const ANSI_ESCAPE = /\u001b\[[0-?]*[ -/]*[@-~]/g;
const WINDOWS_ABSOLUTE_PATH = /[a-z]:[\\/](?:[^\\/\s:()[\]]+[\\/])*[^\\/\s:()[\]]+/gi;
const POSIX_ABSOLUTE_PATH = /(?<![\w.])\/(?:[^/\s:()[\]]+\/)*[^/\s:()[\]]+/g;
const ISO_TIMESTAMP = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})\b/g;
const DURATION = /\b\d+(?:\.\d+)?\s*(?:ms|milliseconds?|secs?|seconds?|s)\b/gi;
const WORKSPACE_ANCHORS = new Set(['.agent', '.github', 'client', 'docs', 'scripts', 'server', 'tests', 'test', 'wiki', 'src']);

export interface Stage0Policy {
  schemaVersion: 1;
  protectedPaths: { high: string[]; critical: string[] };
  riskRules: { low: string[]; medium: string[]; high: string[]; criticalActions: string[]; highRiskActions: string[] };
  stopConditions: Record<(typeof STOP_CONDITION_KEYS)[number], number | null>;
}

export interface Stage0PrSnapshot {
  repository: string;
  repositoryId: number;
  baseRepositoryId: number;
  headRepositoryId: number | null;
  defaultBranch: string | null;
  state: 'open' | 'closed';
  draft: boolean;
  baseRef: string;
  baseSha: string;
  headRef: string;
  headSha: string;
  mergeSha: string | null;
  headRepository: string;
  updatedAt: string;
  number: number;
}

export interface Stage0RequiredCheckSnapshot {
  baseRef: string;
  policyFingerprint: string;
  requiredChecks: Array<{ context: string; appId: number | null }>;
  requiredCheckKeys: string[];
  requiredWorkflows: Array<{ repositoryId: number; path: string; ref: string; sha: string }>;
  requiredWorkflowKeys: string[];
  collectionStatus: 'complete' | 'incomplete' | 'unavailable';
}

export interface Stage0Observation {
  prSnapshot: Stage0PrSnapshot;
  requiredCheckSnapshot: Stage0RequiredCheckSnapshot;
  policy: Stage0Policy | null;
  checkObservations: Record<string, unknown>[];
  checkCollectionComplete: boolean;
  collectionStatus: 'complete' | 'incomplete' | 'unavailable';
  reasonCode: string | null;
  changedFiles: { collectionStatus: 'complete' | 'incomplete'; count: number };
  reviewSummary: {
    collectionStatus: 'complete' | 'incomplete';
    reviewCount: number;
    commentCount: number;
    issueCommentCount: number;
    counts: { approved: number; changesRequested: number; commented: number; dismissed: number; pending: number; other: number };
  };
  workflowEvidence: Array<{
    identity: { repositoryId: number; path: string; ref: string; sha: string };
    testedSha: string;
    status: 'unavailable';
    sourceSha: null;
    reasonCode: string;
  }>;
}

export interface GitHubObserverConfiguration extends GitHubAppCredentials {
  repository: string;
  checkRunName: string;
}

class Stage0ObserverError extends Error {
  readonly code: 'pr_snapshot_invalid' | 'check_observation_invalid';

  constructor(code: Stage0ObserverError['code']) {
    super(code);
    this.name = 'Stage0ObserverError';
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function positiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function safeRevision(value: unknown): string | null {
  return typeof value === 'string' && REVISION_PATTERN.test(value) ? value.toLowerCase() : null;
}

function safeRef(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 255
    && value !== '@' && !value.startsWith('/') && !value.endsWith('/') && !value.includes('//')
    && !value.includes('..') && !value.includes('@{') && !/[\x00-\x20\x7f~^:?*[\\]/.test(value)
    && value.split('/').every((segment) => segment.length > 0 && !segment.startsWith('.')
      && !segment.endsWith('.') && !segment.endsWith('.lock'));
}

function safeRepository(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const parts = value.split('/');
  if (parts.length !== 2 || parts.some((part) => part.length === 0 || part.length > 100
      || !/^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/.test(part) || part.includes('..'))) return null;
  return parts.join('/').toLowerCase();
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (isRecord(value)) {
    return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonicalJson(value[key])).join(',') + '}';
  }
  return JSON.stringify(value) ?? 'null';
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function decodeBase64(value: string): string {
  const compact = value.replace(/[\r\n\s]/g, '');
  if (!compact || compact.length > 128 * 1024 || compact.length % 4 !== 0) throw new Error('invalid_content');
  let decoded: string;
  try {
    decoded = atob(compact);
  } catch {
    throw new Error('invalid_content');
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(
    Uint8Array.from(decoded, (character) => character.charCodeAt(0)),
  );
}

function validatePattern(pattern: unknown): pattern is string {
  if (typeof pattern !== 'string' || pattern.length === 0 || pattern.startsWith('/')
      || pattern.includes('\\') || /[?{}[\]]/.test(pattern)) return false;
  const segments = pattern.split('/');
  return !segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..'
    || (segment.includes('**') && segment !== '**'));
}

function validatePatternList(value: unknown, keys: readonly string[]): value is Record<string, string[]> {
  if (!isRecord(value) || !exactKeys(value, keys)) return false;
  return keys.every((key) => Array.isArray(value[key]) && (value[key] as unknown[]).every(validatePattern)
    && new Set(value[key] as string[]).size === (value[key] as string[]).length);
}

function parsePolicyDocument(value: unknown, filename: (typeof REQUIRED_POLICY_FILES)[number]): unknown {
  if (!isRecord(value)) throw new Error('canonical_policy_invalid');
  if (filename === 'protected-paths.yml') {
    if (!exactKeys(value, ['schemaVersion', 'high', 'critical']) || value.schemaVersion !== 1
        || !validatePatternList({ high: value.high, critical: value.critical }, PROTECTED_PATH_KEYS)) {
      throw new Error('canonical_policy_invalid');
    }
    return value;
  }
  if (filename === 'risk-rules.yml') {
    if (!exactKeys(value, ['schemaVersion', 'low', 'medium', 'high', 'criticalActions', 'highRiskActions']) || value.schemaVersion !== 1
        || !validatePatternList({
          low: value.low,
          medium: value.medium,
          high: value.high,
        }, ['low', 'medium', 'high'])
        || !Array.isArray(value.criticalActions)
        || value.criticalActions.some((entry) => typeof entry !== 'string')
        || new Set(value.criticalActions as string[]).size !== value.criticalActions.length
        || REQUIRED_CRITICAL_ACTIONS.some((action) => !(value.criticalActions as string[]).includes(action))
        || (value.criticalActions as string[]).some((action) => !REQUIRED_CRITICAL_ACTIONS.includes(action))
        || !Array.isArray(value.highRiskActions)
        || (value.highRiskActions as unknown[]).some((entry) => typeof entry !== 'string')
        || new Set(value.highRiskActions as string[]).size !== (value.highRiskActions as string[]).length
        || REQUIRED_HIGH_RISK_ACTIONS.some((action) => !(value.highRiskActions as string[]).includes(action))
        || (value.highRiskActions as string[]).some((action) => !REQUIRED_HIGH_RISK_ACTIONS.includes(action)
          || REQUIRED_CRITICAL_ACTIONS.includes(action))) {
      throw new Error('canonical_policy_invalid');
    }
    return value;
  }
  if (!exactKeys(value, ['schemaVersion', ...STOP_CONDITION_KEYS]) || value.schemaVersion !== 1
      || STOP_CONDITION_KEYS.some((key) => {
        const budget = value[key];
        return key === 'tokenLimit' || key === 'ciRunLimit'
          ? budget !== null && (!Number.isSafeInteger(budget) || (budget as number) <= 0)
          : !Number.isSafeInteger(budget) || (budget as number) <= 0;
      })) {
    throw new Error('canonical_policy_invalid');
  }
  return value;
}

function makePolicy(documents: Map<string, unknown>): Stage0Policy {
  const protectedPaths = documents.get('protected-paths.yml') as { high: string[]; critical: string[] };
  const riskRules = documents.get('risk-rules.yml') as {
    low: string[];
    medium: string[];
    high: string[];
    criticalActions: string[];
    highRiskActions: string[];
  };
  const stopConditions = documents.get('stop-conditions.yml') as Record<(typeof STOP_CONDITION_KEYS)[number], number | null>;
  return {
    schemaVersion: 1,
    protectedPaths: { high: [...protectedPaths.high], critical: [...protectedPaths.critical] },
    riskRules: {
      low: [...riskRules.low],
      medium: [...riskRules.medium],
      high: [...riskRules.high],
      criticalActions: [...riskRules.criticalActions],
      highRiskActions: [...riskRules.highRiskActions],
    },
    stopConditions: { ...stopConditions },
  };
}

function normalizePullRequest(value: unknown, configuration: GitHubObserverConfiguration): Stage0PrSnapshot {
  if (!isRecord(value) || !positiveInteger(value.number) || !isRecord(value.base) || !isRecord(value.head)
      || !isRecord(value.base.repo) || !isRecord(value.head.repo)) throw new Error('invalid_pr_response');
  const repository = safeRepository(value.base.repo.full_name);
  const headRepository = safeRepository(value.head.repo.full_name);
  const baseSha = safeRevision(value.base.sha);
  const headSha = safeRevision(value.head.sha);
  const mergeSha = value.merge_commit_sha === null || value.merge_commit_sha === undefined
    ? null
    : safeRevision(value.merge_commit_sha);
  const baseRef = value.base.ref;
  const headRef = value.head.ref;
  if (value.number < 1 || typeof value.draft !== 'boolean' || !['open', 'closed'].includes(String(value.state))
      || !repository || !headRepository || repository !== configuration.repository.toLowerCase()
      || value.base.repo.id !== configuration.repositoryId || !safeRef(baseRef) || !safeRef(headRef)
      || !baseSha || !headSha || (value.merge_commit_sha !== null && !mergeSha)
      || typeof value.updated_at !== 'string' || !Number.isFinite(Date.parse(value.updated_at))) {
    throw new Error('invalid_pr_response');
  }
  const baseRepositoryId = value.base.repo.id;
  const headRepositoryId = positiveInteger(value.head.repo.id) ? value.head.repo.id : null;
  const updatedAt = new Date(value.updated_at).toISOString();
  const normalized = normalizePrSnapshot({
    repository,
    number: value.number,
    state: value.state,
    draft: value.draft,
    baseRef,
    baseSha,
    headRef,
    headSha,
    mergeSha,
    headRepository,
    updatedAt,
  });
  return {
    ...normalized,
    repositoryId: configuration.repositoryId,
    baseRepositoryId,
    headRepositoryId,
    defaultBranch: null,
  };
}

function sameTuple(left: Stage0PrSnapshot, right: Stage0PrSnapshot): boolean {
  return left.repository === right.repository && left.number === right.number
    && left.baseRef === right.baseRef && left.baseSha === right.baseSha
    && left.headSha === right.headSha && left.mergeSha === right.mergeSha
    && left.headRef === right.headRef && left.headRepository === right.headRepository;
}

function sanitizeContext(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 255
    && !/[\x00-\x1f\x7f]/.test(value) ? value.trim() : null;
}

function globMatches(pattern: unknown, value: string, wildcardCrossesSlash = false): boolean | null {
  if (typeof pattern !== 'string' || pattern.length === 0 || pattern.length > 255) return null;
  if (pattern === '~ALL') return true;
  if (pattern === '~NONE') return false;
  if (pattern === '~DEFAULT_BRANCH') return null;
  const branchPattern = pattern.startsWith('refs/heads/') ? pattern.slice('refs/heads/'.length) : pattern;
  if (/[{}\[\]!]/.test(branchPattern)) return null;
  let expression = '^';
  for (let index = 0; index < branchPattern.length; index += 1) {
    const character = branchPattern[index];
    if (character === '*') {
      if (branchPattern[index + 1] === '*') {
        expression += '.*';
        index += 1;
      } else {
        expression += wildcardCrossesSlash ? '.*' : '[^/]*';
      }
    } else if (character === '?') {
      expression += wildcardCrossesSlash ? '.' : '[^/]';
    } else {
      expression += character.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
    }
  }
  try {
    return new RegExp(expression + '$').test(value);
  } catch {
    return null;
  }
}

function rulesetApplies(
  ruleset: Record<string, unknown>,
  baseRef: string,
  defaultBranch: string | null,
  repository: string,
  repositoryId: number,
): boolean | null {
  if (ruleset.target !== 'branch') return ruleset.target === 'tag' ? false : null;
  if (ruleset.enforcement === 'disabled' || ruleset.enforcement === 'evaluate') return false;
  if (ruleset.enforcement !== 'active') return null;
  const conditions = ruleset.conditions;
  if (conditions === undefined || conditions === null) return true;
  if (!isRecord(conditions) || Object.keys(conditions).some((key) => (
    !['ref_name', 'repository_name', 'repository_id'].includes(key)
  ))) return null;
  for (const [conditionName, candidate] of Object.entries(conditions)) {
    if (!isRecord(candidate)) return null;
    if (conditionName === 'repository_id') {
      const include = candidate.include;
      const exclude = candidate.exclude;
      if (include !== undefined && (!Array.isArray(include) || include.some((id) => !positiveInteger(id)))) return null;
      if (exclude !== undefined && (!Array.isArray(exclude) || exclude.some((id) => !positiveInteger(id)))) return null;
      if (Array.isArray(include) && include.length > 0 && !include.includes(repositoryId)) return false;
      if (Array.isArray(exclude) && exclude.includes(repositoryId)) return false;
      continue;
    }
    const target = conditionName === 'repository_name' ? repository.toLowerCase() : baseRef;
    for (const setName of ['include', 'exclude'] as const) {
      if (candidate[setName] === undefined) continue;
      const patterns = candidate[setName];
      if (!Array.isArray(patterns)) return null;
      const matches = patterns.map((pattern) => {
        if (pattern === '~DEFAULT_BRANCH') {
          if (conditionName !== 'ref_name' || !defaultBranch) return null;
          return target === defaultBranch;
        }
        const normalized = conditionName === 'repository_name' && typeof pattern === 'string'
          ? pattern.toLowerCase()
          : pattern;
        return globMatches(normalized, target, conditionName === 'repository_name');
      });
      if (matches.some((result) => result === null)) return null;
      if (setName === 'include' && matches.length > 0 && !matches.some(Boolean)) return false;
      if (setName === 'exclude' && matches.some(Boolean)) return false;
    }
  }
  return true;
}

function normalizeRequiredCheck(context: unknown, appId: unknown): { context: string; appId: number | null } | null {
  const safeContext = sanitizeContext(context);
  if (!safeContext || (appId !== null && appId !== undefined && appId !== -1 && !positiveInteger(appId))) return null;
  return { context: safeContext, appId: appId === -1 ? null : positiveInteger(appId) ? appId : null };
}

function parseBranchProtection(value: unknown): {
  valid: boolean;
  checks: Array<{ context: string; appId: number | null }>;
  strict: boolean;
} {
  if (value === null) return { valid: true, checks: [], strict: false };
  if (!isRecord(value)) return { valid: false, checks: [], strict: false };
  if (value.required_status_checks === null) return { valid: true, checks: [], strict: false };
  if (!isRecord(value.required_status_checks)) return { valid: false, checks: [], strict: false };
  const checks: Array<{ context: string; appId: number | null }> = [];
  const required = value.required_status_checks;
  const fineContexts = new Set<string>();
  if (Array.isArray(required.checks)) {
    for (const check of required.checks) {
      if (!isRecord(check)) return { valid: false, checks: [], strict: false };
      const parsed = normalizeRequiredCheck(check.context, check.app_id ?? null);
      if (!parsed) return { valid: false, checks: [], strict: false };
      checks.push(parsed);
      fineContexts.add(parsed.context);
    }
  }
  if (Array.isArray(required.contexts)) {
    for (const context of required.contexts) {
      const parsed = normalizeRequiredCheck(context, null);
      if (!parsed) return { valid: false, checks: [], strict: false };
      if (!fineContexts.has(parsed.context)) checks.push(parsed);
    }
  }
  if (!Array.isArray(required.checks) && !Array.isArray(required.contexts)) return { valid: false, checks: [], strict: false };
  return { valid: true, checks, strict: required.strict === true };
}

function parseRulesetRule(rule: unknown): {
  valid: boolean;
  checks: Array<{ context: string; appId: number | null }>;
  workflows: Array<{ repositoryId: number; path: string; ref: string; sha: string }>;
  source: Record<string, unknown> | null;
} {
  if (!isRecord(rule) || typeof rule.type !== 'string' || rule.type.length === 0) {
    return { valid: false, checks: [], workflows: [], source: null };
  }
  if (rule.type === 'required_status_checks') {
    if (!isRecord(rule.parameters) || !Array.isArray(rule.parameters.required_status_checks)) {
      return { valid: false, checks: [], workflows: [], source: null };
    }
    const checks: Array<{ context: string; appId: number | null }> = [];
    for (const check of rule.parameters.required_status_checks) {
      if (!isRecord(check)) return { valid: false, checks: [], workflows: [], source: null };
      const parsed = normalizeRequiredCheck(check.context, check.integration_id ?? check.app_id ?? null);
      if (!parsed) return { valid: false, checks: [], workflows: [], source: null };
      checks.push(parsed);
    }
    return { valid: true, checks, workflows: [], source: { type: rule.type, checks } };
  }
  if (rule.type === 'required_workflows') {
    if (!isRecord(rule.parameters) || !Array.isArray(rule.parameters.workflows)) {
      return { valid: false, checks: [], workflows: [], source: null };
    }
    const workflows: Array<{ repositoryId: number; path: string; ref: string; sha: string }> = [];
    for (const workflow of rule.parameters.workflows) {
      if (!isRecord(workflow) || !positiveInteger(workflow.repository_id)
          || typeof workflow.path !== 'string' || typeof workflow.ref !== 'string'
          || !safeRevision(workflow.sha)) return { valid: false, checks: [], workflows: [], source: null };
      workflows.push({
        repositoryId: workflow.repository_id,
        path: workflow.path,
        ref: workflow.ref,
        sha: safeRevision(workflow.sha)!,
      });
    }
    return { valid: true, checks: [], workflows, source: { type: rule.type, workflows } };
  }
  return { valid: true, checks: [], workflows: [], source: { type: rule.type } };
}

async function loadCanonicalPolicy(
  api: GitHubApiClient,
  baseSha: string,
): Promise<Stage0Policy> {
  const documents = new Map<string, unknown>();
  for (const filename of REQUIRED_POLICY_FILES) {
    const response = await api.getPolicyFile(filename, baseSha);
    if (!isRecord(response) || response.encoding !== 'base64' || typeof response.content !== 'string') {
      throw new Error('canonical_policy_unavailable');
    }
    const document = JSON.parse(decodeBase64(response.content)) as unknown;
    documents.set(filename, parsePolicyDocument(document, filename));
  }
  return makePolicy(documents);
}

async function readRequiredCheckSnapshot(
  api: GitHubApiClient,
  snapshot: Stage0PrSnapshot,
  defaultBranch: string | null,
): Promise<Stage0RequiredCheckSnapshot> {
  let complete = true;
  const sources: Array<Record<string, unknown>> = [];
  const requiredChecks: Array<{ context: string; appId: number | null }> = [];
  const requiredWorkflows: Array<{ repositoryId: number; path: string; ref: string; sha: string }> = [];
  const [repositoryResult, protectionResult, rulesetResponse] = await Promise.all([
    api.getRepository().then((value) => ({ ok: true as const, value }), () => ({ ok: false as const, value: null })),
    api.getBranchProtection(snapshot.baseRef).then((value) => ({ ok: true as const, value }), () => ({ ok: false as const, value: null })),
    api.listRulesets().catch(() => null),
  ]);
  const repositoryResponse = repositoryResult.value;
  const protectionResponse = protectionResult.value;
  const observedDefaultBranch = isRecord(repositoryResponse) && typeof repositoryResponse.default_branch === 'string'
    ? repositoryResponse.default_branch
    : defaultBranch;
  if (!repositoryResult.ok || !protectionResult.ok) complete = false;
  if (!isRecord(repositoryResponse) || repositoryResponse.id !== snapshot.repositoryId
      || typeof repositoryResponse.default_branch !== 'string') complete = false;
  if (!rulesetResponse || rulesetResponse.collectionStatus !== 'complete') complete = false;

  const protection = protectionResult.ok ? parseBranchProtection(protectionResponse) : { valid: false, checks: [], strict: false };
  if (!protection.valid) complete = false;
  else {
    requiredChecks.push(...protection.checks);
    sources.push({ type: 'branch-protection', requiredChecks: protection.checks, strict: protection.strict });
  }
  if (rulesetResponse) {
    if (rulesetResponse.items.length > 100) complete = false;
    for (const listed of rulesetResponse.items.slice(0, 100)) {
      if (!isRecord(listed) || !positiveInteger(listed.id)) {
        complete = false;
        continue;
      }
      const details = await api.getRuleset(listed.id).catch(() => null);
      if (!isRecord(details) || details.id !== listed.id || !Array.isArray(details.rules)) {
        complete = false;
        continue;
      }
      const applies = rulesetApplies(
        details,
        snapshot.baseRef,
        observedDefaultBranch,
        snapshot.repository,
        snapshot.repositoryId,
      );
      if (applies === null) {
        complete = false;
        continue;
      }
      if (applies === false) continue;
      const ruleSources: Array<Record<string, unknown>> = [];
      let rulesetComplete = true;
      for (const rule of details.rules) {
        const parsed = parseRulesetRule(rule);
        if (!parsed.valid || !parsed.source || !isRecord(rule)) {
          complete = false;
          rulesetComplete = false;
          continue;
        }
        requiredChecks.push(...parsed.checks);
        requiredWorkflows.push(...parsed.workflows);
        ruleSources.push({
          ...parsed.source,
          ruleFingerprint: await sha256(canonicalJson(rule)),
        });
      }
      if (rulesetComplete) {
        const { id, target, enforcement, conditions } = details;
        sources.push({ id, target, enforcement, conditions: conditions ?? null, rules: ruleSources });
      }
    }
  }

  const crossRepositoryIds = [...new Set(requiredWorkflows
    .map((workflow) => workflow.repositoryId)
    .filter((id) => id !== snapshot.repositoryId))].sort((left, right) => left - right);
  if (crossRepositoryIds.length > 20) complete = false;
  const sourceResults = await Promise.all(crossRepositoryIds.slice(0, 20).map(async (repositoryId) => {
    const source = await api.getRepositoryById(repositoryId).catch(() => null);
    const accessible = isRecord(source) && source.id === repositoryId;
    sources.push({ type: 'workflow-source', repositoryId, accessible });
    if (!accessible) complete = false;
  }));
  void sourceResults;

  const uniqueChecks = new Map<string, { context: string; appId: number | null }>();
  for (const check of requiredChecks) {
    uniqueChecks.set(check.context + (check.appId === null ? '|legacy' : '|app:' + check.appId), check);
  }
  const uniqueWorkflows = new Map<string, { repositoryId: number; path: string; ref: string; sha: string }>();
  for (const workflow of requiredWorkflows) {
    const normalized = normalizeRequiredCheckSnapshot({
      baseRef: snapshot.baseRef,
      policyFingerprint: '0'.repeat(64),
      requiredChecks: [],
      requiredWorkflows: [workflow],
      collectionStatus: 'complete',
    }).requiredWorkflows[0];
    uniqueWorkflows.set(normalized.key, workflow);
  }
  const sortedChecks = [...uniqueChecks.values()].sort((left, right) => (
    left.context.localeCompare(right.context) || (left.appId ?? 0) - (right.appId ?? 0)
  ));
  const sortedWorkflows = [...uniqueWorkflows.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, workflow]) => workflow);
  if (sortedChecks.length > 1000 || sortedWorkflows.length > 1000) complete = false;
  const boundedChecks = sortedChecks.slice(0, 1000);
  const boundedWorkflows = sortedWorkflows.slice(0, 1000);
  const collectionStatus = complete ? 'complete' : 'unavailable';
  const fingerprint = await sha256(canonicalJson({
    repository: snapshot.repository,
    repositoryId: snapshot.repositoryId,
    baseRef: snapshot.baseRef,
    sources: sources.sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right))),
    collectionStatus,
  }));
  const normalized = normalizeRequiredCheckSnapshot({
    baseRef: snapshot.baseRef,
    policyFingerprint: fingerprint,
    requiredChecks: boundedChecks,
    requiredWorkflows: boundedWorkflows,
    collectionStatus,
  });
  return {
    ...normalized,
    requiredChecks: boundedChecks,
    requiredWorkflows: boundedWorkflows,
  } as Stage0RequiredCheckSnapshot;
}

function normalizeRepositoryFilename(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 1024
      || value.startsWith('/') || value.includes('\\') || /[\x00-\x1f\x7f]/.test(value)) return null;
  if (value.split('/').some((segment) => segment.length === 0 || segment === '.' || segment === '..')) return null;
  return value;
}

function normalizeFailureStream(input: string): string {
  let output = input.replace(ANSI_ESCAPE, '');
  for (const [pattern, replacement] of FINGERPRINT_REDACTIONS) output = output.replace(pattern, replacement as string);
  const normalizePath = (absolutePath: string) => {
    const segments = absolutePath.replaceAll('\\', '/').split('/').filter(Boolean);
    const anchor = segments.findIndex((segment) => WORKSPACE_ANCHORS.has(segment.toLowerCase()));
    return anchor >= 0 ? '<workspace>/' + segments.slice(anchor).join('/') : '<absolute>/' + segments.slice(-3).join('/');
  };
  return output.replace(WINDOWS_ABSOLUTE_PATH, normalizePath)
    .replace(POSIX_ABSOLUTE_PATH, normalizePath)
    .replace(ISO_TIMESTAMP, '<timestamp>')
    .replace(DURATION, '<duration>')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
}

async function fingerprintFailure(commandId: string, stdout: string, stderr: string): Promise<string> {
  return sha256(JSON.stringify({
    commandId,
    exitCode: 1,
    stdout: normalizeFailureStream(stdout),
    stderr: normalizeFailureStream(stderr),
  }));
}

async function mapCheckRun(
  value: unknown,
  snapshot: Stage0PrSnapshot,
  testedSha: string,
): Promise<Record<string, unknown> | null> {
  if (!isRecord(value) || !positiveInteger(value.id) || safeRevision(value.head_sha) !== testedSha
      || typeof value.status !== 'string' || !OBSERVATION_STATUSES.has(value.status)
      || (value.status === 'completed' && !SUPPORTED_CONCLUSIONS.has(String(value.conclusion)))
      || (value.status !== 'completed' && value.conclusion !== null && value.conclusion !== undefined)) return null;
  const context = sanitizeContext(value.name);
  if (!context) return null;
  const appId = isRecord(value.app) && positiveInteger(value.app.id) ? value.app.id : null;
  const completed = value.status === 'completed';
  const conclusion = completed ? value.conclusion as string : null;
  const safeTitle = isRecord(value.output) && typeof value.output.title === 'string' ? value.output.title.slice(0, 2048) : '';
  const safeSummary = isRecord(value.output) && typeof value.output.summary === 'string' ? value.output.summary.slice(0, 8192) : '';
  const failureFingerprint = completed && conclusion === 'failure'
    ? await fingerprintFailure('github-check:' + value.id, safeSummary, safeTitle)
    : null;
  return normalizeCheckObservation({
    checkId: 'check:' + value.id,
    requiredCheckKey: context + (appId === null ? '|legacy' : '|app:' + appId),
    requiredWorkflowKey: null,
    provider: 'github-check',
    headSha: snapshot.headSha,
    baseSha: snapshot.baseSha,
    mergeSha: snapshot.mergeSha,
    testedSha,
    attemptKey: 'check:' + value.id,
    status: value.status,
    conclusion,
    runnerOutcome: null,
    coversRelevantScope: false,
    protectedPathTouched: false,
    failureFingerprint,
  }) as Record<string, unknown>;
}

async function mapCommitStatus(
  value: unknown,
  snapshot: Stage0PrSnapshot,
  testedSha: string,
): Promise<Record<string, unknown> | null> {
  if (!isRecord(value)) return null;
  const context = sanitizeContext(value.context);
  if (!context || !['pending', 'success', 'failure', 'error'].includes(String(value.state))) return null;
  const creatorId = isRecord(value.creator) && positiveInteger(value.creator.id) ? value.creator.id : 'unknown';
  const identity = (await sha256(context + '|' + creatorId + '|' + String(value.created_at ?? ''))).slice(0, 32);
  const completed = value.state !== 'pending';
  const conclusion = value.state === 'success' ? 'success'
    : value.state === 'failure' || value.state === 'error' ? 'failure'
      : null;
  const description = typeof value.description === 'string' ? value.description.slice(0, 8192) : '';
  const failureFingerprint = completed && conclusion === 'failure'
    ? await fingerprintFailure('commit-status:' + identity, description, context)
    : null;
  return normalizeCheckObservation({
    checkId: 'status:' + identity,
    requiredCheckKey: context + '|legacy',
    requiredWorkflowKey: null,
    provider: 'external',
    headSha: snapshot.headSha,
    baseSha: snapshot.baseSha,
    mergeSha: snapshot.mergeSha,
    testedSha,
    attemptKey: 'status:' + identity,
    status: completed ? 'completed' : 'in_progress',
    conclusion,
    runnerOutcome: null,
    coversRelevantScope: false,
    protectedPathTouched: false,
    failureFingerprint,
  }) as Record<string, unknown>;
}

async function collectChecksForSha(
  api: GitHubApiClient,
  snapshot: Stage0PrSnapshot,
  testedSha: string,
): Promise<{ testedSha: string; observations: Record<string, unknown>[]; complete: boolean }> {
  const [runsResult, statusesResult] = await Promise.all([
    api.listCommitCheckRuns(testedSha),
    api.listCommitStatuses(testedSha),
  ]);
  const observations: Record<string, unknown>[] = [];
  let complete = runsResult.collectionStatus === 'complete' && statusesResult.collectionStatus === 'complete';
  for (const item of runsResult.items) {
    let observation: Record<string, unknown> | null;
    try {
      observation = await mapCheckRun(item, snapshot, testedSha);
    } catch {
      throw new Stage0ObserverError('check_observation_invalid');
    }
    if (!observation) complete = false;
    else observations.push(observation);
  }
  for (const item of statusesResult.items) {
    let observation: Record<string, unknown> | null;
    try {
      observation = await mapCommitStatus(item, snapshot, testedSha);
    } catch {
      throw new Stage0ObserverError('check_observation_invalid');
    }
    if (!observation) complete = false;
    else observations.push(observation);
  }
  return { testedSha, observations, complete };
}

function chooseCheckCollection(
  collections: Array<{ testedSha: string; observations: Record<string, unknown>[]; complete: boolean }>,
  requiredSnapshot: Stage0RequiredCheckSnapshot,
  snapshot: Stage0PrSnapshot,
) {
  const requiredKeys = new Set(requiredSnapshot.requiredCheckKeys);
  const covers = (collection: (typeof collections)[number]) => {
    const seen = new Set(collection.observations
      .map((observation) => observation.requiredCheckKey)
      .filter((key): key is string => typeof key === 'string' && requiredKeys.has(key)));
    return seen.size === requiredKeys.size;
  };
  const merge = collections.find((collection) => collection.testedSha === snapshot.mergeSha);
  const head = collections.find((collection) => collection.testedSha === snapshot.headSha);
  if (merge?.complete && covers(merge)) return merge;
  if (head?.complete && covers(head)) return head;
  return merge ?? head ?? { testedSha: snapshot.headSha, observations: [], complete: false };
}

function workflowPath(value: unknown): { path: string; ref: string } | null {
  if (typeof value !== 'string' || value.length > 512) return null;
  const separator = value.lastIndexOf('@');
  if (separator < 1 || separator === value.length - 1) return null;
  const path = value.slice(0, separator);
  const ref = value.slice(separator + 1);
  if (!path.startsWith('.github/workflows/') || path.includes('\\')
      || path.split('/').some((part) => part === '.' || part === '..' || !part) || !safeRef(ref)) return null;
  return { path, ref };
}

async function collectWorkflowEvidence(
  api: GitHubApiClient,
  required: Stage0RequiredCheckSnapshot,
  testedSha: string,
): Promise<Stage0Observation['workflowEvidence']> {
  if (required.requiredWorkflows.length === 0) return [];
  let collection: GitHubListResult | null = null;
  try {
    collection = await api.listWorkflowRuns(testedSha);
  } catch {
    collection = null;
  }
  return required.requiredWorkflows.map((identity) => {
    let reasonCode = 'workflow_source_sha_unattested';
    if (!collection || collection.collectionStatus !== 'complete') {
      reasonCode = 'workflow_collection_incomplete';
    } else {
      const matching = collection.items.some((run) => {
        if (!isRecord(run)) return false;
        const parsed = workflowPath(run.path);
        const repositoryId = isRecord(run.repository) && positiveInteger(run.repository.id)
          ? run.repository.id
          : positiveInteger(run.repository_id) ? run.repository_id : null;
        return parsed !== null && repositoryId === identity.repositoryId
          && parsed.path === identity.path && parsed.ref === identity.ref
          && safeRevision(run.head_sha) === testedSha;
      });
      if (!matching) reasonCode = 'required_workflow_not_found';
    }
    return {
      identity,
      testedSha,
      status: 'unavailable',
      sourceSha: null,
      reasonCode,
    };
  });
}

async function readMetadata(api: GitHubApiClient, prNumber: number): Promise<{
  changedFiles: Stage0Observation['changedFiles'];
  reviewSummary: Stage0Observation['reviewSummary'];
}> {
  const [files, reviews, reviewComments, issueComments] = await Promise.all([
    api.listPullRequestFiles(prNumber),
    api.listPullRequestReviews(prNumber),
    api.listPullRequestReviewComments(prNumber),
    api.listPullRequestIssueComments(prNumber),
  ]);
  let filesComplete = files.collectionStatus === 'complete';
  for (const file of files.items) {
    if (!isRecord(file) || !normalizeRepositoryFilename(file.filename)
        || (file.previous_filename !== undefined && !normalizeRepositoryFilename(file.previous_filename))
        || !['added', 'modified', 'removed', 'renamed', 'copied', 'changed', 'unchanged'].includes(String(file.status))) {
      filesComplete = false;
    }
  }
  const counts = { approved: 0, changesRequested: 0, commented: 0, dismissed: 0, pending: 0, other: 0 };
  let reviewComplete = reviews.collectionStatus === 'complete'
    && reviewComments.collectionStatus === 'complete'
    && issueComments.collectionStatus === 'complete';
  for (const review of reviews.items) {
    if (!isRecord(review) || typeof review.state !== 'string') {
      reviewComplete = false;
      continue;
    }
    if (review.state === 'APPROVED') counts.approved += 1;
    else if (review.state === 'CHANGES_REQUESTED') counts.changesRequested += 1;
    else if (review.state === 'COMMENTED') counts.commented += 1;
    else if (review.state === 'DISMISSED') counts.dismissed += 1;
    else if (review.state === 'PENDING') counts.pending += 1;
    else counts.other += 1;
  }
  if (reviewComments.items.some((item) => !isRecord(item)) || issueComments.items.some((item) => !isRecord(item))) {
    reviewComplete = false;
  }
  return {
    changedFiles: { collectionStatus: filesComplete ? 'complete' : 'incomplete', count: files.items.length },
    reviewSummary: {
      collectionStatus: reviewComplete ? 'complete' : 'incomplete',
      reviewCount: reviews.items.length,
      commentCount: reviewComments.items.length,
      issueCommentCount: issueComments.items.length,
      counts,
    },
  };
}

function unavailableRequiredChecks(snapshot: Stage0PrSnapshot, reason: string): Stage0RequiredCheckSnapshot {
  const normalized = normalizeRequiredCheckSnapshot({
    baseRef: snapshot.baseRef,
    policyFingerprint: '0'.repeat(64),
    requiredChecks: [],
    requiredWorkflows: [],
    collectionStatus: 'unavailable',
  });
  void reason;
  return { ...normalized, requiredChecks: [], requiredWorkflows: [] } as Stage0RequiredCheckSnapshot;
}

export function createGitHubObserver(
  configuration: GitHubObserverConfiguration,
  api: GitHubApiClient,
) {
  if (!configuration || safeRepository(configuration.repository) !== configuration.repository.toLowerCase()
      || api.repository !== configuration.repository.toLowerCase()
      || api.repositoryId !== configuration.repositoryId) {
    throw new Error('github_observer_configuration_invalid');
  }

  async function readSnapshot(prNumber: number): Promise<Stage0PrSnapshot> {
    const result = await api.getPullRequest(prNumber);
    try {
      return normalizePullRequest(result, configuration);
    } catch {
      throw new Stage0ObserverError('pr_snapshot_invalid');
    }
  }

  async function collect(prNumber: number): Promise<Stage0Observation> {
    const before = await readSnapshot(prNumber);
    let policy: Stage0Policy | null = null;
    let policyReason: string | null = null;
    try {
      policy = await loadCanonicalPolicy(api, before.baseSha);
    } catch {
      policyReason = 'canonical_base_policy_unavailable';
    }

    const [requiredResult, checksResults, metadataResult] = await Promise.all([
      readRequiredCheckSnapshot(api, before, null).catch(() => unavailableRequiredChecks(before, 'required_check_policy_unavailable')),
      Promise.all([...new Set([before.mergeSha, before.headSha].filter((sha): sha is string => Boolean(sha)))]
        .map(async (testedSha) => collectChecksForSha(api, before, testedSha).catch((error: unknown) => {
          if (error instanceof Stage0ObserverError) throw error;
          return { testedSha, observations: [], complete: false };
        }))),
      readMetadata(api, before.number).catch(() => ({
        changedFiles: { collectionStatus: 'incomplete' as const, count: 0 },
        reviewSummary: {
          collectionStatus: 'incomplete' as const,
          reviewCount: 0,
          commentCount: 0,
          issueCommentCount: 0,
          counts: { approved: 0, changesRequested: 0, commented: 0, dismissed: 0, pending: 0, other: 0 },
        },
      })),
    ]);
    const selected = chooseCheckCollection(checksResults, requiredResult, before);
    const workflowEvidence = await collectWorkflowEvidence(api, requiredResult, selected.testedSha);
    let finalSnapshot: Stage0PrSnapshot;
    try {
      finalSnapshot = await readSnapshot(prNumber);
    } catch {
      return {
        prSnapshot: before,
        requiredCheckSnapshot: requiredResult,
        policy,
        checkObservations: [],
        checkCollectionComplete: false,
        collectionStatus: 'unavailable',
        reasonCode: 'current_pr_snapshot_unavailable',
        ...metadataResult,
        workflowEvidence,
      };
    }
    if (!sameTuple(before, finalSnapshot)) {
      return {
        prSnapshot: finalSnapshot,
        requiredCheckSnapshot: requiredResult,
        policy,
        checkObservations: [],
        checkCollectionComplete: false,
        collectionStatus: 'incomplete',
        reasonCode: 'pr_tuple_changed_during_observation',
        ...metadataResult,
        workflowEvidence,
      };
    }
    const checkCollectionComplete = requiredResult.collectionStatus === 'complete' && selected.complete;
    return {
      prSnapshot: finalSnapshot,
      requiredCheckSnapshot: requiredResult,
      policy,
      checkObservations: selected.observations,
      checkCollectionComplete,
      collectionStatus: policyReason ? 'unavailable'
        : checkCollectionComplete ? 'complete' : 'incomplete',
      reasonCode: policyReason ?? (checkCollectionComplete ? null : 'evidence_collection_incomplete'),
      ...metadataResult,
      workflowEvidence,
    };
  }

  async function refresh(prNumber: number): Promise<Stage0PrSnapshot> {
    return readSnapshot(prNumber);
  }

  async function refreshPolicy(snapshot: Stage0PrSnapshot): Promise<Stage0RequiredCheckSnapshot> {
    const current = await readSnapshot(snapshot.number);
    if (!sameTuple(current, snapshot)) throw new Error('pr_tuple_changed_before_report');
    const repository = await api.getRepository();
    const defaultBranch = isRecord(repository) && typeof repository.default_branch === 'string'
      ? repository.default_branch
      : null;
    const required = await readRequiredCheckSnapshot(api, current, defaultBranch);
    if (required.collectionStatus !== 'complete') throw new Error('required_check_policy_incomplete');
    if (required.requiredChecks.some((check) => check.context === configuration.checkRunName)) {
      throw new Error('report_check_is_required');
    }
    const confirmed = await readSnapshot(snapshot.number);
    if (!sameTuple(confirmed, current)) throw new Error('pr_tuple_changed_before_report');
    return required;
  }

  return Object.freeze({ collect, refresh, refreshPolicy });
}

export function createGitHubObserverConfig(env: Record<string, unknown>): GitHubObserverConfiguration {
  const positiveId = (value: unknown) => typeof value === 'string' && /^[1-9][0-9]*$/.test(value)
    && Number.isSafeInteger(Number(value)) ? Number(value) : null;
  const appId = positiveId(env.GITHUB_APP_ID);
  const installationId = positiveId(env.GITHUB_INSTALLATION_ID);
  const repositoryId = positiveId(env.GITHUB_REPOSITORY_ID);
  const repository = safeRepository(env.GITHUB_REPOSITORY);
  const privateKey = env.GITHUB_APP_PRIVATE_KEY;
  const checkRunName = env.STAGE0_CHECK_RUN_NAME;
  if (!appId || !installationId || !repositoryId || !repository
      || typeof privateKey !== 'string' || privateKey.length === 0 || privateKey.length > 32 * 1024
      || checkRunName !== 'Loop Engineering Stage 0') {
    throw new Error('stage0_configuration_invalid');
  }
  return { appId, installationId, repositoryId, repository, privateKey, checkRunName };
}

export function createGitHubObserverRuntime(env: Record<string, unknown>) {
  const configuration = createGitHubObserverConfig(env);
  const auth = createGitHubAppAuth(configuration);
  const api = createGitHubApiClient({
    repository: configuration.repository,
    repositoryId: configuration.repositoryId,
    getToken: (capability) => auth.getInstallationToken(capability ?? 'observe'),
  });
  return Object.freeze({
    configuration,
    auth,
    api,
    observer: createGitHubObserver(configuration, api),
  });
}

export const stage0ObserverInternals = Object.freeze({
  parseBranchProtection,
  parseRulesetRule,
  rulesetApplies,
  fingerprintFailure,
});
