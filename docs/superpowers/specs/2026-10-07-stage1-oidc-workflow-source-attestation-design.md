# Stage 1 upstream workflow-source attestation through GitHub OIDC

**Date:** 2026-10-07

**Status:** Proposed design for maintainer review. No workflow change, provider, policy update, or Stage 1 write capability is approved.

**Related:** [Initial workflow attestation design](2026-10-05-stage1-workflow-attestation-design.md), [Stage 1 CLI runbook](../../loop-engineering/stage1-cli-runbook.md), [readiness evidence](../../loop-engineering/stage1-readiness.md).

## Goal and current state

Stage 1 must prove which reviewed workflow source produced a selected GitHub Actions run before it can consider a failed-job rerun. PR #291's probe and PR #292's evidence record show that the upstream `workflow_run` event and workflow-run API response do not expose a direct top-level `sourceSha` field. The current `workflow_source_sha_unattested` refusal remains correct for existing runs and must remain unchanged until a new evidence path is implemented and independently verified.

This proposal keeps the exact workflow-source commit requirement. It evaluates a different evidence source: have the upstream run request a short-lived GitHub OIDC identity while producing a GitHub artifact attestation for a deterministic, bounded run descriptor. The verifier would obtain the workflow-source digest from the authenticated Sigstore certificate, not from the descriptor's predicate or from `head_sha`.

GitHub documents `workflow_sha` as the commit SHA for the workflow file. Its OIDC claim set also includes `run_id` and `run_attempt`. GitHub artifact attestations use OIDC-backed Sigstore signing, and `gh attestation verify` documents that certificate and verified timestamp fields are not modifiable by the workflow, while statement predicate data is user-controlled. The latter must therefore be treated as untrusted input and checked against fresh API evidence.

## Proposed trust boundary

1. A dedicated, reviewed job in the upstream `.github/workflows/loop-foundation.yml` run creates a canonical descriptor only from the run event, trusted fixed configuration, and GitHub API observations. It does not check out or execute PR code for this purpose.
2. The descriptor contains a schema version, repository ID, workflow ID and path, run ID and attempt, event name, tested SHA, and the PR base/head/merge tuple when applicable. It contains no source SHA claim, credentials, prompts, review content, logs, artifact URLs, or arbitrary upstream fields.
3. The attested subject is the SHA-256 digest of the canonical descriptor bytes. The subject name and digest format are fixed by the reviewed producer implementation. The host can calculate the expected digest from its own fresh observations without knowing the workflow source SHA.
4. The upstream job creates the attestation using GitHub's OIDC-backed signing path. No producer workflow copies a claimed source SHA from an event field, artifact, log, output, or input.
5. A trusted host retrieves and cryptographically verifies the attestation bundle against the configured Sigstore trust roots. It then checks the certificate issuer, repository identity, signer workflow path/ref, signer workflow digest (`workflow_sha` / the corresponding signer-digest certificate field), and run invocation identity against host-owned policy and the exact API run/attempt.
6. The host treats the attestation statement and descriptor as untrusted even after signature verification. It validates the subject digest and every descriptor field against fresh run, attempt, job, and PR snapshots; it rejects missing, duplicate, stale, expired, replayed, mismatched, or changing observations.
7. Only a verifier-created immutable result can carry `sourceShaAttested: true` into the run adapter. Caller values, `.loop` state, CLI flags, environment variables, and the predicate cannot set or override this result.

The certificate must bind the exact workflow source digest and the exact run attempt. Before this can be accepted, a feasibility proof must demonstrate the actual certificate field mapping for `workflow_sha`, `run_id`, and `run_attempt` from a GitHub Actions run. In particular, the verifier must confirm that the run invocation URI identifies both the run ID and attempt, or identify another unforgeable certificate field for the attempt. It must not infer these values from the statement predicate.

## Workflow permissions and safety

The current `loop-foundation.yml` grants only `contents: read`. A future proof job would need only the minimum permissions required to request an OIDC token and publish an artifact attestation, expected to include `id-token: write` and `attestations: write`; retain `contents: read` only if the verified action requires it. It must not receive `actions: write`, `contents: write`, deployment secrets, or production environment access.

The workflow path is classified high risk by the repository policy. Any implementation or probe that edits `.github/workflows/loop-foundation.yml` requires human approval for that exact path scope and must go through a reviewed PR. This design approval alone does not grant that path approval, change the policy, authorize a rerun, or authorize Stage 1 promotion.

