# Suppliers, Receiving and Stock Counts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin trace supplier purchases and partial receipts into stock,
retain acquisition costs, and approve stock counts without duplicate writes or
overwriting concurrent sales and reservations.

**Architecture:** Add a procurement feature alongside the existing inventory
feature. MySQL transactions own document state, stock revisions, source-linked
movements, product-alert transitions and audit events; the admin UI uses the
existing authenticated HTTP client and layout. Optimistic document versions and
product stock revisions reject stale changes instead of silently reconciling them.

**Tech Stack:** Node.js 24.20.0, pnpm 12.4.2, TypeScript, NestJS 11, MySQL/mysql2,
Zod, Prisma projection/migrations, React 19, SCSS, Vitest and Playwright.

**Spec:** [Approved design](../specs/2026-10-16-procurement-and-stock-counts-design.md).
Read it alongside this plan. Owner approved it on 2026-10-16.

## Global Constraints

- Only admins perform all operations in this release.
- This release uses one warehouse and whole-number VND.
- Count unallocated warehouse units, including active pending checkout holds;
  exclude units already deducted for placed orders and rejected/damaged goods.
- Cumulative accepted receipt quantities cannot exceed ordered quantities;
  rejected/missing units remain outstanding until accepted or the PO is closed.
- No supplier payments/debt, tax/landed-cost accounting, inventory valuation,
  gross-profit reporting, serial/IMEI, multi-location or physical allocation ledger.
- No new integration, worker or dependency; preserve MySQL ownership and Prisma
  parity, API aliases, auth, ownership, cookie, CSRF and rate-limit behavior.
- At most 100 PO/receipt lines, 200 count lines and 100 rows per list request.
- Product locks use ascending ID order; stock, documents, movements, alerts and
  audit commit together. No provider/network calls while holding locks.
- English/Vietnamese, light/dark, desktop/mobile, keyboard access and explicit
  loading/empty/error/saved/conflict states apply to every new admin screen.
- Existing stock without an acquisition receipt has unknown cost, not zero.
- Main owns shared files and Git. Delegates use `gpt-6-luna`, at most two at once,
  exact non-overlapping ownership and no further subagents.

## Review Focus

- A +2 receipt followed by a -2 sale restores the same stock number but must
  invalidate a prior count through its revision; Task 1 and Task 4 pin this down.
- A receipt commits but its response is lost: the same key and payload recover
  its original result, while changed payload reuse conflicts; Task 3 and Task 5.
- Rejected replacement deliveries must neither add stock nor incorrectly exhaust
  the purchase obligation; Task 3 tests rejected/missing then accepted deliveries.
- The count 12 physical units minus 2 placed-order units includes 3 temporary
  holds: store 10 and expose 7 available, not 12 or 7 as raw stock; Task 4/6.
- Recounting a stale line must clear that line's observation and preserve valid
  observations on other lines; Task 4/6 test the complete recovery journey.

## Execution preflight and branch boundary

- [ ] Re-read `AGENTS.md`, README, `docs/ai-prompts/feature.md`, orchestration,
  Wiki index, the approved spec and this plan. Select feature scope only.
- [ ] Inspect branch/remotes, full tracked and untracked changes, PR #320 and
  fresh remote refs. Record the actual source SHA; current baseline is
  `bugfix/audit-feature-findings` at `0196f9e` with PR #320 still open.
- [ ] At execution time use the git-worktree skill if isolation is needed.
  Preserve all existing internal-delivery doc edits and ADR 0007. Carry this
  feature's design, plan and P1 tracker by exact files/hunks, never blanket-stage.
- [ ] Preferred base: latest remote `main` containing the P0 baseline. If #320
  remains open, the proposed exception for owner approval with this plan is a
  separate `codex/procurement-stock-counts` branch stacked on the P0 source SHA.
  This differs from the normal main-based flow because the feature depends on
  unmerged P0 behavior. Keep its commits out of PR #320; no merge into or write
  directly to `main`. Do not silently use older P0 code or duplicate its changes.
- [ ] Confirm Node/pnpm and package-local dependencies. Do not print `.env`,
  credentials or connection URLs. Inspect existing isolated-DB test instructions
  before any migration/seed. No production/shared DDL or broad reset.
- [ ] Commit only the approved design/plan/tracker on the execution branch once
  isolated. Validate each Conventional Commit via
  `'<message>' | server/node_modules/.bin/commitlint.cmd --config server/commitlint.config.cjs`.

