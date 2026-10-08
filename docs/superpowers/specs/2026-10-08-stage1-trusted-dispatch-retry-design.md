# Stage 1 trusted-dispatch retry and required-check recovery

**Date:** 2026-10-08

**Status:** Reviewed and approved by the maintainer for implementation planning. It authorizes no implementation, policy change, permission change, workflow dispatch, Check Run update, or live pilot.

**Current status (2026-10-08):** PR #295 merged `stage1_required_check_recovery` as a high-risk action, preserving the critical action set. PR #296 merged an attempt-scoped single-job writer after a controlled test returned HTTP 403 for a stale job ID. Those results resolve the earlier policy-classification and stale-job-evidence questions, but they do not grant App permissions or authorize a dispatch/Check Run write. The labeled OIDC probe recorded in the readiness report still returned `unavailable`, and Stage 1 remains fail-closed.

**Related:** [Attempt-bound rerun design](2026-10-08-stage1-attempt-bound-rerun-design.md), [attempt-bound implementation plan](../plans/2026-10-08-stage1-attempt-bound-rerun.md), [trusted-dispatch implementation plan](../plans/2026-10-08-stage1-trusted-dispatch-retry.md), [Stage 1 CLI runbook](../../loop-engineering/stage1-cli-runbook.md), [readiness evidence](../../loop-engineering/stage1-readiness.md), and [workflow-source attestation design](2026-10-05-stage1-workflow-attestation-design.md).

## Goal and current decision

Replace the Stage 1 write against an old Actions run or job with a new run of a fixed, reviewed verifier from the default branch. The verifier tests the exact current PR commit and, only after success, updates the exact existing PR Check Run that represents the failed required check. This avoids relying on undocumented stale-job-ID behavior and avoids creating a second required check with an ambiguous result.

This is a candidate architecture, not an activation decision. The old job-ID behavior is now tested for the stale-ID case: the controlled attempt-bound experiment returned HTTP 403, and PR #296 merged a writer bound to one attempt-scoped job ID. The trusted-dispatch approach remains a separate design for required-check recovery; no job-rerun endpoint may be used as a fallback. Stage 1 stays fail-closed until the cross-run Check Run update is proven and every existing trust, approval, budget, and readiness gate passes.

The earlier attempt-bound plan's stale-job evidence question is resolved by the controlled test and PR #296. The standalone host still retains `run_attempt_write_binding_unavailable` until its capability gate is reconciled with the merged writer; this spec does not authorize host activation.

## Current GitHub and repository facts

- The current main-branch protection requires client and server from GitHub Actions App ID 15368, along with dependency-review, CodeQL, and GitGuardian Security Checks. Required checks are strict. These values were read from the live branch-protection API on 2026-10-08 and must be re-read before any future pilot.
- The current CI workflow has client and server checks. Its production-migrate job runs only on a push to main and uses the protected production environment and database secret. The Stage 1 retry workflow must be separate and must not contain or call that job.
- GitHub’s workflow-dispatch API accepts a branch or tag ref, requires Actions write permission, and returns the workflow run ID. The workflow file must exist on the default branch. Dispatching against main therefore provides a trusted workflow revision, but the host must still verify the run’s workflow ID, path, ref, and source SHA against trusted configuration.
- GitHub states that checks created by workflow_dispatch jobs do not satisfy PR required checks. Therefore the dispatcher’s own client/server jobs cannot make the PR green. The candidate below updates the original PR-created Check Run only after rerunning its exact verification successfully.
- The Checks API permits a GitHub App installation token with checks:write to update a specific Check Run. GITHUB_TOKEN is a GitHub App installation token. It is a reasonable inference that the Actions App token can update a Check Run that an earlier pull_request run created under the same App ID; GitHub’s docs do not explicitly confirm this cross-run case. Treat it as unproven until a controlled live pilot demonstrates that the same Check Run ID is updated and branch protection recognizes the result.

## Approaches considered

### A. Keep the job-specific rerun and test the stale-ID race

This changes the least code and preserves the native workflow result. PR #296 merged a writer bound to one attempt-scoped job ID after the controlled stale-ID test returned HTTP 403. That is evidence for the tested endpoint case, not authorization to enable the standalone host or proof of the complete trusted job graph.

### B. Dispatch a trusted verifier and update the existing required Check Run — selected

