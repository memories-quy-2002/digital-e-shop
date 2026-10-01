export const STAGE0_LIMITS = Object.freeze({
  maxRequestBodyBytes: 256 * 1024,
  maxGitHubApiResponseBytes: 1024 * 1024,
  maxPaginationPages: 8,
  maxSubrequestsPerInvocation: 38,
  maxOpenPullRequestsPerSweep: 20,
  maxReconciliationPagesPerSweep: 10_000,
  maxQueueBatchSize: 10,
});

export type IncompleteReasonCode =
  | 'request_body_limit_reached'
  | 'response_body_limit_reached'
  | 'pagination_limit_reached'
  | 'subrequest_limit_reached';

export function unavailableEvidence(
  reasonCode:
    | 'stage0_not_configured'
    | 'webhook_ingress_not_configured'
    | 'queue_unavailable'
    | 'route_not_found'
    | 'method_not_allowed',
) {
  return { collectionStatus: 'unavailable' as const, reasonCode };
}

export function incompleteEvidence(reasonCode: IncompleteReasonCode, limit: number) {
  return {
    collectionStatus: 'incomplete' as const,
    reasonCode,
    limitReached: true as const,
    limit,
  };
}
