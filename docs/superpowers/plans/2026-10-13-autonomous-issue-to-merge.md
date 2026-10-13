# Autonomous Issue-to-Merge Engineering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend Loop Engineering so an explicitly authorized GitHub Issue can run through isolated coding, deterministic verification, PR delivery, bounded repair, policy-gated merge, and verified completion reporting.

**Architecture:** Keep the existing Cloudflare Worker as a trusted, lightweight control plane for webhook validation, durable task metadata, queue delivery, leases, and reconciliation. Keep coding and verification in an isolated runner that receives only bounded task references and scoped capabilities. Reuse the existing policy, TaskRecord reducer, LoopState verifier, GitHub App adapters, PR Babysitter, and repair-session boundaries; add no second policy or state machine.

**Tech Stack:** Node.js 24.20.x, TypeScript, Cloudflare Workers Queues and D1, GitHub App webhooks/API, existing Loop Engineering modules, `node:test`, Vitest, Wrangler.

**Spec:** `prompt.md` (Autonomous Issue-to-Merge Engineering request)

## Current State and Gap Analysis

- Present: canonical autonomy policy loader bound to committed policy bytes; policy defaults to disabled and auto-merge disabled.
- Present: strict TaskRecord v2 contract and deterministic lifecycle/budget reducer on `feature/autonomous-task-lifecycle`.
- Present: Stage 0 signed webhook ingress, D1 delivery deduplication, Queue consumer, leases, and scheduled reconciliation. The webhook currently accepts only pull-request and check-run events; the PR consumer must remain separate from task execution.
- Present: PR observation, trusted Stage 1 rerun, isolated local repair session, fixed verification, and revision/fingerprint-bound evidence.
- Present in this worktree: durable TaskRecord storage/CAS leases and signed Issue authorization/opt-in ingress with canonical policy loaded at the default branch's immutable commit SHA, digest-only TaskRecord creation, and a separate metadata-only task Queue producer.
- Missing: isolated runner protocol, task-to-code orchestration, task Queue consumer, branch delivery, CI repair integration, merge controller, and end-to-end completion evidence.
- Security boundary: no issue body or raw prompt in TaskRecord, queue payloads, or LoopState; persist only bounded identifiers, digests, status, and evidence references. Policy stays disabled until independently reviewed live gates are met.

## Global Constraints

- Never modify or push directly to `main`; use a focused branch and reviewed PR.
- Keep `.agent/policy/autonomy.yml` disabled by default and preserve human approval for protected/high-risk paths.
- GitHub Issues, PR text, workflow output, repository files, and patches are untrusted inputs.
- Keep raw issue text and credentials out of durable task state, logs, queues, and agent capability context.
- All state transitions use the existing TaskRecord v2 reducer and optimistic version checks; host persistence must be atomic.
- Only deterministic fixed verification may authorize progress; evidence binds to exact revision and workspace snapshot.
- Never enable auto-merge or claim live readiness without review, current checks, repository rules, and controlled end-to-end evidence.

## Review Focus

1. Duplicate webhook delivery and concurrent issue events must create at most one active task and one lease.
2. Reused delivery/task identifiers with mismatched repository or issue metadata must fail closed.
3. Stale version, attempt, epoch, or expired lease owners must not overwrite current task state.
4. Issue text and prompt material must not enter TaskRecord, D1 diagnostics, Queue payloads, or logs.
5. Disabled policy, unauthorized actor, missing opt-in, protected paths, and unknown verification evidence must not start coding, writing, or merging.

---

## Milestones and Tasks

### Milestone 1 — Foundation audit and gap analysis

- [x] Audit the current policy, TaskRecord/lifecycle reducer, Stage 0 Worker, D1 delivery/lease patterns, PR Babysitter, repair session, and maintained Loop guide.
- [x] Record the architecture gaps and rollout boundaries in this plan.
- [x] Confirm plan coverage against Phase A–H and acceptance/negative scenarios in `prompt.md`; runner, delivery, repair, merge, reporting, and live-pilot gates have explicit tasks below.

### Milestone 2 — Task-to-code execution

#### Task 1 — Durable TaskRecord storage and execution leases

**Files:**
- Modify `scripts/loop/hosted/cloudflare/migrations/` with an additive task schema migration.
- Modify `scripts/loop/hosted/cloudflare/src/storage/d1.ts` with strict TaskRecord persistence, version compare-and-swap, and task lease methods.
- Test `scripts/loop/hosted/cloudflare/test/d1-storage.test.ts` with duplicate, corrupt, stale-version, lease-contention, expiry, and owner-mismatch cases.

**Acceptance:** D1 round-trips only validated TaskRecord v2; concurrent updates with a stale version are refused; one live lease owner at a time; expired leases may be reclaimed; leases can only be released by their current owner.

