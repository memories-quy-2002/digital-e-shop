# Stage 1 Attempt-Bound Rerun Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` to implement this plan inline, task by task. Do not delegate. Steps use checkbox syntax for tracking.

> **Current status (2026-10-08):** PR #296 merged the attempt-scoped single-job writer, and the controlled test recorded in the maintained readiness report confirmed that a stale job ID receives HTTP 403 after a newer attempt becomes current. Tasks 1–2 below preserve the proposal as historical context; the standalone host still reports `run_attempt_write_binding_unavailable` until its capability gate is reconciled with the merged writer and all independent trust gates pass.

**Goal:** Bind any future Stage 1 retry to the exact failed job ID observed in the approved workflow run attempt, while keeping live reruns refused until the stale-job-ID race and every independent trust gate are resolved.

**Architecture:** Reuse the existing attempt-specific job observation and guarded Actions writer. Change the writer's target from a set of failed job IDs to exactly one approved root job and submit only to GitHub's job-rerun route. Keep the Stage 1 host's hard refusal in place; this plan does not activate reruns or configure credentials, permissions, policy, or hosted infrastructure.

**Tech Stack:** Node.js ESM, GitHub REST API, `node:test`, existing LoopState and PR evidence adapters.

## Global Constraints

- Preserve `ciRunLimit: 2`, one-use approval, exact PR tuple/source-SHA binding, and host-managed LoopState.
- Never call a live GitHub write during local tests or this plan's execution.
- Keep `run_attempt_write_binding_unavailable` until stale job-ID behavior is proven and independently reviewed.
- The rerun root is exactly one job ID from the attempt-specific jobs response; unknown or multiple roots refuse.
- The job endpoint reruns dependent jobs, so no live pilot until the complete trusted dependency closure is reviewed.
- Do not change GitHub App permissions, GitHub Actions configuration, hosted deployment, policy, `main`, or production.
- Code changes under `scripts/loop/**` require approval for that exact path scope before implementation.

---

## Files and ownership

- `scripts/loop/github-actions-write.mjs` — validates the approved attempt/job and constructs the single allowed POST URL.
- `scripts/loop/__tests__/github-actions-write.test.mjs` — verifies target identity, refusal behavior, budget accounting, and the exact URL without network access.
- `scripts/loop/pr-babysitter-stage1-host.mjs` — remains hard-blocked until external proof and all independent Stage 1 prerequisites are reviewed; do not remove the blocker in this plan.
- `docs/loop-engineering/stage1-cli-runbook.md` — documents the actual refusal and what evidence is required before promotion.
- `Wiki/concepts/loop-engineering.md` — update only if the writer contract changes; append the required Wiki log entry and bump `Wiki/index.md`.

## Task 1: Establish the stale-job-ID contract before enabling writes

**Files:** none.

**Interfaces:**
- Evidence source: official GitHub documentation/support, or a controlled test in an explicitly approved non-production repository/PR.
- Decision output: `proven_safe`, `proven_rejected`, or `unknown`; only the first two permit continuing to a reviewed implementation. `unknown` keeps Stage 1 disabled and triggers a separate design review of approach B.

- [ ] Record the current documented facts: attempt-specific job listing accepts `run_id` plus `attempt_number` and returns `id`, `run_id`, and `run_attempt`; job rerun accepts `job_id` and reruns that job plus dependents.
- [ ] Obtain evidence for the race where a newer attempt begins after approval but before a POST with the old `job_id`.
- [ ] Reject docs that only show unique job IDs or the endpoint path; neither states whether a stale ID is rejected or can affect a newer attempt.
- [ ] If the contract remains `unknown`, stop before code activation and prepare a separate design for a fixed trusted retry workflow. Do not infer safety from a final re-read.

**Current evidence:** GitHub's REST docs describe the two endpoints and their parameters, but do not specify stale job-ID behavior. The repository has observed different job IDs across attempts for one Stage 0 run; this does not prove the POST race. No live write has been attempted.

