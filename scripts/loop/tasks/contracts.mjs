const TASK_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
const ACCEPTANCE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const REVISION = /^[a-f0-9]{40,64}$/i;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export class TaskRecordValidationError extends Error {
  constructor(message) { super(message); this.name = new.target.name; }
}

function object(value, label, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new TaskRecordValidationError(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new TaskRecordValidationError(`${label} has missing or unsupported fields`);
  }
}

function counter(value, label, { positive = false } = {}) {
  if (!Number.isSafeInteger(value) || value < (positive ? 1 : 0)) throw new TaskRecordValidationError(`${label} must be a bounded ${positive ? 'positive' : 'non-negative'} integer`);
}

function id(value, label, pattern = TASK_ID) {
  if (typeof value !== 'string' || !pattern.test(value)) throw new TaskRecordValidationError(`${label} must be a safe stable identifier`);
}

function revision(value, label) {
  if (typeof value !== 'string' || !REVISION.test(value)) throw new TaskRecordValidationError(`${label} must be a full revision`);
}

export function validateTaskRecord(record) {
  object(record, 'TaskRecord', ['schemaVersion', 'key', 'taskId', 'requestDigest', 'acceptanceIds', 'sourceRevision', 'policyRevision', 'state', 'version', 'attempt', 'epoch', 'deadline', 'budgets', 'links', 'outcomeReason', 'confirmedMergeSha']);
  if (record.schemaVersion !== 2) throw new TaskRecordValidationError('schemaVersion is unsupported');
  object(record.key, 'task key', ['repositoryId', 'issueNumber', 'generation']);
  counter(record.key.repositoryId, 'repositoryId', { positive: true });
  counter(record.key.issueNumber, 'issueNumber', { positive: true });
  counter(record.key.generation, 'generation', { positive: true });
  id(record.taskId, 'taskId');
  const expectedTaskId = `repo-${record.key.repositoryId}-issue-${record.key.issueNumber}-g${record.key.generation}`;
  if (record.taskId !== expectedTaskId) throw new TaskRecordValidationError('taskId does not match TaskKey');
  if (typeof record.requestDigest !== 'string' || !DIGEST.test(record.requestDigest)) throw new TaskRecordValidationError('requestDigest must be a SHA-256 digest');
  if (!Array.isArray(record.acceptanceIds) || record.acceptanceIds.length > 100) throw new TaskRecordValidationError('acceptanceIds must be a bounded array');
  const seen = new Set();
  for (const acceptanceId of record.acceptanceIds) {
    id(acceptanceId, 'acceptanceId', ACCEPTANCE_ID);
    if (seen.has(acceptanceId)) throw new TaskRecordValidationError('acceptanceIds must be unique');
    seen.add(acceptanceId);
  }
  revision(record.sourceRevision, 'sourceRevision');
  revision(record.policyRevision, 'policyRevision');
  if (!['queued', 'planning', 'executing', 'verifying', 'delivering', 'monitoring', 'merging', 'merged', 'reporting', 'completed', 'waiting-approval', 'retry-wait', 'cancelling', 'cancelled', 'escalated', 'failed'].includes(record.state)) throw new TaskRecordValidationError('state is unsupported');
  for (const key of ['version', 'attempt', 'epoch']) counter(record[key], key, { positive: key === 'version' });
  if (typeof record.deadline !== 'string' || !TIMESTAMP.test(record.deadline) || new Date(record.deadline).toISOString() !== record.deadline) throw new TaskRecordValidationError('deadline must be a canonical UTC timestamp');
  object(record.budgets, 'budgets', ['modelCalls', 'repairs', 'deliveries', 'lastModelTokenUsed']);
  for (const key of ['modelCalls', 'repairs', 'deliveries']) counter(record.budgets[key], `budgets.${key}`);
  if (record.budgets.lastModelTokenUsed !== null) counter(record.budgets.lastModelTokenUsed, 'budgets.lastModelTokenUsed');
  object(record.links, 'links', ['loopStateTaskId', 'pr']);
  id(record.links.loopStateTaskId, 'loopStateTaskId');
  if (record.links.loopStateTaskId !== record.taskId) throw new TaskRecordValidationError('LoopState link does not match taskId');
  if (record.links.pr !== null) {
    object(record.links.pr, 'PR link', ['repositoryId', 'number', 'baseSha', 'headSha', 'mergeSha']);
    counter(record.links.pr.repositoryId, 'PR repositoryId', { positive: true });
    if (record.links.pr.repositoryId !== record.key.repositoryId) throw new TaskRecordValidationError('PR repository does not match TaskKey');
    counter(record.links.pr.number, 'PR number', { positive: true });
    revision(record.links.pr.baseSha, 'PR baseSha');
    revision(record.links.pr.headSha, 'PR headSha');
    if (record.links.pr.mergeSha !== null) revision(record.links.pr.mergeSha, 'PR mergeSha');
  }
  if (record.outcomeReason !== null) id(record.outcomeReason, 'outcomeReason', /^[a-z][a-z0-9_-]{0,63}$/);
  if (record.confirmedMergeSha !== null) revision(record.confirmedMergeSha, 'confirmedMergeSha');
  if (record.state === 'merged' && record.confirmedMergeSha === null) throw new TaskRecordValidationError('merged state requires confirmed merge SHA');
  if (record.confirmedMergeSha !== null
    && (record.links.pr === null || record.links.pr.mergeSha?.toLowerCase() !== record.confirmedMergeSha.toLowerCase())) {
    throw new TaskRecordValidationError('confirmed merge SHA must match linked PR evidence');
  }
  return structuredClone(record);
}