- [x] Add failing D1 storage tests for TaskRecord create/load/versioned update and lease ownership/expiry.
- [x] Run focused Worker tests and verify the new cases fail before implementation.
- [x] Add the additive migration and storage methods reusing `validateTaskRecord`.
- [x] Run focused D1 tests and TypeScript typecheck.

#### Task 2 — Issue webhook authorization and idempotent task creation

**Files:** `scripts/loop/hosted/cloudflare/src/handlers/webhook.ts`, `src/storage/d1.ts`, Worker bindings/config, and focused webhook/D1 tests.

**Acceptance:** Accept only authenticated `issues` opened/opt-in-label events for the configured repository, exact eligible numeric actor IDs, enabled canonical policy, and explicit opt-in label. Store task metadata/digest only; duplicate deliveries return accepted without duplicate task creation. Keep PR/check routing unchanged. Missing or stale policy identity fails closed.

- [x] Add signature-valid tests for accepted opt-in, missing label, wrong actor/repository, disabled policy, unsupported action, oversized/invalid payload, and duplicate delivery.
- [x] Add a compact task-ingress queue envelope containing stable IDs and policy/source revisions only.
- [x] Implement idempotent D1 task creation and queue send; return bounded reason codes without body text.
- [x] Verify Stage 0 PR/check behavior remains unchanged and run Cloudflare Worker tests/typecheck.

#### Task 3 — Runner protocol and isolated task execution

**Files:** new `scripts/loop/runner/` protocol and host adapter modules, contract tests, policy configuration, and operator docs.

**Acceptance:** Runner receives a sanitized task packet, creates an isolated worktree, uses least-privilege credentials, requests model/repair reservations before each operation, returns only a bounded patch/result, and cannot push, merge, or change policy. Runner absence or crash leaves resumable/escalated state without code changes.

- [x] Define strict transient request/result schemas and capability allowlists.
- [x] Add tests for untrusted prompt context, path escapes, oversized outputs, timeouts, concurrency, duplicate tasks, cancellation, and bounded runner interruption results.
- [x] Add a provider-neutral host coordinator with budget-before-start, deadline, cancellation, concurrency, duplicate-task, and bounded-result gates.
- [x] Add an operator-owned OS/container adapter and bind model reservations, outcomes, and reducer updates to TaskRecord/D1 lease compare-and-save. Do not use the current same-host Codex CLI as the Issue executor because it can read host files and credentials.
- [x] Add a bounded Cloudflare Queue handler, authenticated host dispatch/status runtime, fresh Issue digest and policy checks before dispatch, and supervisor-verified lease recovery. The consumer and private runner service binding are not provisioned in Wrangler yet.
- [ ] Resume an existing task worktree automatically after restart; current recovery refuses to reset or reuse an unverified worktree.
- [x] Add the clean detached worktree primitive and document credential isolation/recovery prerequisites.

### Milestone 3 — Automated GitHub delivery

#### Task 4 — Fixed verification and branch/PR delivery

**Acceptance:** Run immutable verifier commands in the isolated checkout; bind results to revision and workspace fingerprint; commit/push only after exact-path approval and fresh scoped token; create/update a PR targeting `main`, linking the Issue and reporting real checks.

- [x] Reuse canonical risk classification, fixed full verifier evidence, App capabilities, and exact-path approval before commit/push/PR writes.
- [x] Add delivery idempotency and stale-head checks; never force-push or target non-main branches implicitly.
- [x] Add integration fixtures for partial failures, duplicate requests, and ambiguous API outcomes.

### Milestone 4 — Autonomous failure recovery

#### Task 5 — Bounded CI observation and repair

**Acceptance:** Reuse PR Babysitter and trusted Stage 1 evidence; repair only deterministic branch-caused failures; classify flaky/infrastructure/unavailable states; enforce finite attempt/token/time/CI budgets and stop conditions; resume from persisted state.

- [x] Connect fresh PR/check snapshots to TaskRecord decisions using lease-bound optimistic revisions and fresh tuple rechecks.
- [ ] Wire trusted Actions rerun and workspace repair executors; the current runtime reports action-required and fails closed without those capabilities.
- [x] Test stale SHA, finite budgets, repeated failures, non-progress, and missing reservation evidence.

### Milestone 5 — Policy-governed auto-merge

#### Task 6 — Merge eligibility and authorized merge capability

**Acceptance:** A trusted merge controller independently fetches branch rules, reviews, required checks, current PR tuple and policy. It permits native auto-merge only for explicitly eligible scope, all current checks/reviews satisfied, and no approval/security blocker. Never impersonate an independent reviewer or bypass protection.