## Contracts and file ownership

Main owns migrations/Prisma, `app.module.ts`, existing inventory DTO/repository
interfaces, existing stock writers, route/sidebar/style entrypoints and docs.
A Backend packet may own exact new procurement/count files and tests. A Frontend
packet may own exact new admin pages/components/API/type/copy/style files only
after their API contract is fixed. Never assign overlapping shared files.

New backend JSON uses camelCase normalized DTOs, with route-local `msg` and
`supplier`, `order`, `receipt`, or `count` keys. List keys are `suppliers`,
`orders`, `receipts`, or `counts`, plus existing pagination metadata. Client
helpers normalize lists into `ListResult<T> = { items: T[]; pagination: {
page: number; limit: number; total: number; totalPages: number } }`.
Backend uses the existing PaginationMeta from
`server/src/shared/interfaces/pagination.types.ts`, adding this one generic
ListResult and the structural AdminListQuery type there. Frontend defines its equivalents in the new admin-local
`inventory-operations.types.ts`; no shared package or runtime abstraction.

Core contracts to define in the owning `*.types.ts`/validator files:

- Every `actorId` argument is a string from the verified request user;
  every document/product ID argument is a positive number.
- `StockRevision = string`: decimal representation of an unsigned DB bigint;
  never convert to JS number or serialize native bigint into JSON.
- `InventoryStockRow`: `id`, `sku`, `name`, `price`, `salePrice`, `stock`,
  `stockRevision`; used only within backend orchestration.
- `InventoryMovementInput`: retain existing fields; add optional
  `purchaseReceiptLineId` and `stockCountItemId` source IDs.
- `Supplier`: `id`, `code`, `name`, optional contact fields, `active`, `version`.
- `PurchaseOrder`: `id`, `supplierId`, supplier identity snapshot, `status`,
  `version`, `lines`; lines retain ID, productId, SKU/name snapshot,
  `orderedQuantity`, cumulative `acceptedQuantity`, `unitCostVnd` and `note`.
- `PurchaseOrderStatus`: `DRAFT | ORDERED | PARTIALLY_RECEIVED | RECEIVED |
  CLOSED | CANCELED`.
- `ReceiptLineInput`: `purchaseOrderItemId`, `expectedQuantity`,
  `acceptedQuantity`, `rejectedQuantity`, `missingQuantity`, `unitCostVnd`, `note`.
- `PostReceiptInput`: UUID `idempotencyKey`, `lines: ReceiptLineInput[]`, `note?`.
- `StockCount`: `id`, `status`, `version`, `items`, timestamps and actor IDs;
  items include baseline stock/revision, count or null, reason and difference.
- `StockCountStatus`: `DRAFT | SUBMITTED | APPROVED | CANCELED`.
- `CountObservation`: `itemId`, `countedQuantity`, `reason?`.
- `UpdateCountInput`: `version`, `observations: CountObservation[]`.
- `AdminListQuery`: `page`, `limit`, `search?`, `status?`, `supplierId?`;
  each route's schema allows only its own status values and relevant filters.
- `SupplierFields`: `code`, `name`, `contactName?`, `email?`, `phone?`,
  `address?`, `notes?`. `CreateSupplierInput = SupplierFields`;
  `UpdateSupplierInput = Partial<SupplierFields> & { version: number }`.
- `CreatePurchaseOrderInput`: `supplierId`, `note?`, `lines` containing
  `productId`, `orderedQuantity`, `unitCostVnd`, `note?`.
  `UpdatePurchaseOrderInput` has those fields plus required `version`.
- `DocumentActionInput`: `version`, `reason?`; action-specific schemas require
  reasons for cancel/close. `CountActionInput` adds optional `itemIds`;
  reopen requires those IDs and a reason, cancel requires a reason.
- `PurchaseReceipt`: `id`, `purchaseOrderId`, `idempotencyKey`, `createdAt`,
  `actorId`, `note`, `totalAcceptedCostVnd` and immutable normalized lines
  containing line ID, product identity snapshot and every ReceiptLineInput field.
