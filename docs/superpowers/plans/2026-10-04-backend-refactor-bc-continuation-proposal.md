# Backend B/C continuation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. The maintainer approved the per-deliverable native execution amendment in this chat on 2026-10-04; preserve the stopped run's history and cumulative counts.

**Goal:** Finish B2–B4 and C1–C3 with equivalent API, transaction, inventory, and notification behavior.

**Architecture:** Preserve the approved feature-local extraction. OrdersRepository owns transaction SQL; a required cancellation provider owns cancellation orchestration; the public order facade owns post-commit notifications. Query changes preserve filters and analytics freshness.

**Tech Stack:** Existing NestJS, TypeScript, MySQL2, Vitest; no dependency changes.

**Spec:** `docs/superpowers/specs/2026-10-03-backend-refactor-design.md`; technical task contracts remain in the original B/C plans.

## Current evidence and execution decision

At inspection, HEAD is `7011d48c458f126b7f44598a1ab86b0c9768b99f`, on `codex/stage0-token-diagnostics`. A and B1 are uncommitted; unrelated client/Loop changes also exist.

The task-owned tracked implementation/Wiki diff is 855 added/deleted lines. The new product repository test has 80 lines. Implementation/Wiki therefore total 935 lines. The existing four spec/plan artifacts add 458 lines, for 1,393 total before this proposal. The previous 921/1,265 estimates excluded blank lines and were not full diff counts.

The original B/C plans require cumulative bounds and forbid resetting or committing to bypass them. `.loop/state/` is absent. This proposal does not amend those documents, canonical policy, or state; product implementation remains stopped under their present execution contract.

**Approved decision (2026-10-04):** native implementation in this chat for the exact paths below; the original plans' single cumulative execution envelope is superseded by deliverables bounded at 25 files / 1,000 added+deleted lines each. Record both each deliverable's delta against a sampled baseline and the complete cumulative task diff; never erase earlier counts or present the whole refactor as under 1,000 lines. Preserve the original retry limits. Any deliverable exceeding its envelope stops for another concrete decision.

This decision would be an explicit task execution amendment, not a claim that the old run was compliant or that a Loop approval exists. It grants no guarded repair-session, policy, state, commit, push, merge, migration, or deployment permission. If repository governance requires a trusted Loop host even for native work, obtain its authenticated exact-path approval and valid state first; do not fabricate either.

## Global Constraints

- Preserve all public contracts and security checks from the approved spec.
- Use the caller's TransactionContext for every participating repository operation; preserve lock order, conditional writes, rollback, and after-commit side effects.
- No new dependencies, schema changes, production operations, commits, or pushes.
- Leave payments, auth, guards, inventory implementation, Loop infrastructure, and unrelated changes untouched.
- Database integration requires independently verified isolation; no seed/reset/migration to make tests pass.
- Native implementation stays in the already authorized feature workspace unless safe isolation is separately established; do not copy unrelated work or switch its branch.
- The reviewable proposal itself is documentation only; saving it is not starting another product repair run.

## Exact proposed ownership

- `server/src/orders/orders.service.ts`, `orders.repository.ts`, `orders.types.ts`, `orders.module.ts`.
- Create `server/src/orders/orders.snapshot.ts`, `orders.errors.ts`, `orders-cancellation.service.ts`.
- `server/src/orders/__tests__/orders.repository.test.ts`, `orders.lifecycle.test.ts`, `orders.alerts.test.ts`, `orders.payos.finalization.test.ts`, `guest-purchase.test.ts`, `orders.integration.test.ts`.
- `server/src/products/products.repository.ts`, `server/src/products/__tests__/products.repository.test.ts`, `products.controller.test.ts`.
- `server/src/analytics/analytics.service.ts`, `server/src/analytics/__tests__/analytics.service.test.ts`.
- `Wiki/architecture.md`, `Wiki/index.md`, `Wiki/log.md`; status-only updates to the original spec and B/C plans when their actual acceptance criteria are met.

## Review Focus

1. Null/malformed historical snapshots, structured attributes, and zero sale prices retain their exact mapping.
2. PayOS duplicate finalization, reservations, guest privacy, and VND ledger fields remain equivalent.
3. Cancellation restores once, rolls back movement/alert/timeline failures, and notifies only after commit.
4. Count/list membership and attribute parameter order remain identical.
5. Overlapping analytics errors release the pending entry; every caller receives a separate fresh mapping.

