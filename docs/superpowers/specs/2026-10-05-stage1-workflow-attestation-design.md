# Stage 1 workflow source attestation and job allowlist

**Date:** 2026-10-05

**Status:** Proposal for review; no live provider or allowlist is approved.

**Related:** [Stage 1 CLI design](2026-10-05-stage1-cli-flaky-rerun-design.md), [implementation plan](../plans/2026-10-05-stage1-cli-flaky-rerun.md).

## Decision needed

The current standard GitHub run adapter cannot prove the source commit of the top-level workflow definition. Its observations include the run path, tested/head SHA, attempt, and reusable-workflow references, but it sets `sourceSha: null` and `sourceShaAttested: false`. The guarded Actions writer correctly refuses the run unless a separately injected verifier proves the source.

Do not derive the source SHA from the workflow display name, path, PR head SHA, or caller-controlled metadata. GitHub documents that signed artifact provenance can identify its workflow, repository, commit, event, and OIDC-derived builder; it also requires consumers to verify the signature, timestamp, and signer identity. A viable provider therefore needs a reviewed producer and a cryptographic verifier. The current codebase has neither. Candidate design: a GitHub-issued artifact attestation over a canonical run descriptor, produced by a separately reviewed trusted workflow and verified by a host-owned verifier. Before implementation, reviewers must select the exact producer and verifier, pin the trusted issuer and signer workflow identity, and prove that the record binds repository ID, workflow path/ref/source SHA, run ID/attempt, and tested SHA. The provider must reject missing, duplicate, stale, mismatched, expired, or unverifiable records.

The GitHub attestation REST listing alone is not a verifier. The official documentation explicitly requires cryptographic signature/timestamp verification and signer validation. GitHub's documented producer permissions include `attestations:write` and `id-token:write`; their placement must keep the rerunnable job graph free of secrets, protected environments, and write-capable credentials. The host verifier/runtime dependency and the capability required to retrieve attestations also need review. Until that review is complete, the provider remains unavailable and the host must return `workflow_source_sha_unattested` without POSTing.

## Local workflow/job audit

| Workflow | Source evidence | Job graph and permissions | Pilot decision |
| --- | --- | --- | --- |
| `.github/workflows/loop-foundation.yml` | Current checkout only; exact GitHub required-workflow identity and source SHA are unavailable without live ruleset data | One job, `test`; workflow permission is `contents:read`; `actions/checkout` and `actions/setup-node` are pinned to full commit SHAs; checkout uses `persist-credentials: false`; no secrets, protected environment, reusable workflow, or local action appears in this file | Candidate for review, not approved. Refuse if the PR changes this workflow or its reviewed dependencies. |
| `.github/workflows/ci.yml` | Current checkout only | Includes `client`, `server`, and `production-migrate`. The production job is tied to the `production` environment, consumes `DATABASE_URL`, and applies production migrations. Its main-push condition does not make the complete graph a safe allowlist for the rerun-failed-jobs endpoint, which also reruns dependent jobs. | Exclude from the first pilot unless split and reviewed in a separate workflow change. |
| `.github/workflows/deploy-loop-stage0.yml` | Current checkout only | Protected deployment path with production Worker configuration and secrets. | Exclude. |
| `.github/workflows/security.yml` | Not audited in this proposal | Full job graph, permissions, actions, secrets, and dependencies have not been established here. | Exclude until fully audited. |

The potential first-pilot identity is the repository's `loop-foundation.yml` workflow with the single `test` job. This is only a source-code audit; the actual repository ID, required workflow path/ref/source SHA, workflow ID, and job identity must be reconciled with a fresh GitHub ruleset snapshot for the selected PR. A check-only required identity that cannot be mapped unambiguously to this workflow must return `unsupported_required_identity`.

## Record and verification contract

The trusted record must bind all of the following in one authenticated, non-replayable record:

- repository ID;
- workflow repository ID, path, ref, and source SHA;
- upstream workflow run ID and run attempt;
- tested SHA and the current PR base/head/merge tuple;
- trusted issuer and signer workflow identity.

The verifier is injected by the trusted Stage 1 host as `verifyTrustedRecord({ identity, run, snapshot })`. It must validate the signature chain against host-owned trust roots, validate issuer and signer identity against a reviewed allowlist, validate every tuple/run/attempt field, and reject provider errors. Neither PR files nor CLI arguments may supply the trust roots, approver IDs, allowlist, verifier, or accepted source SHA.