- `CountConflict`: `code: "STOCK_COUNT_CONFLICT"`, `items` with `productId`,
  `expectedRevision`, `currentRevision`, `activeReservedQuantity` and `reason`
  (`STALE_STOCK | RESERVATION_SHORTFALL | PRODUCT_INACTIVE`). Use existing
  `AppError(message, 409, "STOCK_COUNT_CONFLICT", { items })`; the global filter
  supplies canonical `details.items` and its compatibility alias. Client error
  parsing normalizes that response into CountConflict without losing requestId.

## Task 1: Make every stock mutation invalidate stale observations

**Files:**
- Create: `server/src/database/prisma/migrations/20261016200000_inventory_stock_revision/migration.sql`.
- Modify: `server/src/database/prisma/schema.prisma`,
  `server/src/products/products.repository.ts`, `server/src/orders/orders.repository.ts`,
  `server/src/database/seeders/seed-demo.js`, `server/src/inventory/inventory.types.ts`.
- Test: existing products/orders repository tests, plus
  `server/src/inventory/__tests__/stock-revision.integration.test.ts`.

**Interfaces:** `Product.stockRevision` maps to `stock_revision BIGINT UNSIGNED
NOT NULL DEFAULT 0`. Existing repository method signatures stay compatible;
new count/receipt queries will read `CAST(stock_revision AS CHAR)`.

- [ ] Write failing regression assertions: initial stock 10/revision `0`; set
  stock 12 => revision `1`; set 12 again => still `1`; deduct 2 => stock 10 and
  revision `2`; restock then soft-delete must each increment it. Include generic
  product edit, dedicated stock edit, retained legacy methods and seed update.

  Test `integration invalidates a baseline after a change and reversal` pins:

  ```ts
  expect(after.stock).toBe(10);
  expect(after.stockRevision).toBe("2");
  expect(after.stockRevision).not.toBe(baseline.stockRevision);
  ```
- [ ] Run `pnpm --dir server exec vitest run src/products/__tests__/products.repository.test.ts src/orders/__tests__/orders.repository.test.ts`;
  new revision expectations must fail before implementation.
- [ ] Add the additive column/Prisma mapping and make all existing runtime stock
  SQL revision-aware. For absolute assignments, compute the conditional revision
  increment from the OLD stock before assigning the new stock; account for
  MySQL's assignment order. Positive order deductions/restocks increment once.
  Preserve existing transactions and mutation return contracts. Do not add a trigger.
- [ ] Search all runtime and supported seeder stock writes again. Test no-change
  metadata edits, repeated soft-delete and change-and-reversal. Do not delete
  legacy methods as unrelated cleanup; retained writers must remain safe.
  Export the existing `upsertDemoProducts(connection, plan)` from seed-demo.js
  for a narrowly scoped integration fixture; prove a supported seed stock change
  invalidates a captured count baseline without running the full seed/reset.
- [ ] Run targeted tests, server typecheck and Prisma validation/generation.
  Apply the migration only to the isolated test DB, then run the revision
  integration test via the integration config; expected all pass.
- [ ] Main reviews the diff and commits `feat(inventory): track stock revisions`.

## Task 2: Audited supplier and purchase-order APIs

**Files:**
- Create: `server/src/procurement/procurement.module.ts`,
  `suppliers.{controller,service,repository,validator,types}.ts`,
  `purchase-orders.{controller,service,repository,validator,types}.ts`.
- Create: `server/src/procurement/__tests__/suppliers.service.test.ts`,
  `purchase-orders.service.test.ts`, `procurement.controller.test.ts`,
  `procurement.integration.test.ts`.
- Create: migration `20261016201000_suppliers_and_purchase_orders/migration.sql`.
- Modify: Prisma schema, `server/src/app.module.ts`, and targeted integration
  cleanup in `server/src/database/__tests__/integration-database.ts`, plus
  the existing `server/src/shared/interfaces/pagination.types.ts`.

**Interfaces:**
- `SuppliersService.list(query: AdminListQuery): Promise<ListResult<Supplier>>`,
  `create(actorId: string, input: CreateSupplierInput): Promise<Supplier>`,
  `update(actorId, id, input: UpdateSupplierInput): Promise<Supplier>`,
  `archive(actorId, id, { version, reason }): Promise<Supplier>`.
- `PurchaseOrdersService.list(query: AdminListQuery): Promise<ListResult<PurchaseOrder>>`,
  `get(id): Promise<PurchaseOrder>`, `create(actorId, input: CreatePurchaseOrderInput)`,
  `updateDraft(actorId, id, input: UpdatePurchaseOrderInput)`,
  `transition(actorId, id, action: "confirm" | "cancel" | "close", input: DocumentActionInput)`;
  all writes return `Promise<PurchaseOrder>`.
