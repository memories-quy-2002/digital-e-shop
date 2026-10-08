# Stage 1 Trusted Dispatch Retry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Current status (2026-10-08):** PR #295 merged the `stage1_required_check_recovery` high-risk classification while preserving `branch_protection_bypass` as critical and `ciRunLimit: 2`. PR #296 merged the attempt-scoped single-job writer after a controlled stale-job-ID request returned HTTP 403. Phase A below is complete and must not be repeated. These changes do not grant GitHub App permissions or authorize a dispatch, Check Run update, or pilot. The labeled OIDC probe documented in the readiness report still returned `unavailable`; Stage 1 remains fail-closed.

**Goal:** Let a trusted Stage 1 host retry one eligible `client` or `server` required check against the exact current PR SHA, then recover only that original Check Run after the trusted verifier succeeds.

**Architecture:** First resolve the separate policy gate and merge that policy decision before starting a fresh implementation run. The implementation adds a one-use approved `workflow_dispatch` writer, a main-branch verifier that checks out PR code only as test input, and an isolated publisher that can PATCH only the exact previously failed required Check Run. The CLI stays fail-closed until trusted host configuration, budget state, permissions, and live evidence are independently available.

**Tech Stack:** Node.js ESM, GitHub REST API (`2026-03-10`), GitHub Actions, composite actions, existing LoopState budgets and PR evidence, `node:test`.

## Global Constraints

- The approved design is [Stage 1 trusted-dispatch retry](../specs/2026-10-08-stage1-trusted-dispatch-retry-design.md). This plan supersedes the implementation tasks in the older attempt-bound rerun plan; do not implement its job-rerun endpoint tasks.
- The current risk policy classifies every known action identifier as critical. Resolve the exact policy classification in a separate reviewed change before implementation. Keep `branch_protection_bypass` critical; if this recovery operation falls under it, stop and return to design rather than renaming or omitting the action.
- Do not modify policy and then execute Stage 1 under that changed policy in the same run. Merge an approved policy PR first, then start implementation from that merged revision in a fresh run.
- Keep `ciRunLimit: 2`, `maxFlakyRetries`, current tuple checks, one-use TTY approval, trusted approver identity, and host-managed persisted LoopState. Missing, corrupt, stale, or untrusted inputs refuse before a write.
- The initial target set is exactly `client` and `server`, from Actions App ID `15368`, on an open same-repository PR targeting `main`. Re-read branch protection and required-check identities before a future pilot; do not treat the 2026-10-08 snapshot as permanent configuration.
- The only Actions write is `POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches` for the fixed reviewed Stage 1 workflow, with `ref: main`. The current API version returns `workflow_run_id`; a missing or invalid ID is an uncertain outcome, consumes the reservation, and escalates. Never fall back to a run or job rerun endpoint or guess by workflow display name.
- The trusted workflow tests only the approved PR SHA and one allowlisted context. It has no production job, production environment, production secret, merge/push step, `contents: write`, or `actions: write`. It never downloads or executes artifacts from an earlier run. PR-controlled code runs only on an isolated hosted runner without secrets or write-capable tokens.
- The publisher runs in a separate job after verifier success, does not check out or execute PR code, and can only perform the required read-only lookups plus `PATCH` to the already-approved Check Run ID. It must preserve that run's name and SHA, and must not create checks/suites, re-request checks, change preferences, or call another write endpoint.
- A failed, skipped, cancelled, timed-out, stale, partial, duplicate, or ambiguous result never becomes a successful required check. Re-read the full PR tuple and required-check policy immediately before publishing and again before reporting completion.
- Keep all tests offline with mocked transports. Do not grant App permissions, change branch protection, dispatch a live workflow, update a live Check Run, or run a pilot without a later explicit authorization. A pilot must use a naturally eligible flaky failure and a non-main PR.
- Never disable tests, typecheck, lint, dependency review, CodeQL, or other security checks. Never push directly to `main` or merge a PR.

## Repository Map

