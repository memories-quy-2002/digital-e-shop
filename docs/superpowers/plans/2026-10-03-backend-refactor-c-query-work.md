# Backend query work Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove unnecessary count joins, share overlapping analytics reads, and reduce cancellation product-lock round trips while preserving behavior.

**Architecture:** Product count shares only identity/filter joins with listing. AnalyticsService shares pending repository-row promises per validated range and maps a separate response per caller. The cancellation provider uses a bulk-lock repository method and retains per-item checked writes.

**Tech Stack:** Existing TypeScript, NestJS, MySQL2, Vitest; Node 24.20.0 / pnpm 12.4.2.

**Spec:** `docs/superpowers/specs/2026-10-03-backend-refactor-design.md`, Batch C; cancellation consumes Plan B Task 4.

## Global Constraints

- No new dependencies, schema changes, production operations, commits, or pushes.
- Preserve routes, aliases, payload keys, HTTP statuses, error messages, ordering, pagination semantics, and the unpaginated product response.
- Preserve inventory movements, alert events, and timeline writes in their existing business transaction; notifications retain their after-commit timing.
- No completed-result analytics cache, TTL, cross-instance cache, or configured pool changes.
- High paths: products.repository.ts and all listed orders paths. Canonical run limits: 25 files / 1,000 changed lines / 1,800 seconds / 5 iterations / 2 same failures / 3 flaky retries. Check cumulative measured scope, not task headings; never reset a run to bypass its bounds.
- Run DB integration only on an independently verified isolated target; no production credentials/migrations/seeding. Do not claim speedup without measurements.

## Review Focus

1. Text and numeric attribute filters retain count/list membership (Task 1).
2. Products with multiple reviews/reservations count once; deleted/hidden products remain excluded (Task 1).
3. Identical analytics failures propagate to every caller and permit a new retry (Task 2).
4. Responses remain fresh after completion and callers do not share mutable response objects (Task 2).
5. Duplicate product items, missing products and failed stock updates preserve cancellation atomicity (Task 3).

### Task 1: filtered product count

**Files:** Modify `server/src/products/products.repository.ts`; test `server/src/products/__tests__/products.repository.test.ts`, `products.controller.test.ts`.

**Interfaces:** Keep `countProductsByFilters(filters: ProductListFilters): Promise<number>` and all public repository signatures. Define `productIdentityFrom` containing products + category/brand joins; compose `productBaseFrom` with it plus rating/availability joins. Only count uses identity joins.

- [x] Add parameterized count tests for term/category/brand/price/text-attribute/numeric-attribute combinations, aggregate absence, filter parameters, and errors; assert projection joins remain on listing.
- [x] Run the new count assertions first and observe failures before implementation.
- [x] Split identity and projection SQL fragments without changing filter predicates, list projection, sorting, facets, or unpaginated behavior.
- [x] Run all product unit tests. SQL shape confirms count/list filter parity and excludes review/reservation aggregates. MySQL membership comparison and before/after EXPLAIN remain unavailable because local MySQL refused connections.

### Task 2: analytics pending-read coalescing

**Files:** Modify `server/src/analytics/analytics.service.ts`; test `server/src/analytics/__tests__/analytics.service.test.ts`.

**Interfaces:** Keep `getAnalyticsSummary(rawQuery: Record<string, unknown>)` and its current return shape. Add private `getPendingSummaryRows(range: AnalyticsRange): Promise<AnalyticsSummaryRows>` backed by `Map<AnalyticsRangeKey, Promise<AnalyticsSummaryRows>>`.

- [x] Deferred tests verify overlapping same-range requests coalesce while different canonical ranges remain independent.
- [x] Tests verify retry after sync/async failure, post-success freshness, and distinct mapped result objects.
- [x] Run the analytics suite and observe the coalescing/retry failures before implementation.
- [x] Share only pending rows, normalize range before map access, map each caller separately, and evict on either settlement path.
- [x] Analytics tests pass with no completed-result retention.
- [x] Document the single-instance boundary and no cross-instance deduplication in Wiki architecture/log; index date is current.

### Task 3: cancellation product locks

**Files:** Modify `server/src/orders/orders-cancellation.service.ts`, `orders.repository.ts`; test `server/src/orders/__tests__/orders.lifecycle.test.ts`, `orders.integration.test.ts`. Dependency: Plan B cancellation provider and row types.

**Interfaces:** Add `getRestockProductsForUpdate(tx: TransactionContext, productIds: number[]): Promise<OrderRestockProductRow[]>`; guard empty IDs, deduplicate/sort IDs and use one parameterized `SELECT ... WHERE id IN (...) ORDER BY id FOR UPDATE` retaining the current restock projection and product availability behavior.

- [x] Test sorted unique IDs, the empty-list guard, a single bulk query, duplicate item sequencing, missing products, and stock-write errors.
- [x] Unit tests verify zero affected rows stop cancellation, movement/alert errors propagate, and post-commit notifications are suppressed. Database rollback itself is not inferred from mocks.
- [x] Bulk-lock unique IDs once, then preserve per-item checked increments and sequential stock/movement/alert snapshots in the same transaction.
- [x] Run all orders and transaction unit suites. Concurrent cancellation and rollback verification on MySQL remain unavailable.
- [x] The repository contract executes one product-lock query per cancellation regardless of item count (zero for an empty item list, then the existing order/item locks); latency was not measured.

## Final verification and handoff

- [x] Run server typecheck, lint, full unit tests, and build successfully.
- [ ] Integration/hosted checks — unavailable: MySQL `127.0.0.1:3307` refused connections. This remains required before full handoff.
- [x] Review the task-owned diff independently; unrelated dirty files were excluded. Wiki documents only implemented boundaries.
- [x] Report unit results and query-count evidence separately from unavailable database measurements; no performance claim, migration, commit, push, or deployment.