## Deliverables and gates

The original task interface signatures and assertions are incorporated by reference; they are not replaced with broader abstractions. Before each deliverable, measure its estimated delta and confirm it fits the envelope. Baselines capture existing dirty files; verification is provisional if another task changes the sampled workspace.

- [x] **B2 — snapshot extraction:** snapshot, guest-purchase, and PayOS tests passed.
- [x] **B3a — payment/finalization SQL:** transaction repository tests pin VND fields, duplicate lookup, supplied-transaction use, and rejection propagation.
- [x] **B3b — lifecycle SQL:** lifecycle repository methods added; OrdersService has no remaining transaction SQL; lifecycle/alert/transaction tests passed. C3 subsequently replaces the interim per-item product-lock reads.
- [x] **B4 — cancellation provider:** compatibility error export and required provider/module registration added; constructor fixtures and post-commit/ownership/repeat-cancel tests updated; Wiki updated.
- [x] **C1 — filtered count:** identity/filter joins separated from projection joins; parameter ordering, aggregate absence, count/list predicate parity, and errors covered by tests.
- [x] **C2 — pending analytics reads:** only in-flight rows are shared by canonical range, with retry/freshness/independent-mapping tests; Wiki updated.
- [x] **C3 — bulk cancellation locks:** one sorted, deduplicated lock query and sequential duplicate-item stock/movement/alert handling; missing product and zero-affected-row tests added.
- [x] **Final local gate:** server tests, typecheck, lint, and build passed; fresh Luna reviewer found no actionable issues. Isolated MySQL integration, EXPLAIN, concurrency/rollback proof, hosted CI, and latency measurements remain unverified because `127.0.0.1:3307` refused connections.

## Completion ledger

Current staged task diff: 2,432 changed lines across the selected backend, Wiki, and plan/spec paths. This cumulative number is not subject to the per-deliverable reset and is not claimed to be under 1,000.

Recorded B2–B4 deltas: B2 4 files / 136 changed lines; B3a 5 / 172; B3b 6 / 170; B4 12 / 257. C1 is 2 files / 45 changed lines; C2 is 4 files / 87; C3 is 6 files / approximately 120. C1–C3 values are reconstructed from scoped source/test/Wiki changes after the fact; separate pre-deliverable snapshots were not retained, so those counts are not presented as snapshot-verified. Every deliverable is comfortably below its approved 1,000-line envelope. The full task is cumulative and is not claimed to be below 1,000 lines; the earlier baseline was 1,393 changed lines, before these deliverables.

Changed-path scopes are the corresponding `Files` sections of the B and C plans: B2 (`orders.snapshot.ts`, `orders.service.ts`, repository tests, and this status document); B3a (OrdersRepository/service/types plus repository and PayOS tests); B3b (repository/service/types plus repository, lifecycle, and alert tests); B4 (cancellation/error providers, module/facade, lifecycle/alert/PayOS/guest/integration tests, and three Wiki pages); C1 (product repository and its repository test); C2 (analytics service/test and Wiki architecture/log); C3 (order repository/cancellation provider, repository/lifecycle tests, and Wiki architecture/log). No unrelated workspace changes are included in these deliverable counts.

Run the task-specific selectors from the original plans with `pnpm --dir server exec vitest run ...`; existing package-local binaries are the installation-free fallback. For the final gate use server `typecheck`, `lint`, `test -- --run`, and `build` scripts. Run `test:integration` only with isolated-target evidence.

## Completion contract

- Each deliverable records its sampled baseline, complete changed-file list, added/deleted line count, tests, and deviations without resetting the earlier stopped run.
- B3 completes only when extracted SQL is absent from OrdersService; B4 includes required dependency resolution and every constructor fixture.
- C reports SQL/query-count evidence separately from measured latency. Missing MySQL evidence does not become a speed or rollback claim.
- Preserve the old ledger and historical budget stop; update plan checkboxes only for criteria actually demonstrated.
- Implementation uses direct human-authorized native edits, not the Phase 1 controller or a Phase 2B repair session. No Loop state or host approval is fabricated. The approved amendment governs these deliverables, while canonical Loop policy stays unchanged.