- `scripts/loop/pr-babysitter-stage1-host.mjs` is the standalone fail-closed entrypoint. Its current refusal must remain whenever any trust or readiness gate is missing.
- `scripts/loop/pr-babysitter-cli.mjs` owns the shared `retry-check` decision and current attempt-bound approval flow. Integrate a distinct Stage 1 check-run target and dispatch adapter without changing the older Phase 2B rerun endpoint into a fallback.
- `scripts/loop/github-pr-client.mjs` already reads current PR tuples, changed files, check runs, workflow runs, required-check rules, and attempt-scoped jobs. Extend read-only evidence only where the exact Check Run or dispatched run cannot currently be independently observed.
- `scripts/loop/github-auth-provider.mjs` owns numeric approver authentication, exact one-use scopes, and repository-scoped capability tokens. Add a separate Stage 1 dispatch capability and scope; do not reuse `contents:write` or Stage 0 publisher authority.
- `scripts/loop/state.mjs` already persists bounded CI attempt reservations. Reuse its validated reservation/finish transitions and bind the key to the full PR tuple, required identity, Check Run ID, workflow identity, and request ID.
- `scripts/loop/__tests__/workflow.test.mjs`, `scripts/loop/verify.mjs`, and `.github/workflows/loop-foundation.yml` keep the workflow contract and fixed Loop Engineering test inventory reviewable.
- `.github/workflows/ci.yml` currently owns `client`, `server`, and `production-migrate`. Preserve the existing required job IDs and production-migration conditions while factoring shared verifier steps.
- `docs/loop-engineering/stage1-cli-runbook.md`, `docs/loop-engineering/stage1-readiness.md`, `Wiki/concepts/loop-engineering.md`, `Wiki/index.md`, and `Wiki/log.md` record operator gates and durable architecture.

---

## Phase A: Resolve the Policy Gate — completed in PR #295

### Task 1: Decide whether exact required-check recovery is executable

**Files for the separate policy proposal only:**

- Inspect: `.agent/policy/risk-rules.yml`, `.agent/policy/protected-paths.yml`, `.agent/policy/stop-conditions.yml`, `scripts/loop/policy.mjs`, `scripts/loop/classify-risk.mjs`, `AGENTS.md`
- If and only if separately approved: modify the minimum policy/schema files above and add focused coverage in `scripts/loop/__tests__/policy.test.mjs` and `scripts/loop/__tests__/classify-risk.test.mjs`.

**Interface:** The merged policy declares `stage1_required_check_recovery` as a distinct high-risk action and keeps `branch_protection_bypass` critical. That classification does not grant an executable write capability; the trusted host, exact authenticated approval, budget, permissions, workflow, and live-pilot gates below still apply.

- [x] Write and review the policy proposal for the exact capability; leave `criticalActions`, including `branch_protection_bypass`, unchanged.
- [x] Classify the operation as the distinct high-risk action `stage1_required_check_recovery`; exact authenticated approval remains a host requirement.
- [x] Preserve `ciRunLimit: 2` and all stop-condition values.
- [x] Run the policy and classifier tests in the policy-change run; PR #295's required CI passed.
- [x] Merge the policy change in PR #295, then start later implementation work from the merged revision.

**Result:** PR #295 merged the high-risk classification. It did not grant App permissions, enable a Stage 1 write, or replace any host approval or readiness gate.

## Phase B: Implement from the Reviewed Policy in a Fresh Run

### Task 2: Select one exact failed required Check Run

**Files:**

- Add: `scripts/loop/stage1-check-target.mjs`
- Add: `scripts/loop/__tests__/stage1-check-target.test.mjs`
- Modify only if required by missing normalized fields: `scripts/loop/github-pr-client.mjs`, `scripts/loop/__tests__/github-pr-client.test.mjs`

**Interface:** `selectUniqueStage1CheckTarget({ decision, prSnapshot, requiredCheckSnapshot, checkObservations, changedFiles, workflowRuns, trustedWorkflow })` returns one immutable target containing the exact PR tuple, effective tested SHA, context, App ID, numeric Check Run ID, trusted workflow ID/path/ref/source SHA, and a bounded unique request ID. Because the eligible PR base is `main`, bind the workflow source SHA to the fresh observed base SHA; the returned dispatch run must report that exact source SHA. It throws a stable refusal reason for every invalid or incomplete input.