GitHub advises against attesting frequent builds that serve only automated testing. This proposal attests a small run descriptor for a control-plane trust decision, so the feasibility review must confirm that this use is supported and operationally acceptable. If the service, retrieval API, or usage guidance cannot meet the bounded evidence requirements, stop and return to design review rather than weakening the evidence contract.

## Failure behavior

Every missing or unverifiable certificate claim, signer mismatch, subject mismatch, tuple drift, API race, duplicate attestation, replay, trust-root error, or provider failure returns a typed refusal. Source evidence failures remain `workflow_source_sha_unattested`; descriptor or run binding failures use a separately reviewed stable reason code. There is no fallback to `head_sha`, workflow path, ref, display name, a matching required-check context, producer `github.workflow_sha`, or predicate-only claims.

This proposal does not resolve the separate GitHub rerun endpoint race: the failed-jobs endpoint accepts `run_id` without an attempt-scoped conditional write. It also does not approve the job graph, trusted approvers, persisted finite CI budget, pilot, or any Actions write capability. Stage 1 remains blocked by those gates even if source attestation succeeds.

## Feasibility and verification criteria

Before implementing a provider, a narrowly scoped proof must establish all of the following:

- A GitHub-produced Sigstore certificate from the exact upstream run exposes the workflow-source commit digest independently of the descriptor predicate.
- The certificate identifies the exact repository, workflow path/ref, run ID, and run attempt. A rerun of the same workflow is distinguishable from its prior attempt.
- A test run where the tested SHA and workflow-source SHA differ proves the verifier reads the signer workflow digest, not the source-repository digest or `head_sha`.
- The attestation subject digest can be looked up unambiguously without reading upstream artifacts or executing PR-controlled content.
- A valid attestation verifies, while wrong issuer, repository, workflow path/ref/digest, run ID, attempt, subject, PR tuple, expired trust evidence, duplicate evidence, replay, and unavailable API cases all fail closed.
- No `actions:write` or `contents:write` permission is introduced, and the existing `workflow_source_sha_unattested` path remains the result for old runs without an attestation.
- The proof collects only bounded identifiers, hashes, and statuses; it does not persist raw prompts, issue bodies, review bodies, logs, secrets, or tokens.

The proof must be run on a reviewed PR and a new Actions run. It cannot retroactively authenticate PR #291's run `37418888640`, whose probe result remains `source_sha_unavailable`.

## Decisions still required before implementation

1. Confirm the certificate-field mapping and exact run-attempt binding using current GitHub output and primary documentation.
2. Confirm artifact-attestation service suitability, retrieval semantics, and descriptor lookup without creating an ambiguous or replayable record.
3. Select and pin a verifier/runtime, trusted-root refresh strategy, evidence retention/expiry, replay store, and bounded API access pattern.
4. Review the exact high-risk workflow path change and permissions in a separate implementation plan/PR.
5. Resolve the raw-run-to-verified-identity adapter boundary without trusting caller-provided attestation flags.
6. Separately resolve or explicitly review the run/attempt write race, and complete the job graph, budget, approver, pilot, and live observation gates.

## References

- [GitHub Actions OIDC reference](https://docs.github.com/en/actions/reference/security/oidc): GitHub-provided `workflow_sha`, `run_id`, and `run_attempt` claims.
- [GitHub artifact attestations](https://docs.github.com/en/actions/concepts/security/artifact-attestations): OIDC-backed signing and supported provenance fields.
- [GitHub CLI attestation verification](https://cli.github.com/manual/gh_attestation_verify): certificate and verified timestamps are signed evidence; statement predicate data can be user-controlled; signer digest and workflow checks.
- [Sigstore verification output](https://github.com/sigstore/sigstore-go/blob/main/docs/verification.md): example decoded certificate fields including `githubWorkflowSHA`, `buildSignerDigest`, and `runInvocationURI` with an attempt-qualified URL.
- [GitHub workflow selection](https://docs.github.com/en/actions/concepts/workflows-and-actions/workflows): workflow versions are selected from the event-associated commit SHA or ref.
- [GitHub Actions events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows): event-specific `GITHUB_SHA`/`GITHUB_REF` behavior and `workflow_run` privilege warning.
- [Initial Stage 1 workflow attestation design](2026-10-05-stage1-workflow-attestation-design.md): prior proposal for a separate producer, which did not have an authenticated upstream source SHA to sign.