A reviewed main-branch workflow reruns the fixed verification for one approved required context at the exact current PR SHA. A separate, narrowly privileged publisher updates only the matching existing PR Check Run after success. This avoids selecting work through the old run’s job IDs and preserves the current required context and App identity. PR #295 classifies this as a high-risk action; the trusted workflow, exact host capability, and least-privilege App permissions still require separate implementation review.

### C. Publish a separate non-required Stage 1 result

This uses less authority and can report retry results, but it leaves the failed client or server requirement in place. It cannot complete required-check recovery, so it is not sufficient for this goal.

## Proposed architecture

### 1. Host selects and approves one exact retry target

The host starts from a fresh PR snapshot and derives, rather than trusts from caller input, the repository ID, PR number, base/head/merge tuple, effective SHA carrying the required check, required-check identity, and exact failed Check Run ID. The initial supported contexts are client and server from App ID 15368. Other required checks are out of scope.

The target Check Run must be the unique current completed failure for the selected context and effective SHA. The host must reject a fork, a non-main base, a changed PR tuple, a different App ID or context, an incomplete or ambiguous check listing, an active newer run, or any target that does not match the branch-protection evidence. A retry is eligible only when the existing failure classifier returns retry-check for a bounded flaky failure; infrastructure, protected, security, stale, and ambiguous results escalate without retry.

The one-use approval binds the exact repository, PR tuple, effective check SHA, check context, Check Run ID, trusted workflow identity, capability, expiry, and CI budget reservation. The canonical ciRunLimit remains 2. Reserve the budget before dispatch. A successful dispatch response must contain a run ID, which the host uses directly. If the outcome is ambiguous or the response lacks a valid run ID, consume the reservation and escalate; never issue another dispatch automatically or guess the run from a display name.

### 2. Dispatch a fixed workflow from main

Add a dedicated Stage 1 retry workflow on the default branch, separate from the production CI workflow. The host calls only the workflow-dispatch endpoint for that fixed workflow with ref main and the approved bounded inputs. The Stage 1 host’s Actions-write transport allowlist permits that exact endpoint and rejects job reruns, run reruns, cancellation, workflow enable/disable, and every other Actions write.

The dispatcher uses the workflow run ID returned by GitHub. It accepts a run only when the repository, workflow ID and path, main ref, workflow source SHA, actor identity, request ID, and immutable target fields match trusted host configuration and the one-use approval. A missing, duplicate, stale, or mismatched run is escalated without another write.

### 3. Run only the fixed verifier on the exact PR SHA

The verifier’s workflow source and job graph come from the reviewed main revision, not from the PR branch. It checks out the exact effective SHA selected from the current PR evidence and runs only the selected client or server verification. The verification commands must share reviewed definitions with normal CI so the two paths cannot silently drift; any reusable workflow or script is pinned to the trusted main revision.

The workflow contains no production-migrate job, protected environment, production secret, contents-write permission, Actions-write permission, or merge/push step. The verifier job receives read-only permissions and does not expose its token to PR code. Any test or build code from the PR runs only on an isolated hosted runner. The workflow must not download or execute artifacts from the failed run.

### 4. Update the exact existing Check Run only after success

The publishing job is separate from the verifier job and runs only after the selected verifier succeeds. It does not check out PR code, invoke unpinned actions, or consume artifacts. Its token has only the read permissions needed to revalidate the PR and Check Run plus checks:write.

Immediately before the write, the publisher fetches the PR and Check Run again. It requires the tuple and effective SHA to remain unchanged and the Check Run ID, context, App ID, SHA, and expected prior conclusion to remain exact. Its transport allowlist permits only the required read-only lookups and PATCH to that validated Check Run ID. It must not create a Check Run, create a Check Suite, rerequest a check, change repository preferences, or call another write endpoint.

On verifier success, it updates that same Check Run to success, keeps its name and SHA unchanged, and adds a bounded summary and a link to the trusted retry run. On verifier failure, timeout, cancellation, tuple drift, or API ambiguity, it does not publish success and does not try a different Check Run. The previous failed run and the new workflow run remain available as evidence.

Because the updater uses checks:write, this is a privileged required-check recovery capability. PR #295 now classifies `stage1_required_check_recovery` as high risk while preserving `branch_protection_bypass` as critical. That classification does not grant the capability or make the Stage 1 operation executable. Do not reuse Stage 0 publisher permission. The trusted host, exact authenticated approval, separate least-privilege App permissions, and all fail-closed gates remain mandatory. If future policy review classifies this operation as the critical `branch_protection_bypass`, it remains non-executable; do not rename the action to evade that result.