- [ ] Add tests first for the only supported contexts (`client`, `server`) and App ID `15368`; derive the numeric ID only from a canonical `check:<id>` observation.
- [ ] Require `decision.action === 'retry-check'`, complete policy/check/file evidence, an open same-repository PR to `main`, and `testedSha` equal to the current head or merge SHA carrying the selected required context. Bind the trusted workflow source SHA to the same fresh `main` base SHA.
- [ ] Require exactly one current completed `failure` matching the required context, App ID, and tested SHA; reject duplicates, a mismatched app/context/SHA, pending or successful observations, and a missing or incomplete check listing.
- [ ] Reject fork PRs, non-main base refs, stale tuple changes, workflow/action-file modifications in the PR, unsupported required contexts, and active newer CI runs.
- [ ] Keep infrastructure, protected, security, stale, and ambiguous outcomes on the existing escalation path; only the bounded flaky classifier result may select a target.
- [ ] Confirm branch-protection evidence is complete and uniquely identifies the supported check. Do not infer an empty required-check policy.

Run: `node --test scripts/loop/__tests__/stage1-check-target.test.mjs scripts/loop/__tests__/github-pr-client.test.mjs`

**Expected result:** Every accepted target maps to one exact current Check Run and one supported required identity; all missing, duplicate, stale, or mismatched evidence refuses without a write.

### Task 3: Bind one-use approval to the retry and its later Check Run update

**Files:**

- Modify: `scripts/loop/github-auth-provider.mjs`
- Test: `scripts/loop/__tests__/github-auth-provider.test.mjs`
- Modify: `scripts/loop/stage1-prompt.mjs`
- Test: `scripts/loop/__tests__/stage1-prompt.test.mjs`

**Interface:** Add a distinct `stage1:required-check-recovery` approval capability. Its normalized, tagged target includes repository/PR tuple, effective SHA, `client` or `server`, App ID, exact Check Run ID, fixed trusted workflow identity, source SHA, and request ID. Its installation token requests only repository-scoped `actions:write` plus the minimum reads required by the host. The publisher's `checks:write` remains a separate workflow-job permission and is not granted to this host token.

- [ ] Add scope tests for exact field sets, SHA/ID formats, context/App-ID pair, workflow path/ref, and canonical request ID.
- [ ] Add tests that changing any tuple field, Check Run ID, workflow identity, capability, or request ID invalidates approval; consuming an approval twice fails.
- [ ] Add permission tests asserting Stage 1 token creation requests `actions:write` and no `contents:write` or `checks:write`.
- [ ] Update the TTY prompt to show the exact PR, tuple, context, Check Run ID, fixed workflow identity, resulting Check Run update, expiry, and CI budget. Cancellation remains the default.
- [ ] Keep trusted numeric approver IDs in host-owned configuration. CLI arguments, PR fields, environment-provided lists, and workflow inputs must not add or replace approvers.

Run: `node --test scripts/loop/__tests__/github-auth-provider.test.mjs scripts/loop/__tests__/stage1-prompt.test.mjs`

**Expected result:** One trusted human approval covers the full exact retry/recovery scope, and the host receives no checks-write or contents-write token.

### Task 4: Add a dispatch-only writer with budget reservation

**Files:**

- Add: `scripts/loop/stage1-dispatch-write.mjs`
- Add: `scripts/loop/__tests__/stage1-dispatch-write.test.mjs`
- Modify only if a safe shared read helper is needed: `scripts/loop/github-pr-client.mjs`, `scripts/loop/state.mjs`, and their focused tests

**Interface:** `dispatchStage1Retry({ host, decision, target, approval })` validates the private host context, re-reads the PR tuple/check/policy, consumes the matching approval once, reserves the validated LoopState CI attempt, and sends one POST to the configured workflow ID with `{ ref: 'main', inputs: targetFields }`. It requires GitHub's `200` response to contain a positive `workflow_run_id` from the `2026-03-10` API contract or returns an escalated reason code.

- [ ] Add transport tests that capture the exact URL, method, headers, API version, ref, and bounded inputs; mock all network responses.
- [ ] Permit no Actions write route except `POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches` for the fixed workflow ID. Reject run/job reruns, cancellation, enable/disable, and every other POST/PATCH/DELETE route before network I/O.
- [ ] Use the read-only PR adapter for revalidation. Do not use the Actions-write token for lookups or allow the write transport an arbitrary caller-provided URL.
- [ ] Reserve the CI budget before dispatch, and derive a stable attempt key from the complete target and request ID. Duplicate reservation never dispatches.
- [ ] Require the response to be successful and contain one positive safe `workflow_run_id`. Missing/malformed response, redirect, timeout, or network ambiguity is an uncertain outcome: keep the reservation consumed and escalate without retrying or guessing a run by name.
- [ ] Persist bounded status and identifiers only; never persist credentials, prompts, PR review bodies, or raw logs.