The exact artifact transport, verifier implementation/runtime, trust-root refresh policy, replay storage, and GitHub App read permission remain review items. No secret, OIDC token, PEM, artifact credential, or raw log is persisted in `.loop/` or telemetry. A failed or ambiguous verification has no fallback.

## Integration contract gaps found in the current implementation

The current callback boundary cannot yet consume raw GitHub run metadata. `github-pr-client.mjs` intentionally returns `sourceSha: null` and `sourceShaAttested: false`; `github-actions-write.mjs` refuses those values before invoking the verifier; and `workflow-source-attestation.mjs` also requires `sourceShaAttested === true` and an already matching `sourceSha` before it calls `verifyTrustedRecord`. A provider that only implements `verifyTrustedRecord({ identity, run, snapshot })` therefore cannot attest a raw API run. Review must choose one explicit contract: either a trusted host adapter verifies a signed record and constructs an immutable enriched run value, or the verifier accepts raw run metadata and returns a validated attested identity/value. Never set the attested flag from caller input or merely because a fixture callback returned true. Tests must cover the chosen producer-to-client-to-writer path end to end.

The job API returns attempt-scoped runtime job names, statuses, and conclusions, but it does not return workflow `needs` edges. The writer's reviewed allowlist currently contains only `jobNames`, while the TTY prompt requires a dependency graph and GitHub's rerun endpoint also reruns dependent jobs. The reviewed config/provider contract must supply the complete graph from an exact attested workflow revision (or another independently trusted source), including reusable workflows, dynamic matrices, and dependent jobs. Until then, return `trusted_job_graph_unavailable` and send no POST.

The local `.github/workflows/loop-foundation.yml` test step currently omits the dedicated Stage 1 suites `stage1-target.test.mjs`, `stage1-prompt.test.mjs`, `workflow-source-attestation.test.mjs`, and `pr-babysitter-stage1-host.test.mjs`. Its local Git blob is `7663634fbd9dffd8f0999d525118e57296f22890`; this is checkout evidence only, not a live GitHub source attestation. Because workflow paths are protected, adding these tests to hosted CI needs a separately reviewed exact-path change. Until then, local loop-suite success does not establish hosted coverage for these Stage 1 boundaries.

There is also a separate write-target limitation: the GitHub failed-jobs rerun
POST accepts `run_id` only, while the approval binds `run_attempt`. Its API
reference documents no conditional-write precondition for this POST; ETag
guidance covers conditional reads and does not provide a lock for the rerun
operation. The host now re-reads the exact attempt after reserving budget and
immediately before POST, but that read cannot make the run-level write atomic
with the approved attempt if another actor reruns concurrently. Keep live
reruns blocked until a separately reviewed design resolves this mismatch or
the accepted contract is explicitly changed.

## Required follow-up before live wiring

1. Review and approve the producer/verifier design, including the trusted signer workflow revision and provider-specific claims.
2. Review the complete `loop-foundation.yml` dependency/job graph and obtain a fresh required-workflow identity from the maintainer-selected pilot PR.
3. If the chosen provider needs a CI workflow change, implement that exact producer in its own reviewed workflow PR; do not grant the Stage 0 Worker or rerunnable test job Actions-write capability.
4. Add positive and negative fixtures for valid signature/identity, replay, wrong repository/workflow/path/ref/source/run/attempt/tested SHA, missing record, and verifier failure.
5. Keep every Stage 1 write closed until this design and the finite CI budget policy have been reviewed and merged separately.

## References

- [GitHub Actions workflow run REST API](https://docs.github.com/en/rest/actions/workflow-runs) — reruns failed jobs and their dependent jobs; run metadata includes `run_attempt` and `referenced_workflows`.
- [GitHub Actions workflow jobs REST API](https://docs.github.com/en/rest/actions/workflow-jobs) — attempt-specific job listing includes the job's `run_attempt`; the rerun write endpoint remains run-scoped.
- [GitHub REST API conditional-request guidance](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api) — ETag/`If-None-Match` examples cover conditional reads, not an atomic precondition for this rerun POST.
- [GitHub Actions contexts](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts) — `github.workflow_sha` identifies the workflow-file commit, but a value echoed by a PR-controlled job is not independent attestation.
- [Using artifact attestations](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations) — producer and provenance permissions.
- [Artifact attestation REST API](https://docs.github.com/en/rest/orgs/attestations) — listing attestations is not a substitute for signature and signer verification.
