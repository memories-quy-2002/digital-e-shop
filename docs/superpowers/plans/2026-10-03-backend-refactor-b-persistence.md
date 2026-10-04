# Backend persistence boundaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move product/order SQL to repositories and extract order snapshots and cancellation while preserving transaction semantics.

**Architecture:** Existing services coordinate business behavior; repositories receive the caller's TransactionContext. NestOrdersService remains the public facade; a required cancellation provider owns its transaction and returns metadata used by the facade after commit.

**Tech Stack:** Existing NestJS, TypeScript, MySQL2 and Vitest; Node 24.20.0 / pnpm 12.4.2.

**Spec:** `docs/superpowers/specs/2026-10-03-backend-refactor-design.md`, Batch B.

## Global Constraints

- No new dependencies, schema changes, production operations, commits, or pushes.
- All participating repository methods receive the caller's TransactionContext; never substitute pool.query inside a transaction or open a nested transaction.
- Preserve authoritative checkout prices and stock, COD/PayOS behavior, historical currency compatibility, idempotency, and guest-token privacy.
- Preserve inventory movements, alert events, and timeline writes in their existing business transaction; notifications retain their after-commit timing.
- Preserve routes, aliases, payload keys, HTTP statuses, error messages, ordering, pagination semantics, and the unpaginated product response.
- High scope: all listed orders paths and `products/products.repository.ts`. Required scope refinement: add `server/src/orders/orders.errors.ts` to avoid a cancellation-to-facade import cycle; this is part of this plan's review, not an already-executed change.
- Canonical run limits: 25 files / 1,000 changed lines / 1,800 seconds / 5 iterations / 2 same failures / 3 flaky retries. If the measured cumulative diff reaches a bound, stop with a verified partial result and the exact remaining task; do not auto-reset state or commit to bypass the bound.
- No edits to payments, guards, auth, inventory, schema, or loop policy. Existing unrelated changes are preserved.

## Review Focus

1. A failed repository write rolls back every related business write (Tasks 1, 3, 4).
2. Duplicate PayOS finalization remains idempotent, including the existing-order path (Task 3).
3. Historical/null snapshot fields and zero sale prices retain their previous mapping (Task 2).
4. Delivery checks still reject simulated/unpaid PayOS and correctly confirm COD (Task 3).
5. Guest and repeated cancellation preserve ownership, restoration-once, and after-commit notification timing (Task 4).

## Execution and verification

Recommended native execution; method selection is pending. Baseline selectors: `src/products/__tests__`, `src/orders/__tests__`, `src/orders/checkout-flow.spec.ts`, `src/database/__tests__/transaction.test.ts`. Use `pnpm --dir server exec vitest run <selectors>`; package-local `vitest.cmd` from server is the NO_TTY fallback.

Final commands: server typecheck, lint, full unit test run, build, and opt-in integration only against an independently verified isolated MySQL target. Do not run migrations or seed/reset to make checks pass. Missing integration evidence must be explicit, particularly for cancellation and finalization. Required hosted checks remain required for full handoff.

### Task 1: transactional ProductsRepository

**Files:** Modify `server/src/products/products.repository.ts`, `products.service.ts`, `products.types.ts`; create `server/src/products/__tests__/products.repository.test.ts`; adapt `server/src/products/__tests__/products.alerts.test.ts`.

**Interfaces:** Move existing ProductInsertRecord/ProductUpdateRecord types from repository-local definitions to products.types.ts without changing field meaning. Add `ProductMutationState = { price: number; sale_price: number | null; stock: number }` there. Add repository methods:

- `ensureNamedIdInTransaction(tx: TransactionContext, tableName: "categories" | "brands", name: string): Promise<number>`.
- `insertProductInTransaction(tx: TransactionContext, product: ProductInsertRecord): Promise<InsertResult>`.
- `getProductMutationStateForUpdate(tx: TransactionContext, pid: number): Promise<ProductMutationState | null>`.
- `updateProductInTransaction(tx: TransactionContext, pid: number, product: ProductUpdateRecord): Promise<UpdateResult>`.
- `updateProductStockInTransaction(tx: TransactionContext, pid: number, stock: number): Promise<UpdateResult>`.

- [x] Add repository tests for exact transaction SQL/parameters, insert IDs, absent rows, DB rejection/affected rows, and no pool use.
- [x] Add service coverage for product persistence failures and optional-vs-explicit update fields; preserve transaction sequencing.
- [x] Run tests before implementation and observe the missing-method failures.
- [x] Move product write SQL into ProductsRepository and keep validation, attributes, inventory, and alerts in the service.
- [x] Adapt alert test doubles; run product/server tests, typecheck, and lint. Existing unused repository APIs remain.
- [x] Document the boundary in Wiki architecture; the index date and log were updated.

### Task 2: pure order snapshot mapping

**Files:** Create `server/src/orders/orders.snapshot.ts`; modify `server/src/orders/orders.service.ts`; extend `server/src/orders/__tests__/orders.repository.test.ts` with a separate snapshot describe block.

**Interfaces:** Export `parseSpecificationsSnapshot(value: unknown): Record<string, unknown>` and `buildOrderItemSnapshot(product: CartItemRow, currentAttributes?: ProductAttribute[]): OrderItemSnapshot` using the existing bodies and existing feature types.