Run: `node --test scripts/loop/__tests__/stage1-dispatch-write.test.mjs scripts/loop/__tests__/state.test.mjs`

**Expected result:** The writer can issue only one fixed workflow dispatch for one approved target, and uncertain outcomes cannot cause an automatic duplicate.

### Task 5: Share verifier definitions and add the trusted retry workflow

**Files:**

- Add: `.github/actions/stage1-verify/action.yml`
- Add: `.github/workflows/stage1-trusted-retry.yml`
- Modify: `.github/workflows/ci.yml`
- Modify and test: `scripts/loop/__tests__/workflow.test.mjs`
- Keep the fixed test inventory in sync: `scripts/loop/verify.mjs`, `.github/workflows/loop-foundation.yml`

**Interface:** A reviewed shared verifier accepts only `context: client|server` and a source directory. The normal `client` and `server` jobs and the trusted retry workflow invoke the same pinned steps. The retry workflow is `workflow_dispatch`-only on `main`; it tests the exact approved PR SHA in a separate checkout path while its workflow/action source remains the reviewed main revision.

- [ ] Extract the existing `client` and `server` CI check commands without weakening them. Preserve their job IDs (`client`, `server`), required contexts, environment variables, MySQL service for server, and result semantics.
- [ ] Dispatch only when the repository is fixed, the event is `workflow_dispatch`, and `github.ref` is `refs/heads/main`. Validate actor and all bounded inputs against the fixed App identity, request ID, current main workflow source SHA, and approved target contract.
- [ ] Check out the trusted workflow source at its dispatch revision separately from the exact approved PR SHA. Pass the PR checkout only as the verifier's working source; do not let PR code define the workflow, shared action, job graph, or publisher.
- [ ] Use a separate verifier job with only `contents: read`, no secrets, and an isolated hosted runner. Keep the publisher in a later job with a separate permission block. No job has `actions:write` or production environment access.
- [ ] Do not add `production-migrate`, reuse the production CI job, or pass production secrets/environment. Keep CI's existing production-migration trigger/dependencies unchanged.
- [ ] Pin every external action used by the new workflow to a reviewed full commit SHA. Do not download or execute artifacts from any old workflow run.
- [ ] Assert statically that the retry workflow has only the fixed dispatch trigger, main-ref guard, exact verifier inputs, least-privilege job permissions, no production path, and a publisher dependency that requires verifier success.
- [ ] Add the new selector, writer, publisher, and workflow tests to the exact fixed control-plane list in both `scripts/loop/verify.mjs` and `.github/workflows/loop-foundation.yml`; keep `workflow.test.mjs`'s expected list in parity.

Run: `node --test scripts/loop/__tests__/workflow.test.mjs scripts/loop/__tests__/verify.test.mjs`

**Expected result:** Local/static tests prove the two required contexts share verifier steps and the dedicated workflow runs only trusted main definitions against the exact supplied SHA, with no production or write-capable verifier job.

### Task 6: Publish success only to the exact existing Check Run

**Files:**

- Add: `scripts/loop/stage1-check-run-publisher.mjs`
- Add: `scripts/loop/__tests__/stage1-check-run-publisher.test.mjs`
- Modify: `.github/workflows/stage1-trusted-retry.yml`
- Test: `scripts/loop/__tests__/workflow.test.mjs`

**Interface:** `publishVerifiedStage1Check({ token, repository, target, retryRunUrl, fetchImpl })` performs fixed-origin GET lookups, revalidates the current PR tuple, required-check policy, and exact Check Run's ID/name/App/SHA/prior `failure`, then sends one PATCH to `/repos/{owner}/{repo}/check-runs/{check_run_id}` with `conclusion: success` and bounded output.

