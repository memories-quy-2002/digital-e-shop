# Stage 1 workflow source attestation and job allowlist

**Date:** 2026-10-06

**Status:** Written design for maintainer review. No provider, allowlist, or Stage 1 write capability is approved.

**Related:** [Stage 1 CLI runbook](../../loop-engineering/stage1-cli-runbook.md), [readiness evidence](../../loop-engineering/stage1-readiness.md), [implementation plan](../plans/2026-10-05-stage1-cli-flaky-rerun.md).

## Goal and current decision

Stage 1 may submit a failed-jobs rerun only when a trusted host can prove that the selected run came from the reviewed workflow source and complete job graph, and can bind a one-use approval and finite CI budget to the exact PR tuple and run attempt. The Stage 1 CLI currently refuses before loading credentials or making network requests. Keep that behavior.

The repository is public, so GitHub Artifact Attestations are available on the current plan. A separately triggered `workflow_run` producer is the preferred candidate for recording upstream run evidence because it can run from a reviewed default-branch workflow. It must use GitHub API reads only: it must not check out PR code, download upstream artifacts, or execute any upstream content. The producer may sign only facts it independently observed; it must never copy a claimed source SHA from an upstream artifact, log, workflow output, or caller-supplied field.

This candidate does **not** yet satisfy the contract. GitHub's documented workflow-run data gives the upstream run ID, attempt, path, ref, and tested/head SHA, but does not independently attest the top-level workflow source commit. The producer's own `github.workflow_sha` identifies the producer workflow, not the upstream run's workflow source. Therefore it must not emit an attestation that claims to prove the upstream `sourceSha`. The host continues to return `workflow_source_sha_unattested`, and no Actions write is permitted, until a reviewed source supplies and verifies that exact claim.

Do not silently replace the required source commit SHA with a workflow path, ref, PR SHA, workflow-file blob hash, display name, or matching required-check context. Any change to that identity contract requires a separate design and policy review.

## Proposed trust boundary

If an independently verifiable upstream source-SHA field becomes available, use this flow:

1. A reviewed default-branch `workflow_run` producer accepts only the configured upstream workflow ID/path, repository ID, event type, and completed status.
2. The producer fetches the upstream run and attempt-specific job data from GitHub, then fetches a fresh PR snapshot. It validates that the run belongs to the same repository and matches the current base/head/merge tuple. An absent, duplicate, stale, or changing record is rejected.
3. The producer constructs a bounded canonical descriptor from API-observed values and the independently established workflow source SHA. It does not include prompts, reviews, logs, credentials, artifact URLs, or arbitrary upstream fields.
4. The producer creates a GitHub artifact attestation over the descriptor digest with a fixed custom predicate. Its signer is pinned to the exact repository, workflow path, ref, and reviewed producer source revision. Required producer permissions are limited to API reads plus `contents:read`, `attestations:write`, and `id-token:write`; no `actions:write` or `contents:write` is granted.
5. The trusted host retrieves the bundle, verifies the signature and trusted root, checks issuer and signer identity against host-owned configuration, validates every descriptor field against its fresh API snapshot and current PR tuple, and consumes a replay key. Artifact listing alone is not verification.
6. The host passes an immutable verified result to the run adapter/writer. Caller input cannot set `sourceShaAttested`, trust roots, signer allowlists, job graphs, approvers, or accepted source revisions.

The descriptor must bind repository ID; workflow repository ID, path, ref, and source SHA; workflow ID; run ID and attempt; tested SHA; current PR base/head/merge tuple; producer identity; and a unique replay key. Verification rejects missing or duplicate records, wrong repository/workflow/path/ref/source/run/attempt/tested SHA, tuple drift, stale or expired evidence, replay, signature failure, untrusted signer, and provider errors. Failure has no fallback.

The exact upstream source-SHA acquisition method is an open prerequisite, not an implementation detail to guess. A feasibility proof must demonstrate that the value comes from a GitHub-authenticated source tied to that exact run. If GitHub does not expose such a value, stop and request a separately reviewed change to the source-identity contract; do not weaken the current contract in code.

## Host integration contract

The raw run adapter currently returns `sourceSha: null` and `sourceShaAttested: false`. The verifier currently requires an already-attested matching value before its callback runs, so it cannot consume raw API evidence. Implement the boundary as a verifier that accepts raw immutable GitHub run/snapshot data and returns either a newly constructed immutable verified identity or a typed refusal. Never accept a boolean callback result or caller-provided attestation flag as proof. The writer may proceed only with the verifier-created value.