- [x] Define merge eligibility from trusted snapshots, independently observed changed paths, rules, checks, and human review—not model output.
- [x] Keep merge disabled by default; bind a future merge authorization to the exact PR tuple and path scope.
- [ ] Add a native auto-merge writer in a separately reviewed run after policy grants that capability.
- [x] Test stale SHA, missing review, unresolved thread, policy conflict, high risk, and required-check failures.

### Milestone 6 — Reliability and production readiness

#### Task 7 — Reconciliation, completion reporting, and live pilot

**Acceptance:** Recover expired task/runner leases, reconcile queue/D1/PR state, write a completion report only after confirming merged state and SHA, and demonstrate one controlled real Issue-to-merge run plus required negative scenarios. Unit tests/mocks alone do not complete this milestone.

- [x] Add bounded scheduled TaskRecord reconciliation and refuse recovery unless the runner supervisor proves termination.
- [x] Build a bounded completion report with issue, PR, confirmed merge SHA, required checks, retries, and final state; require a fresh one-use host completion proof to enter `completed`.
- [ ] Publish the completion report to the Issue through a separately scoped, exact-route capability.
- [ ] Run security review, full Loop/Worker suite, hosted CI, and controlled non-production end-to-end pilot.
- [ ] Record exact live evidence and leave production autonomy/auto-merge disabled until separate approval.

## Current Execution Record

- The TaskRecord v2 lifecycle contract is present in commits `194b514`, `ad4559a`, and `1279361`; its focused lifecycle/contract tests passed 13/13 on the fetched branch snapshot.
- Task 1 is implemented in `0002_task_records.sql` and the D1 adapter: validated persistence, version compare-and-save, and owner-bound expiring leases. Task 2 groundwork now includes a fail-closed Issue authorizer/task factory and idempotent D1 creation for one Issue generation.
- Task 1 focused D1 tests (9/9), current Cloudflare Worker suite (99/99), package typecheck, Wrangler production dry-run bundle, and focused TaskRecord/Issue/runner tests pass.
- The full Loop suite ran 439 tests: 437 passed and 2 failed because local Stage 1 trust configuration returned `app_key_path_rejected` instead of the test's expected missing-trust reason; the repair-session test then failed its fixed verifier because that same full Loop test suite was not green. Neither failure touches changed files.
- The full Loop suite used Node `24.19.0`; this checkout pins Node `24.20.0`, which is not installed in the available runtime paths.
- Task 2 is implemented in the worktree: signed webhook routing, immutable-SHA canonical policy loading, D1 task idempotency, and a separate Queue producer are covered by tests. Task 3 now has a provider-neutral runner coordinator. It reserves model budget before execution, bounds concurrency and wall-clock time, cancels on timeout/interruption, holds the task slot if termination cannot be confirmed, and validates only the strict bounded result contract. Focused runner/task protocol tests pass. The actual isolated executor, TaskRecord reservation/outcome persistence, recovery path, and Queue consumer remain unimplemented. Codex CLI is present; its `workspace-write` sandbox allows reads outside the worktree, so it is not an acceptable Issue executor on this host. A dedicated OS/container identity and credential broker are required before model execution. No PR delivery, autonomous repair, merge, or end-to-end live evidence exists yet.
- Task 3 verification update: focused TaskRecord/ingress/protocol/worktree/host tests pass 30/30; Cloudflare Worker tests pass 99/99 and typecheck passes. The current full Loop suite ran 450 tests on Node `24.14.0`: 448 passed, with the same two unrelated Stage 1 trust-path and dependent repair-session failures noted above. This checkout pins Node `24.20.0`, which is unavailable in the active runtime.
- 2026-10-13 orchestration update: Tasks 1–2 remain implemented with signed Issue ingress, digest-only TaskRecord creation, D1 version CAS, and lease fencing. Task 3 now includes a pinned Docker image/adapter, bounded model broker protocol, exact-path patch application, a TaskSession, pipeline integration, and Queue dispatch/status handlers. Task 4 now has idempotent Issue-to-PR delivery and an authenticated host runtime; Task 5–6 have evidence-driven CI/merge gates; Task 7 has bounded reconciliation and a one-use completion proof. Remaining source gaps are automatic worktree resume, live rerun/repair executors, native merge writer, Issue completion-comment writer, and production Worker-to-host service binding. Autonomy and auto-merge stay disabled. Final full local verification on pinned Node 24.20.0 passed all executable checks: Loop suite 496 passed/0 failed/2 skipped out of 498, Cloudflare Worker suite 109/109 passed, and Cloudflare typecheck passed. The verifier correctly reports `complete: false` and exits nonzero because required hosted `github-ci`, `dependency-review`, and `codeql` checks were not obtained; no hosted CI or controlled end-to-end pilot was run. Revision and workspace fingerprint remained stable during verification. `git diff --check` passes. No API key or paid API call, GitHub write, push, merge, or deployment was used.