- [ ] Add success-path tests proving the original Check Run ID, name, and SHA are retained and the summary/link is bounded and refers only to the trusted retry run.
- [ ] Add rejection tests for tuple drift, policy drift, mismatched ID/name/App/SHA, non-failure prior conclusion, verifier failure/skip/cancel, duplicate/active newer run, incomplete lookup, redirect, and ambiguous API response.
- [ ] Enforce the transport allowlist at the fetch boundary: only the exact read-only PR/required-policy/Check-Run lookups and `PATCH` to the single prevalidated Check Run ID are accepted. Reject check creation, suite creation, rerequest, preference changes, and every other write route.
- [ ] Keep this publisher in a separate job that does not check out PR code, download artifacts, run PR scripts, or use unpinned actions.
- [ ] Give only the publisher job the minimum `GITHUB_TOKEN` permissions needed for those reads and `checks: write`; never expose that token to the verifier or test process.
- [ ] Make the job depend on verifier success. A failed, skipped, cancelled, or timed-out verifier must leave the original required Check Run unchanged.

Run: `node --test scripts/loop/__tests__/stage1-check-run-publisher.test.mjs scripts/loop/__tests__/workflow.test.mjs`

**Expected result:** A successful fixed verifier can update only the exact approved prior failure; every other state is a no-op/escalation.

### Task 7: Wait for the returned run and independently verify completion

**Files:**

- Add: `scripts/loop/stage1-retry-observer.mjs`
- Add: `scripts/loop/__tests__/stage1-retry-observer.test.mjs`
- Modify: `scripts/loop/github-pr-client.mjs`, `scripts/loop/__tests__/github-pr-client.test.mjs`
- Modify: `scripts/loop/pr-babysitter-cli.mjs`, `scripts/loop/__tests__/pr-babysitter-cli.test.mjs`
- Modify: `scripts/loop/pr-babysitter-stage1-host.mjs`, `scripts/loop/__tests__/pr-babysitter-stage1-host.test.mjs`

**Interface:** The Stage 1 host observes the exact `workflow_run_id` returned by dispatch, using read-only credentials. It returns `ready-for-human` only when the current PR tuple and policy still match, the trusted workflow ID/path/ref/source SHA and actor match the approved dispatch, the selected verifier and publisher jobs both completed successfully, the exact original Check Run is now successful under the required context/App/SHA, and all required checks are green.

- [ ] Add a read-only run-by-ID adapter that returns complete normalized repository, workflow ID/path, event, ref, source SHA, actor, status, conclusion, and job evidence. Missing fields remain unavailable; do not infer source SHA from the tested SHA, display name, or path alone.
- [ ] Poll only the returned run ID with a finite timeout bounded by the validated host run budget. Require its workflow source SHA to match the approved fresh `main` base SHA, separately from the PR `testedSha`. On timeout, stale tuple, source mismatch, failed/skipped/cancelled job, incomplete API evidence, or publisher ambiguity, escalate and never dispatch again automatically.
- [ ] Recollect PR/check evidence after completion and compare the full base/head/merge tuple, required policy fingerprint, exact check ID, context, App ID, and tested SHA with the original approval.
- [ ] Keep the standalone Stage 1 CLI's early refusal if any host-owned trust config, numeric approver, persisted LoopState session, reviewed workflow identity, App permission, or readiness gate is unavailable. Caller environment variables and CLI inputs cannot manufacture these values.
- [ ] Add tests for exact run ID binding, workflow source/actor/job mismatch, tuple drift, pending-to-complete polling, budget timeout, and green required-check re-observation.

Run: `node --test scripts/loop/__tests__/stage1-retry-observer.test.mjs scripts/loop/__tests__/github-pr-client.test.mjs scripts/loop/__tests__/pr-babysitter-cli.test.mjs scripts/loop/__tests__/pr-babysitter-stage1-host.test.mjs`

**Expected result:** The host reports success only from fresh, tuple-bound GitHub evidence for the run returned by the dispatch response; a green workflow alone is insufficient.

### Task 8: Update the runbooks and durable Loop Engineering knowledge

**Files:**

- Modify: `docs/loop-engineering/stage1-cli-runbook.md`
- Modify: `docs/loop-engineering/stage1-readiness.md`
- Modify: `Wiki/concepts/loop-engineering.md`
- Modify: `Wiki/index.md`
- Append one entry to: `Wiki/log.md`