- Repository methods take `TransactionContext` for all writes and associated
  state locks/audit. `PurchaseOrdersRepository.lockOrder(tx, id)` and
  `getDetail(tx, id)` are consumed by receipt posting in Task 3.

- [ ] Write failing tests: normalized duplicate supplier code; invalid contact
  fields; stale version; archive blocks new confirmation but preserves history;
  duplicate/unknown/inactive SKU; no lines or >100 lines; invalid costs and
  overflow totals; snapshot remains unchanged after product/supplier edit;
  cancel/close reason; immutable confirmed lines; forbidden non-admin access.

  Test `keeps confirmed line snapshots after catalog edits` pins:

  ```ts
  expect(confirmed.lines[0].sku).toBe("COUNT-SKU-1");
  expect(reloaded.lines[0].sku).toBe(confirmed.lines[0].sku);
  expect(reloaded.lines[0].unitCostVnd).toBe(150000);
  ```
- [ ] Run `pnpm --dir server exec vitest run src/procurement/__tests__/suppliers.service.test.ts src/procurement/__tests__/purchase-orders.service.test.ts src/procurement/__tests__/procurement.controller.test.ts`;
  expect failure before implementing the contracts.
- [ ] Add `suppliers`, `purchase_orders`, `purchase_order_items` with restrictive
  FKs, unique normalized code and `(purchase_order_id, product_id)`, integer
  document version, whole-VND decimal cost snapshots, and list/detail indexes.
  Quantity max is MySQL signed INT max; validate safe totals in JS before DB writes.
- [ ] Implement Zod payload/query validation and the services/repositories using
  `withTransaction`. Draft create/edit and confirmation check active supplier;
  confirmation locks/snapshots products and supplier identity. Only DRAFT can
  cancel; ORDERED/PARTIALLY_RECEIVED can close; confirmed lines cannot mutate.
- [ ] Expose `/api/admin/suppliers` and `/api/admin/purchase-orders` list/detail
  routes plus explicit create/edit/archive/confirm/cancel/close actions. New
  controllers use admin guards, existing CSRF and module rate limits (100).
  Append minimal actor/action/entity/version changes to audit in each transaction.
- [ ] Run targeted tests and typecheck; isolated-MySQL tests verify actual unique
  constraints, snapshots and rollback on audit failure. Clean up only each
  fixture's supplier/document/product graph before shared test cleanup.
- [ ] Main reviews and commits `feat(procurement): manage suppliers and purchase orders`.

## Task 3: Post immutable partial receipts exactly once

**Files:**
- Create: `server/src/procurement/purchase-receipts.{controller,service,repository,validator,types}.ts`,
  `receipt.policy.ts`, `__tests__/purchase-receipts.service.test.ts`,
  `__tests__/receipt.policy.test.ts`, `__tests__/receiving.integration.test.ts`.
- Create: migration `20261016202000_purchase_receipts/migration.sql`.
- Modify: procurement module, PO repository, Prisma schema, inventory
  `inventory.{repository,service,dto,types,module}.ts`, targeted fixture cleanup.

**Interfaces:**
- `PurchaseReceiptsService.post(actorId, orderId, input: PostReceiptInput): Promise<PurchaseReceipt>`;
  `list(orderId, query: AdminListQuery): Promise<ListResult<PurchaseReceipt>>`;
  paginate receipt history rather than silently truncating it or loading it all.
- `InventoryRepository.lockStockRows(tx, productIds): Promise<InventoryStockRow[]>`
  locks unique IDs in ascending order; include inactive detection.
- `InventoryRepository.writeStock(tx, productId, stock, expectedRevision: StockRevision): Promise<boolean>`
  conditionally updates active products and increments revision only on a change.
- Extend `NestInventoryService.createMovementsInTransaction(tx, inputs)` with
  nullable receipt/count source fields while retaining existing callers.
- Export InventoryRepository from InventoryModule. Receipt/count services use
  `ProductAlertsService.recordTransitionsInTransaction(tx, transitions)` with
  existing `getProductAlertTransitions(before, after)`; import ProductAlertsModule
  without introducing a ProductsModule/InventoryModule cycle.