### 5. Host independently verifies completion

The host waits for the specific dispatched run and verifies its trusted workflow source, selected verifier job, tested SHA, and final conclusion. It then fetches the current PR tuple, the exact Check Run, required-check policy, and check observation again. It reports success only when the same target tuple is current, the exact original Check Run has the expected client/server name and App ID 15368 on the required SHA with a successful conclusion, and GitHub’s current required-check observation is green. A successful workflow run by itself is not completion evidence.

## Failure and concurrency behavior

- If the PR tuple or effective required SHA changes before publication, leave the old Check Run untouched and escalate against the new snapshot.
- If another attempt starts while the verifier runs, do not update an older Check Run unless the latest unique target still matches the approval. An update to a stale SHA cannot make a newer PR revision ready.
- If the verifier fails or is cancelled, preserve the failed required Check Run. Do not mark a required check successful based on a partial result, a skipped job, a classifier decision, or a successful dry-run.
- If dispatch or Check Run update has an ambiguous network outcome, consume the reserved budget, read current state, and escalate. Never repeat the write automatically.
- Never disable tests, typecheck, lint, dependency review, CodeQL, or security checks to obtain a green result.
- Keep packets and state bounded to IDs, SHA values, statuses, timestamps, budget, and reason codes. Do not store prompts, review bodies, credentials, signed URLs, or raw CI logs.

## Required gates before implementation or activation

1. **Policy classification completed in PR #295:** verify the merged policy revision before implementation. Any future policy change must be a separate reviewed run; the classification does not grant GitHub App permissions.
2. **Classification resolved as high risk in PR #295.** Preserve branch protection and refuse if a future scope cannot be constrained to one current Check Run ID or if policy classifies it as critical.
3. Review the complete trusted workflow graph, including reusable workflows, actions, dependency installation, job permissions, actor validation, and the isolated database service. Exclude the production migration and all deployment paths.
4. Verify that the actual dispatched run uses the approved main workflow SHA and that its verifier tests the exact current required SHA and only one allowlisted context.
5. In a separately approved, non-main live pilot using a naturally eligible flaky failure, prove that the Actions App can update the exact PR-created Check Run ID and that branch protection recognizes the updated result. Do not deliberately weaken or fail a security or test job to create this evidence.
6. Keep the trusted approver, host-managed persisted LoopState session, exact-path approval, one-use operation key, ciRunLimit 2, stop conditions, current tuple checks, and existing hosted readiness evidence as independent gates. Local fixtures do not count as live evidence.

Until all gates pass, Stage 1 remains disabled and the current CLI refusal remains correct. This design does not change policy, credentials, GitHub App installation, branch protection, workflows, main, production, or the live repository.

## Acceptance criteria for a later implementation

- The Stage 1 writer never calls either Actions job-rerun or run-rerun endpoint.
- Every dispatch is bound to one approved PR tuple, effective required SHA, context, Check Run ID, trusted workflow source, one-use approval, and reserved budget.
- Only the reviewed main workflow performs verification, and only against the exact approved SHA using the fixed client or server verifier.
- The publishing job cannot receive or execute PR-controlled code and can only update one validated existing Check Run through the exact PATCH route.
- No success is published after a failed, skipped, cancelled, stale, partial, or ambiguous verification.
- A live pilot confirms the original Check Run ID, its required context and App ID, and branch-protection result after update. The host independently observes the current tuple and required-check status before returning ready-for-human.
- The current refusal remains until every independent Stage 1 and hosted readiness gate is reviewed and available from trusted host configuration.

## References

- [Create a workflow dispatch event](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event) — accepted ref, Actions permission, and returned run ID.
- [Events that trigger workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_dispatch) — default-branch requirement and dispatch SHA/ref behavior.
- [Troubleshooting required status checks](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks) — latest SHA, merge-commit behavior, expected App, and workflow_dispatch checks not satisfying PR rules.
- [Update a check run](https://docs.github.com/en/rest/checks/runs#update-a-check-run) — update endpoint and checks:write permission.
- [GITHUB_TOKEN](https://docs.github.com/en/actions/concepts/security/github_token) — token is a GitHub App installation access token.
- [Required status checks API](https://docs.github.com/en/rest/branches/branch-protection#update-status-check-protection) — context and expected App identity.