- [ ] Document the fixed dispatch endpoint, exact target fields, source identity, check-run publisher boundary, current refusals, and operator interpretation of submitted/wait/escalated results.
- [ ] Preserve all gates not solved by the code: trusted host runtime/configuration, App actions-write permission, authenticated approver, persisted budget session, current branch-protection evidence, cross-run Check Run update behavior, hosted readiness evidence, and live pilot authorization.
- [ ] State explicitly that the code and mocked tests do not prove GitHub accepts a cross-run update or that branch protection recognizes it.
- [ ] Update the readiness table only with evidence actually collected; leave live/promotion gates blocked until independently observed.
- [ ] Bump the Wiki index date and append one concise Wiki log line. Do not copy implementation source into the Wiki.

Run: `git diff --check`

**Expected result:** Operators can distinguish local implementation readiness from authorization and live Stage 1 success.

### Task 9: Verify, review, and hand off without activating Stage 1

**Files:** No additional source files.

- [ ] Run focused tests for target selection, auth/prompt, dispatch writer, publisher, observer, Stage 1 host/CLI, workflow contract, and LoopState.
- [ ] Run `node scripts/loop/verify.mjs --mode fast --changed scripts/loop/stage1-check-target.mjs --changed scripts/loop/stage1-dispatch-write.mjs --changed scripts/loop/stage1-check-run-publisher.mjs --changed scripts/loop/stage1-retry-observer.mjs --changed scripts/loop/pr-babysitter-stage1-host.mjs --changed scripts/loop/pr-babysitter-cli.mjs --changed scripts/loop/github-auth-provider.mjs --changed scripts/loop/github-pr-client.mjs --changed .github/actions/stage1-verify/action.yml --changed .github/workflows/ci.yml --changed .github/workflows/stage1-trusted-retry.yml --changed docs/loop-engineering/stage1-cli-runbook.md --changed docs/loop-engineering/stage1-readiness.md --changed Wiki/concepts/loop-engineering.md`.
- [ ] Run `node scripts/loop/verify.mjs --dry-run --mode full --changed .github/workflows/stage1-trusted-retry.yml --changed scripts/loop/stage1-check-run-publisher.mjs` and confirm it reports all required external checks for the changed CI surface.
- [ ] Review the entire diff, exact policy revision, check names, workflow action pins, token permission boundaries, server test database isolation, and tests proving zero live network writes.
- [ ] Confirm `ciRunLimit` remains `2`, `branch_protection_bypass` remains critical, no production workflow/secret/environment entered the retry path, and Stage 1 still refuses if any trusted prerequisite is missing.
- [ ] Run the PR's hosted required checks from a clean checkout. Do not call that evidence a live Stage 1 pilot.
- [ ] Open a PR to `main` for human review. Do not merge, dispatch the retry workflow, patch a Check Run, update App permissions, or run a pilot in this implementation run.

**Expected result:** A reviewed implementation PR with passing local and hosted checks, Stage 1 still gated, and a separate list of remaining live evidence gates.

## Separate Post-Merge Pilot Gate

The implementation is not a successful Stage 1 pilot. After its PR is reviewed and merged, begin a fresh run, re-read current policy/branch protection/App permissions and the full readiness evidence, and request explicit authorization for one non-main pilot using a naturally eligible flaky failure. The pilot must prove that the original Check Run ID was updated by the Actions App and that branch protection recognizes that exact result. If GitHub rejects the cross-run update, or identity/current-state evidence is incomplete, keep Stage 1 disabled and return to design. Never create an artificial failure or weaken a check to obtain pilot evidence.

## Final Acceptance Criteria

- The Stage 1 host never calls an Actions run-rerun or job-rerun endpoint.
- Every dispatch uses the fixed workflow ID, `main` ref, one exact approved target, one-use approval, trusted workflow source, and a reserved finite CI budget.
- The workflow verifies exactly one supported client/server context against the exact current PR SHA using the same reviewed check definitions as normal CI.
- The publisher cannot execute PR code and can only PATCH the prevalidated existing Check Run after verifier success.
- All drift, mismatch, incomplete, failed, skipped, cancelled, stale, timeout, or ambiguous outcomes fail closed and cannot publish a required-check success.
- The host independently observes the returned workflow run, trusted source identity, verifier/publisher results, current PR tuple, exact Check Run identity, and current required-check status before returning `ready-for-human`.
- No local test is counted as live GitHub evidence; no pilot or Stage 1 activation occurs without the separate post-merge approval and every readiness gate.