- [ ] Write failing policy/service tests using ordered quantity 10: receive
  accepted 4/rejected 2/missing 4; stock adds exactly 4 and remaining obligation
  is 6. Receive accepted 6 next => stock adds 6, PO RECEIVED. Rejected-only and
  missing-only receipts add no stock; accepted 7 when 6 remain is rejected.
  Dispositions must sum to expected; require shortage/rejection notes and a
  reason when actual unit cost differs from its immutable planned cost.
- [ ] Add tests for exact duplicate retry returning its original receipt even
  after PO RECEIVED/CLOSED; changed payload same key => conflict; normalize line
  ordering before hashing. A real new key cannot post to a terminal PO. Inject
  failure after stock write and require rollback of every document/audit effect.

  Test `retries a committed receipt without repeating inventory effects` pins:

  ```ts
  expect(retry.id).toBe(firstPost.id);
  expect(movements).toHaveLength(1);
  expect(stockAfterRetry).toBe(stockBefore + 4);
  ```
- [ ] Run `pnpm --dir server exec vitest run src/procurement/__tests__/receipt.policy.test.ts src/procurement/__tests__/purchase-receipts.service.test.ts`;
  expect new tests to fail first.
- [ ] Add receipt/header/line tables, immutable actual costs, canonical payload
  hash and unique `(purchase_order_id, idempotency_key)`. Add nullable unique
  `purchase_receipt_line_id` to movements with a restrictive FK and Prisma parity.
  Only one line per PO item per receipt; accepted sum and total-stock INT bounds
  are validated before any mutation.
- [ ] Implement posting: lock PO; check replay identity before terminal-state
  rejection; validate lines/remaining obligation; lock sorted products; insert
  receipt/lines; apply accepted additions; write movements/alerts; update PO
  accepted totals/version/status; audit; return committed receipt. No async
  detached logging or external supplier call. Zero accepted quantity writes no
  zero-quantity movement but retains receipt, reasons and audit.
- [ ] Expose list/post `/api/admin/purchase-orders/:id/receipts`; reject an
  archived product but allow receiving an existing PO from an archived supplier.
  Test genuine admin guards and source lineage in ledger normalization.
- [ ] Run focused unit tests and isolated-MySQL receiving tests: two concurrent
  posts cannot exceed ordered quantity; duplicate key creates one stock effect;
  audit-insert failure leaves no committed receipt; immutable costs survive edits.
- [ ] Main reviews and commits `feat(procurement): receive purchases atomically`.

## Task 4: Review and approve stock counts with live reservation protection

**Files:**
- Create: `server/src/inventory/stock-counts.{controller,service,repository,validator,types}.ts`,
  `stock-counts.policy.ts`, `__tests__/stock-counts.service.test.ts`,
  `__tests__/stock-counts.policy.test.ts`, `__tests__/stock-counts.controller.test.ts`,
  `__tests__/stock-counts.integration.test.ts`.
- Create: migration `20261016203000_stock_counts/migration.sql`.
- Modify: inventory module/repository/DTO, Prisma schema, targeted fixture cleanup.

**Interfaces:**
- `StockCountsService.list(query): Promise<ListResult<StockCount>>`,
  `get(id): Promise<StockCount>`, `create(actorId, { productIds, note? })`,
  `update(actorId, id, input: UpdateCountInput)`,
  `transition(actorId, id, action: "submit" | "reopen" | "approve" | "cancel", input: CountActionInput)`;
  all writes return `Promise<StockCount>` and use a document version.
- Reopen input adds `itemIds: number[]` and a required reason. Only selected
  lines refresh their stock/revision baselines and clear their entered counts;
  audit retains previous baseline/count and new baseline.
- `InventoryRepository.activeReservations(tx, productIds): Promise<Array<{
  productId: number; quantity: number }>>` reuses existing PENDING/expiry rules
  after acquiring product locks; do not acquire pending-checkout locks in reverse.
  Header and item reads before this query must be locking reads, so an earlier
  plain SELECT cannot create an obsolete REPEATABLE READ snapshot. The live
  reservation query establishes its read view only after sorted product locks
  are held. Test this sequence against the actual isolated-DB isolation level.

- [ ] Write failing tests: empty/duplicate/>200 products; missing or inactive
  product; integer zero counts; nonzero difference requires reason; submit
  incomplete observations fails; wrong version/state fails; non-admin denied.