References: [list jobs for a workflow run attempt](https://docs.github.com/en/rest/actions/workflow-jobs#list-jobs-for-a-workflow-run-attempt), [re-run a job from a workflow run](https://docs.github.com/en/rest/actions/workflow-runs#re-run-a-job-from-a-workflow-run), and [re-running workflows and jobs](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs).

**Expected result:** a reviewable evidence record that resolves stale-ID behavior, or an explicit `unknown` result with Stage 1 still disabled.

## Task 2: Bind the guarded writer to one attempt-scoped root job

**Files:**
- Modify: `scripts/loop/github-actions-write.mjs`
- Test: `scripts/loop/__tests__/github-actions-write.test.mjs`

**Interfaces:**
- Consumes: existing target fields `runId`, `runAttempt`, `failedJobIds`, and the result of `getWorkflowRunJobs(runId, runAttempt)`.
- Produces: the same `rerunFailedJobs(input): Promise<RerunResult>` contract; a valid target has exactly one failed job ID and that ID is confirmed in the complete attempt-specific evidence.

- [ ] Add a regression test where `failedJobIds` contains two roots; expect refusal before token minting, budget reservation, and POST.
- [ ] Add a regression test where the target ID is absent, duplicated, or belongs to a different run/attempt; expect refusal and zero POST calls.
- [ ] Change target validation to require `failedJobIds.length === 1`; retain the approved ID in the existing action-attempt digest so duplicate approvals remain idempotent.
- [ ] Replace the run-level request URL with the exact job URL:

```js
const jobId = target.failedJobIds[0];
const url = API_ORIGIN + '/repos/' + encodeURIComponent(host.repository.owner) + '/'
  + encodeURIComponent(host.repository.name) + '/actions/jobs/' + jobId + '/rerun';
```

- [ ] Update the success test to assert `POST /repos/{owner}/{repo}/actions/jobs/{job_id}/rerun`, no request body, and the same one-use approval/budget ordering.
- [ ] Keep the run-attempt re-read, workflow attestation, PR tuple, and complete job-evidence checks. A race after the final read remains blocked unless Task 1 proves the remote contract.

Run: `node --test scripts/loop/__tests__/github-actions-write.test.mjs`

Expected: all focused tests pass; every mocked POST uses only the exact approved job ID; no test contacts GitHub.

## Task 3: Preserve the live refusal and document the operator result

**Files:**
- Modify only if the wording or behavior changed: `scripts/loop/pr-babysitter-stage1-host.mjs`, `docs/loop-engineering/stage1-cli-runbook.md`
- Test: `scripts/loop/__tests__/pr-babysitter-stage1-host.test.mjs`

**Interfaces:**
- `runPrBabysitterStage1({ argv, repoRoot, env, io })` continues returning a refusal with the current prerequisite list before reading credentials or making a network request.

- [ ] Keep `run_attempt_write_binding_unavailable` in `STAGE1_BLOCKERS` while Task 1 is unknown or the trusted dependent-job closure is absent.
- [ ] Keep the existing test asserting `stage1_prerequisites_unavailable`, the attempt-binding blocker, and zero network calls.
- [ ] If Task 1 later proves the contract, remove only this blocker in a separately reviewed implementation after the job graph, source attestation, approver, and persisted CI budget are also available; do not remove the global prerequisite refusal.
- [ ] Document that `rerun-flaky --dry-run` checks syntax only and that a real command currently refuses before authentication/network access.

Run: `node --test scripts/loop/__tests__/pr-babysitter-stage1-host.test.mjs`

Expected: all tests pass; the live command remains refused and no Actions write is attempted.

## Task 4: Verify the reviewed candidate without activating Stage 1

**Files:** no additional code files.

- [ ] Run `node --test scripts/loop/__tests__/github-actions-write.test.mjs scripts/loop/__tests__/pr-babysitter-stage1-host.test.mjs`.
- [ ] Run `node scripts/loop/verify.mjs` to verify the fixed Loop control-plane test list.
- [ ] Review `git diff --check` and confirm only the exact approved files changed.
- [ ] Confirm the Stage 1 command still refuses, the canonical CI budget remains `2`, and no credential, permission, workflow, policy, or production configuration changed.
- [ ] Open/update a PR for human review; do not merge it or run a live pilot automatically.

## Acceptance criteria

- A retry target identifies one job ID returned by the exact requested run attempt; the writer cannot silently widen it to all failed jobs.
- The only Actions write URL in the candidate is the job-specific rerun endpoint, with the exact approved ID.
- Missing, stale, mismatched, ambiguous, or multi-root job evidence causes refusal before POST.
- Ambiguous network outcomes remain budgeted and are never automatically retried.
- Stage 1 remains disabled until stale-ID semantics, dependent-job closure, source attestation, trusted approver, persisted budget session, hosted pilot selection, and all other runbook gates are reviewed.
- Human review and merge remain required.