The verifier uses host-owned trust roots, provider identity, signer allowlist, source policy, replay storage, and job graph. None may come from PR files, environment overrides, CLI arguments, or serialized `.loop` state. Trust-root refresh and rollback behavior, verifier runtime/dependency, evidence retrieval permission, bounded cache lifetime, and replay retention must be resolved before enabling the provider.

## Workflow/job allowlist

The first candidate remains `.github/workflows/loop-foundation.yml`, with its single `test` job. This is only a source audit, not an approval. Before any pilot, reconcile the exact repository ID, workflow ID/path/ref/source SHA, required-workflow identity, and job contract from fresh GitHub evidence. Reject a PR that changes the workflow or any reviewed dependency unless that exact high-risk scope receives its required review.

Exclude `.github/workflows/ci.yml` from the first pilot: its graph includes `production-migrate`, which uses the protected `production` environment and `DATABASE_URL`. Exclude `deploy-loop-stage0.yml` because it deploys the protected Worker. Keep `security.yml` excluded until its full job graph, actions, permissions, secrets, environments, and dependencies have been reviewed.

The jobs API returns runtime job names/statuses but not `needs` edges. A reviewed allowlist must include the complete graph from the exact verified workflow revision, including reusable workflows, local actions, dependent jobs, dynamic matrices, permissions, secrets, and protected environments. Names alone are insufficient. Until that graph is available, return `trusted_job_graph_unavailable` without POSTing.

## Separate hard gate: rerun target race

Even a valid source attestation does not resolve the write-target race. GitHub's failed-jobs rerun endpoint accepts `run_id`; it has no `run_attempt` parameter or documented conditional-write precondition. Re-reading the attempt immediately before the POST narrows the window but cannot bind the write atomically to the approved attempt. Keep `run_attempt_write_binding_unavailable` as a hard live gate unless GitHub adds an attempt-scoped/conditional operation or a separate reviewed contract explicitly accepts the residual race. This design does not authorize changing that policy.

## Required decisions before implementation

1. Prove an authenticated source for the upstream workflow source SHA. If unavailable, leave this design blocked and propose a separate contract change for review.
2. Select and pin the artifact-attestation verifier, trusted root update strategy, signer identity, evidence retrieval path, replay store, and failure/expiry behavior.
3. Approve the complete `loop-foundation.yml` job and dependency graph, and obtain a fresh required-workflow identity from a maintainer-selected same-repository non-`main` PR.
4. Fix the raw-run-to-verified-identity integration contract and cover valid, replayed, missing, stale, mismatched, duplicate, and unverifiable evidence end to end.
5. Separately resolve or explicitly review the run/attempt write race. Source attestation alone never enables reruns.
6. Keep the host-managed persisted `LoopState` session bound to canonical `ciRunLimit: 2`, trusted approver configuration, and exact PR tuple as independent prerequisites.

## Acceptance criteria

- Without verified upstream source SHA, the host refuses before credentials or network writes and reports `workflow_source_sha_unattested`.
- A producer cannot read or execute upstream artifacts/code and cannot mint an `actions:write` or `contents:write` token.
- A verified record binds every descriptor field above to a fresh exact-run/attempt and PR snapshot; all negative cases fail closed.
- No check, workflow, or job is inferred green from a name/path/ref match alone.
- Source-attestation success does not bypass the job-graph, budget-session, approver, pilot, or run-attempt write-binding gates.
- Hosted verification and at least 10 representative live observations remain required before Stage 1 promotion; no static fixture or local run counts as promotion evidence.

## References

- [Workflow runs REST API](https://docs.github.com/en/rest/actions/workflow-runs) — run-level rerun inputs and workflow-run metadata.
- [Workflow jobs REST API](https://docs.github.com/en/rest/actions/workflow-jobs) — attempt-scoped runtime job evidence.
- [GitHub Actions contexts](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts) — `github.workflow_sha` describes the current workflow file revision; a producer's value is not the upstream workflow SHA.
- [Artifact attestations](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations) — public repository availability, signer permissions, and verification with GitHub CLI.
- [Secure use of GitHub Actions](https://docs.github.com/en/actions/reference/security/secure-use) — privileged `workflow_run` workflows must treat upstream artifacts as untrusted and must not execute untrusted PR content.
- [Artifact attestation REST API](https://docs.github.com/en/rest/repos/attestations) — retrieval/listing does not replace cryptographic verification.