- [ ] Add assertions: stock 10/revision `3` => count 8 approved once, stock 8 and
  one -2 source-linked movement; repeated approve no new write. Revision `4`
  with stock still 10 conflicts. Any conflict rolls back the entire session.
  Count 2 against 3 live holds conflicts; count 3 is allowed (zero availability).
  The approved 12 minus 2 example stores raw 10 and leaves availability 7.
- [ ] Add recount test: two lines counted; only stale line is refreshed and
  cleared, the valid observation stays intact, old values remain auditable.

  Test `counts unallocated stock including temporary checkout holds` pins:

  ```ts
  expect(approved.items[0].countedQuantity).toBe(10);
  expect(storedStock).toBe(10);
  expect(availableStockWithThreeHolds).toBe(7);
  ```
- [ ] Run `pnpm --dir server exec vitest run src/inventory/__tests__/stock-counts.policy.test.ts src/inventory/__tests__/stock-counts.service.test.ts src/inventory/__tests__/stock-counts.controller.test.ts`;
  expect failure first.
- [ ] Add count/header/line tables with captured bigint revision, product identity
  snapshots, nullable observed count, reasons and versioned status. Add nullable
  unique `stock_count_item_id` movement FK; constrain it and receipt source so
  the same movement cannot claim both document types. Preserve existing fields.
- [ ] Implement draft/save/submit/reopen/cancel and approval in `withTransaction`.
  Approval locks session then sorted products, checks revision/active state and
  live holds, writes all adjusted stocks/movements/alerts plus audit, then stores
  immutable approval. Inspect APPROVED state before rejecting a retry's stale
  document version. No-op counts retain approval/audit without zero movements.
- [ ] Register admin-only `/api/admin/stock-counts` with structured 409 count
  conflicts listing affected IDs/revisions/holds, preserving existing error
  envelope compatibility. Unexpected failures remain sanitized infrastructure errors.
- [ ] Run unit tests and real-MySQL interleaving tests with receipts, checkout
  reserve/finalize, manual edits, cancellation, soft deletion and two approvals.
  Use explicit barriers/two transactions, not timing sleeps. Verify count-first
  and reservation-first schedules, including a reservation committed while
  approval waits on a product lock; demonstrate change-and-reversal rejection.
- [ ] Main reviews and commits `feat(inventory): approve reviewed stock counts`.

## Task 5: Admin supplier, purchase-order and receipt workspace

**Files:**
- Create under `client/src/features/admin/`: `procurement.api.ts`,
  `procurement.types.ts`, `inventory-operations.types.ts`, `inventory-operations.copy.ts`,
  `pages/AdminSuppliersPage.tsx`, `pages/AdminPurchaseOrdersPage.tsx`,
  `components/PurchaseOrderEditor.tsx`, `components/PurchaseReceiptForm.tsx`.
- Test under the same feature: `procurement.api.test.ts`,
  `pages/AdminSuppliersPage.test.tsx`, `pages/AdminPurchaseOrdersPage.test.tsx`,
  `components/PurchaseOrderEditor.test.tsx`, `components/PurchaseReceiptForm.test.tsx`.
- Create `client/src/styles/features/admin/_inventory-operations.scss`;
  Main modifies `client/src/styles/index.scss`, router/tests and AdminSidebar/tests.

**Interfaces:** `listSuppliers/createSupplier/updateSupplier/archiveSupplier`,
`listPurchaseOrders/getPurchaseOrder/createPurchaseOrder/updatePurchaseOrder/
transitionPurchaseOrder/listPurchaseReceipts/postPurchaseReceipt` are typed
Promise-returning wrappers over Task 2/3 routes. `postPurchaseReceipt(orderId,
input: PostReceiptInput): Promise<PurchaseReceipt>` preserves its passed key.
Reuse existing `fetchAdminProductsPage` for bounded SKU selection, not all-catalog
downloads. Page routes: `/admin/suppliers` and `/admin/purchase-orders`.
Purchase detail uses `/admin/purchase-orders?orderId=<id>`; invalid or missing
documents show a recoverable error rather than selecting an unrelated order.