- [x] Add snapshot characterization for objects/strings/malformed values, structured-attribute precedence, fallback SKU, and zero sale price.
- [x] Run the characterization before extraction and confirm the missing-module failure.
- [x] Move the two pure functions and update OrdersService imports without changing mapping behavior.
- [x] Run repository, guest-purchase, and PayOS-finalization suites successfully.

### Task 3: remaining OrdersService SQL

**Files:** Modify `server/src/orders/orders.repository.ts`, `orders.service.ts`, `orders.types.ts`; tests `server/src/orders/__tests__/orders.repository.test.ts`, `orders.lifecycle.test.ts`, `orders.payos.finalization.test.ts`, `guest-purchase.test.ts`, `orders.alerts.test.ts`, `orders.integration.test.ts`.

**Interfaces:** Reuse existing `insertOrderInTransaction`, `insertOrderItemsInTransaction`, `decrementProductStockInTransaction`, `markOpenCartCompleteInTransaction`, and `getOrderDateAddedInTransaction` with their current signatures. Define these feature-local types in orders.types.ts:

```ts
type OrderLifecycleRow = { user_id: string | null; status: number; delivered_at?: string | Date | null; inventory_restored_at?: string | Date | null };
type OrderItemQuantityRow = { product_id: number; quantity: number };
type OrderRestockProductRow = { id: number; price: number; sale_price: number | null; stock: number };
type OrderPaymentLifecycleRow = { id: number; provider: string; status: string; simulated?: number | boolean | null };
type OrderPaymentLedgerWrite = {
  orderId: number; provider: PaymentProviderName; status: string;
  providerReference: string | null; providerPaymentId: string | null;
  quote: PaymentQuote; simulated: boolean;
};
```

Add transaction methods (all consume TransactionContext first):

- `insertPaymentLedgerInTransaction(tx, input: OrderPaymentLedgerWrite): Promise<unknown>`.
- `findPayOSOrderInTransaction(tx, orderCode: number, paymentLinkId: string, paymentAmount: number): Promise<{ id: number; date_added: string } | null>`.
- `getOrderLifecycleForUpdate(tx, orderId: number): Promise<OrderLifecycleRow | null>`.
- `getLatestPaymentForUpdate(tx, orderId: number): Promise<OrderPaymentLifecycleRow | null>`.
- `getOrderItemsForUpdate(tx, orderId: number): Promise<OrderItemQuantityRow[]>`.
- `getRestockProductForUpdate(tx, productId: number): Promise<OrderRestockProductRow | null>`.
- `incrementProductStockInTransaction(tx, productId: number, quantity: number): Promise<UpdateResult>`.
- `cancelOrderInTransaction(tx, orderId: number, reason: string | null): Promise<UpdateResult>`.
- `ensureDeliveredAtInTransaction(tx, orderId: number): Promise<UpdateResult>`.
- `completeOrderInTransaction(tx, orderId: number): Promise<UpdateResult>`.
- `confirmCashPaymentInTransaction(tx, paymentId: number): Promise<UpdateResult>`.

Each method owns only its matching existing SQL. `getOrderLifecycleForUpdate` may unify the two previous order projections but must keep their row-lock behavior. Cancellation retains the current per-item locks until Plan C.

- [x] Add repository tests for exact transaction SQL/parameters, VND ledger fields, duplicate lookup behavior, predicates, and DB rejection.
- [x] Preserve service characterization for finalization, reservations, guest privacy, delivery checks, COD confirmation, and after-commit notifications.
- [x] Move transaction SQL into the repository and retain provider/payment/business coordination in the service.
- [x] Run orders/product and transaction tests; OrdersService contains no remaining transaction SQL.
- [ ] Isolated MySQL order integration and rollback/idempotency verification — unavailable: local MySQL at `127.0.0.1:3307` refused connections; no runtime rollback claim is made.

### Task 4: focused cancellation provider

**Files:** Create `server/src/orders/orders-cancellation.service.ts`, `server/src/orders/orders.errors.ts`; modify `orders.service.ts`, `orders.module.ts`; adapt `server/src/orders/__tests__/orders.lifecycle.test.ts`, `orders.alerts.test.ts`, `orders.payos.finalization.test.ts`, `guest-purchase.test.ts`, `orders.integration.test.ts`.

**Interfaces:** Move `createCheckoutError(message: string, statusCode = HTTP_STATUS.CONFLICT, details: Record<string, unknown> = {})` to orders.errors.ts; re-export it from orders.service.ts to retain existing imports. Define `NestOrdersCancellationService.cancelOrder(orderId: number, actorId: string, admin = false, reason?: string): Promise<{ userId: string | null; changed: boolean }>`; it consumes OrdersRepository, timeline, inventory, and the existing optional product-alert provider.

- [x] Add tests for ownership, already-canceled/repeat behavior, restore-once, movement/alert/timeline failures, and post-commit-only notifications.
- [x] Extract cancellation orchestration into the required Nest provider and register it without a facade import or fallback.
- [x] Preserve the public facade method and after-commit summary/notification behavior; update direct-construction fixtures.
- [x] Run all order unit suites, typecheck, and lint; add a Nest provider-resolution test. MySQL integration remains unavailable as recorded above.
- [x] Update Wiki architecture/index/log and complete local verification without commits or policy changes.

## Handoff

Report exactly which tasks finished and which integration/hosted checks remain. Extraction and measured performance are separate claims. Batch C's product/count and analytics work can be reviewed independently; its cancellation optimization depends on Task 4.
