export interface IssueTaskQueueMessage {
  kind: 'issue_task';
  deliveryId: string;
  repositoryId: number;
  issueNumber: number;
  generation: number;
  taskId: string;
  sourceRevision: string;
  policyRevision: string;
}

export function isIssueTaskQueueMessage(value: unknown): value is IssueTaskQueueMessage {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join('|') !== [
    'deliveryId', 'generation', 'issueNumber', 'kind', 'policyRevision', 'repositoryId', 'sourceRevision', 'taskId',
  ].sort().join('|')) return false;
  if (record.kind !== 'issue_task' || typeof record.deliveryId !== 'string'
      || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(record.deliveryId)
      || !Number.isSafeInteger(record.repositoryId) || (record.repositoryId as number) < 1
      || !Number.isSafeInteger(record.issueNumber) || (record.issueNumber as number) < 1
      || record.generation !== 1 || typeof record.taskId !== 'string'
      || record.taskId !== `repo-${record.repositoryId}-issue-${record.issueNumber}-g${record.generation}`) return false;
  const revision = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i;
  return typeof record.sourceRevision === 'string' && revision.test(record.sourceRevision)
    && typeof record.policyRevision === 'string' && revision.test(record.policyRevision)
    && record.sourceRevision.toLowerCase() === record.policyRevision.toLowerCase();
}