- [ ] Write failing API/component tests: admin loads empty/list/error states;
  supplier archive/version conflict; draft edit/confirm/close; immutable confirmed
  rows; receipt 4/2/4 of 10 then 6 accepted; actual-cost explanation; localized
  validation; submitting twice blocked; lost-response retry sends identical key
  and values; changing the draft after failure creates a fresh key.

  Test `reuses the receipt key after an uncertain network result` pins:

  ```ts
  expect(retryRequest.idempotencyKey).toBe(firstRequest.idempotencyKey);
  expect(retryRequest.lines).toEqual(firstRequest.lines);
  expect(editedRequest.idempotencyKey).not.toBe(firstRequest.idempotencyKey);
  ```
- [ ] Run `pnpm --dir client exec vitest run src/features/admin/procurement.api.test.ts src/features/admin/pages/AdminSuppliersPage.test.tsx src/features/admin/pages/AdminPurchaseOrdersPage.test.tsx src/features/admin/components/PurchaseReceiptForm.test.tsx`;
  new tests must fail before UI implementation.
- [ ] Implement thin wrappers using `http`; normalize route-specific plural
  lists into ListResult and retain structured errors for actionable conflicts.
  Implement pages/forms using existing layout, input/dialog/table patterns,
  locale/theme contexts and number formatting. Use BEM and existing tokens.
- [ ] Provide explicit review before receipt post/close/archive; summarize
  accepted quantities and stock effect. Display rejected/missing as outstanding,
  show planned versus actual costs without claiming gross profit. Refresh
  authoritative detail after writes and preserve unsaved data on failed requests.
- [ ] Main integrates lazy admin-guarded routes, navigation, style import and
  router coverage; verify no change to product, checkout or delivery URLs.
- [ ] Run focused tests, frontend typecheck and lint. Review keyboard focus,
  compact/mobile tables and both locale copies before committing
  `feat(admin): manage suppliers and incoming purchases`.

## Task 6: Admin stock-count input, review and stale-count recovery

**Files:**
- Create `client/src/features/admin/inventory.api.ts`, `inventory.types.ts`,
  `pages/AdminStockCountsPage.tsx`, `components/StockCountEditor.tsx`,
  `components/StockCountReview.tsx`.
- Test in that feature: `inventory.api.test.ts`, `pages/AdminStockCountsPage.test.tsx`,
  `components/StockCountEditor.test.tsx`, `components/StockCountReview.test.tsx`.
- Modify shared inventory copy/SCSS from Task 5. Main owns router/sidebar tests
  and existing `pages/AdminProductPage.tsx`/test for source-linked history links.

**Interfaces:** `listStockCounts/getStockCount/createStockCount/updateStockCount/
transitionStockCount` wrap Task 4 with its exact versioned bodies and structured
CountConflict. Page route `/admin/stock-counts`; linked ledger entries open the
matching receipt/PO or count detail by stable document ID.
Count detail uses `/admin/stock-counts?countId=<id>` with the same safe missing-ID
behavior. Use the optional ledger source fields to link into these existing routes.

- [ ] Write failing tests for the counting-basis instructions and 12 minus 2
  example, count zero, incomplete submission, discrepancy reason, approval
  summary, pending state, already-approved retry, 409 stale/hold conflicts,
  selected-line recount and retained unaffected observations. Test both locales.

  Test `clears only the selected stale observation on recount` pins:

  ```ts
  expect(reopened.items[0].countedQuantity).toBeNull();
  expect(reopened.items[1].countedQuantity).toBe(8);
  expect(reopened.status).toBe("DRAFT");
  ```
- [ ] Run `pnpm --dir client exec vitest run src/features/admin/inventory.api.test.ts src/features/admin/pages/AdminStockCountsPage.test.tsx src/features/admin/components/StockCountReview.test.tsx`;
  expect failure first.
- [ ] Implement typed API and draft/review/history views. Show baseline,
  observation, computed difference and instructions prominently; no total-physical
  warehouse claims. Label changed counts as needing recount instead of silently
  refreshing baselines. Approval failures retain the user's data and identify
  stale products/reservation shortfalls; reopening clears only chosen observations.
- [ ] Main integrates the guarded route/nav and optional movement-source links.
  Preserve compatibility for movements without new source fields. Approved
  documents are read-only; keyboard focus moves to errors/recount actions.
- [ ] Run focused UI tests, typecheck and lint; commit after Main review as
  `feat(admin): review inventory counts and conflicts`.

## Task 7: Integration, browser acceptance and maintained documentation

**Files:**
- Create `client/e2e/procurement-stock-counts.spec.ts`,
  `client/e2e/fixtures/inventory-operations.ts`.
- Modify only if needed: `client/playwright.config.ts` and integration fixtures.
- Update README capability summary, `docs/API.md`,
  `server/src/docs/openapi.json`, `docs/TESTING.md`, `docs/DEVELOPMENT.md`,
  `docs/backlog/{P1,README}.md` by owned hunks.
- Create `Wiki/concepts/procurement-and-stock-counts.md`; update
  `Wiki/entities/product.md`, Wiki index/log and affected architecture notes.

**Interfaces:** Browser fixtures provision only synthetic admin/customer/staff
accounts and isolated products/docs; use Firebase Auth Emulator plus real local
API cookie/CSRF flows. No production credentials, opaque token screenshots or
synthetic API interception described as real integration success.

- [ ] Run a real local admin journey: supplier => PO 10 units => receive 4 good,
  2 rejected and 4 missing => receive 6 good => count, review and approve.
  Verify API/DB stock, source ledger, snapshot costs and audit agree after each
  step. Add rejected/archived supplier, duplicate receipt retry and stale-count
  recovery cases; customer/DeliveryStaff cannot open or call admin operations.
- [ ] Add Playwright journeys using existing eight projects: 1440x900/390x844,
  English/Vietnamese, light/dark. Verify focus, form labels, retry/conflict UI,
  loading/error states and no horizontal overflow. Reuse locale/theme helpers;
  do not forge an admin session or bypass CSRF in the integration journey.
- [ ] Run `pnpm --dir client exec playwright test e2e/procurement-stock-counts.spec.ts`.
  If environment fixtures are absent, report the blocked live test precisely;
  separate any route-mocked UI proof from API/DB/browser integration evidence.
- [ ] Document counting basis, receipt replacement/closure policy, revision
  coverage, new endpoints/migrations, unknown legacy costs, fixture commands
  and source lineage. Update P1 status only for acceptance actually demonstrated;
  preserve unrelated existing delivery-doc hunks in shared files.
- [ ] Run final checks once after final mutations:

```powershell
pnpm --dir server prisma:validate
pnpm --dir server prisma:generate
pnpm --dir server typecheck
pnpm --dir server test -- --run
pnpm --dir server test:integration
pnpm --dir server build
pnpm --dir server lint
pnpm --dir client exec tsc -p tsconfig.json --noEmit
pnpm --dir client test -- --run
pnpm --dir client build
pnpm --dir client lint
git diff --check
```

- [ ] Complete the BMAD QA checklist and independent final diff review using the
  repository's Luna role/model constraint. Resolve findings and rerun only
  affected checks. Record command results and evidence scope in the final report.
- [ ] Main validates commitlint and commits only feature-owned files/hunks as
  `test(inventory): verify procurement and count operations` or splits docs into
  a separate Conventional Commit when appropriate. No PR, merge or deploy unless
  separately requested. Report branch/base dependency and any unavailable checks.

## Plan self-review and owner handoff

MySQL documentation checked via Context7 during planning:
[consistent reads](https://dev.mysql.com/doc/refman/8.0/en/innodb-consistent-read.html),
[locking reads](https://dev.mysql.com/doc/refman/8.0/en/innodb-locking-reads.html),
and [single-table UPDATE assignment order](https://dev.mysql.com/doc/refman/8.0/en/update.html).
The integration tests must still prove the chosen sequence on the actual local
MySQL target; the documentation lookup is not runtime evidence.

Coverage: Tasks 1/4 cover revision and reservation safety; Tasks 2/3 cover every
supplier/PO/receipt state and cost boundary; Tasks 5/6 implement admin access and
all screen states; Task 7 supplies real integration/browser evidence and maintained
documentation. All five review-focus cases have explicit owning tests.

Recommend subagent-driven execution because receipt and count invariants are
independently reviewable and a stock mistake affects checkout. Main owns shared
schema/contracts and integrates each task; configured Luna specialists own only
their assigned backend/frontend files, with at most two active. Native execution
is also supported: Main implements this plan and a fresh Luna reviewer reviews
the integrated diff at the end.

Status: plan written and self-reviewed; awaiting owner review and execution-method
selection. No product code or database changes are authorized by plan creation
alone; the prior feature authorization is carried into execution after this gate.
