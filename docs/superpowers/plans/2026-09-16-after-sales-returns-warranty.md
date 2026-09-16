# After-Sales Returns, Warranty, and Refund Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Add an auditable return, warranty, manual-refund, and returned-item restock workflow for authenticated and guest customers, using the approved seven-day return policy and immutable order snapshots.

**Architecture:** Add a feature-owned NestJS after-sales module backed by MySQL repositories and transaction contexts. The service owns eligibility, quantity reservation, case state transitions, refund calculation, payment-refund records, and restock orchestration. Orders, payments, and inventory remain the owners of their existing data and are called through explicit service/repository boundaries. Add customer, guest, and admin React views without exposing guest tokens, internal notes, actor identifiers, or payment secrets.

**Tech Stack:** NestJS 11, Express 5, TypeScript 6, MySQL/mysql2, Prisma 7 schema and forward migrations, Zod, React 19, React Router 7, Axios, SCSS, Vitest, Playwright, pnpm 12.3.4.

**Spec:** docs/superpowers/specs/2026-09-16-after-sales-returns-warranty-design.md

## Global Constraints

- A RETURN is eligible only when the order is status 1, delivered_at is non-null, and the current UTC time is on or before delivered_at plus seven calendar days.
- A WARRANTY is eligible only when the order is status 1, delivered_at is non-null, the selected order-item warranty snapshot is a positive month count, and the current UTC time is on or before the snapshot warranty deadline.
- The service reads order totals, discount, delivered_at, item quantity, item price, warranty months, payment amount, and guest-token proof from the server-side records; the client cannot override them.
- Authenticated routes prove user ownership. Guest routes require orderId plus guestOrderToken and use the existing hash/matching boundary; raw tokens are never persisted, logged, returned, or put in a URL.
- Case types are RETURN and WARRANTY. Resolutions are REFUND, REPLACEMENT, and REPAIR.
- Customer-visible case statuses follow the approved state machine:
  REQUESTED -> APPROVED | REJECTED | CANCELED
  APPROVED -> RECEIVED | CANCELED
  RECEIVED -> INSPECTING
  INSPECTING -> REFUND_PENDING | REPAIRING | REPLACEMENT_PENDING | REJECTED
  REFUND_PENDING -> RESOLVED
  REPAIRING -> RESOLVED
  REPLACEMENT_PENDING -> RESOLVED
  REJECTED, CANCELED, and RESOLVED are terminal.
- Every transition, refund creation/confirmation, and restock action is protected by transaction row locks and is idempotent.
- Refund amount is calculated from immutable item snapshots, rounded as whole VND, discount-aware, and capped by the outstanding paid amount. Shipping is not refunded separately because the current order contract has no separate shipping fee.
- PayOS and COD refunds are manual. A refund stays MANUAL_REQUIRED until an admin supplies an external reference through the protected confirmation route; no automatic PayOS refund API call is added.
- Restock is allowed only after RECEIVED or INSPECTING and explicit admin confirmation. Each accepted item creates one restock_returned_item inventory movement and cannot be restocked twice.
- Repair and replacement record an operational outcome only; they do not create an automatic shipment, replacement order, or stock movement.
- Preserve AuthGuard, RolesGuard, CSRF, rate limits, request correlation, route-local response envelopes, guest-safe serialization, and existing order/payment/inventory contracts.
- Keep client and server independent. Use pnpm only and update only the lockfile owned by a package if dependencies change. This feature must not add a dependency.
- Do not stage or modify the unrelated existing client/src/i18n/en.ts worktree change.
- Keep historical payment columns and historical migrations intact, including Stripe-era artifacts retained for read-only compatibility by the payment work.

## File map

Create:

- server/src/database/migrations/2026-09-16-add-after-sales-workflow.sql
- server/src/database/prisma/migrations/20260916110000_after_sales_returns_warranty/migration.sql
- server/src/after-sales/after-sales.types.ts
- server/src/after-sales/after-sales.dto.ts
- server/src/after-sales/after-sales.validator.ts
- server/src/after-sales/after-sales.policy.ts
- server/src/after-sales/refund-calculator.ts
- server/src/after-sales/after-sales.repository.ts
- server/src/after-sales/after-sales.service.ts
- server/src/after-sales/after-sales.controller.ts
- server/src/after-sales/after-sales.module.ts
- server/src/after-sales/__tests__/after-sales.policy.test.ts
- server/src/after-sales/__tests__/refund-calculator.test.ts
- server/src/after-sales/__tests__/after-sales.service.test.ts
- server/src/after-sales/__tests__/after-sales.controller.test.ts
- client/src/features/after-sales/api.ts
- client/src/features/after-sales/types.ts
- client/src/features/after-sales/components/AfterSalesCaseForm.tsx
- client/src/features/after-sales/components/AfterSalesCaseTimeline.tsx
- client/src/features/after-sales/pages/AfterSalesPage.tsx
- client/src/features/after-sales/pages/AfterSalesCaseDetailPage.tsx
- client/src/features/after-sales/__tests__/AfterSalesCaseForm.test.tsx
- client/src/features/after-sales/__tests__/AfterSalesPage.test.tsx
- client/src/styles/_after-sales.scss

Modify:

- server/src/database/prisma/schema.prisma
- server/src/app.module.ts
- server/src/orders/orders.repository.ts
- server/src/orders/orders.service.ts
- server/src/orders/orders.types.ts
- server/src/inventory/inventory.service.ts or the existing inventory transaction boundary that owns stock movements
- client/src/features/orders/api.ts
- client/src/features/orders/types.ts
- client/src/features/orders/pages/OrderHistoryPage.tsx
- client/src/features/orders/pages/GuestOrderLookupPage.tsx
- client/src/features/admin/api.ts
- client/src/components/layout/AdminSidebar.tsx
- client/src/routes/router.tsx
- client/src/styles/index.scss
- docs/API.md
- docs/ARCHITECTURE.md
- docs/DEVELOPMENT.md
- Wiki/index.md
- Wiki/architecture.md
- Wiki/concepts/order-lifecycle-and-support.md
- Wiki/log.md

Historical files and unrelated dirty files are not edited by this plan.

---

### Task 1: Add the after-sales database schema

**Files:**

- Create server/src/database/migrations/2026-09-16-add-after-sales-workflow.sql
- Create server/src/database/prisma/migrations/20260916110000_after_sales_returns_warranty/migration.sql
- Modify server/src/database/prisma/schema.prisma

**Step 1: Write the failing schema checks**

Add a migration/schema test or validation fixture that expects the four new tables, their foreign keys, their unique idempotency keys, and the indexes required for customer/admin queues. Run:

~~~text
pnpm --dir server prisma:validate
~~~

The check must fail before the models and SQL migration exist.

**Step 2: Add the MySQL forward migration**

Create after_sales_cases with:

~~~text
id INT AUTO_INCREMENT PRIMARY KEY
order_id INT NOT NULL
user_id VARCHAR(255) NULL
case_type VARCHAR(16) NOT NULL
status VARCHAR(32) NOT NULL DEFAULT 'REQUESTED'
reason VARCHAR(64) NOT NULL
customer_note TEXT NOT NULL
resolution VARCHAR(24) NULL
admin_note TEXT NULL
refund_amount DECIMAL(14,0) NOT NULL DEFAULT 0
currency CHAR(3) NOT NULL DEFAULT 'VND'
requested_at DATETIME NOT NULL
approved_at DATETIME NULL
received_at DATETIME NULL
inspected_at DATETIME NULL
resolved_at DATETIME NULL
canceled_at DATETIME NULL
created_at DATETIME NOT NULL
updated_at DATETIME NOT NULL
~~~

Add indexes for order/user/status/requested_at and foreign keys to the existing orders and users tables using the repository’s established constraint names and deletion behavior.

Create after_sales_case_items with:

~~~text
id INT AUTO_INCREMENT PRIMARY KEY
case_id INT NOT NULL
order_item_id INT NOT NULL
requested_quantity INT NOT NULL
approved_quantity INT NOT NULL DEFAULT 0
resolved_quantity INT NOT NULL DEFAULT 0
calculated_refund_amount DECIMAL(14,0) NOT NULL DEFAULT 0
item_reason VARCHAR(128) NULL
restocked_at DATETIME NULL
restocked_by VARCHAR(255) NULL
created_at DATETIME NOT NULL
updated_at DATETIME NOT NULL
~~~

Add foreign keys to cases and order_items, plus indexes for case_id and order_item_id.

Create after_sales_case_events with:

~~~text
id INT AUTO_INCREMENT PRIMARY KEY
case_id INT NOT NULL
from_status VARCHAR(32) NULL
to_status VARCHAR(32) NOT NULL
action VARCHAR(48) NOT NULL
note TEXT NULL
actor_id VARCHAR(255) NULL
created_at DATETIME NOT NULL
~~~

Add case/status and case/created_at indexes and the case foreign key.

Create payment_refunds with:

~~~text
id INT AUTO_INCREMENT PRIMARY KEY
order_payment_id INT NOT NULL
after_sales_case_id INT NOT NULL
amount DECIMAL(14,0) NOT NULL
currency CHAR(3) NOT NULL DEFAULT 'VND'
status VARCHAR(24) NOT NULL
provider_reference VARCHAR(255) NULL
idempotency_key VARCHAR(128) NOT NULL
reason VARCHAR(128) NOT NULL
failure_reason TEXT NULL
requested_by VARCHAR(255) NULL
confirmed_by VARCHAR(255) NULL
requested_at DATETIME NOT NULL
completed_at DATETIME NULL
created_at DATETIME NOT NULL
updated_at DATETIME NOT NULL
~~~

Make idempotency_key unique, enforce one refund record per case/payment combination where supported by the existing MySQL version, and index payment/status. Use the existing order_payments foreign key and do not call a provider refund API from the migration or repository.

**Step 3: Add Prisma parity**

Add Prisma models and relations for all four tables, including the existing Order, User, OrderItem, and OrderPayment relation names. Use the exact database column mappings and VND decimal representation used by the current schema. Keep Prisma additions additive; do not rewrite legacy models or historical migrations.

**Step 4: Verify the schema**

Run:

~~~text
pnpm --dir server prisma:validate
pnpm --dir server prisma:generate
git diff --check
~~~

Expected: validation and generation pass, the migration is forward-only, and no unrelated file is staged.

**Step 5: Commit**

~~~text
git add server/src/database/migrations/2026-09-16-add-after-sales-workflow.sql server/src/database/prisma/migrations/20260916110000_after_sales_returns_warranty/migration.sql server/src/database/prisma/schema.prisma
git commit -m "feat(after-sales): add returns and warranty schema"
~~~

---

### Task 2: Implement policy, state transitions, and refund calculation with TDD

**Files:**

- Create server/src/after-sales/after-sales.types.ts
- Create server/src/after-sales/after-sales.policy.ts
- Create server/src/after-sales/refund-calculator.ts
- Create server/src/after-sales/after-sales.dto.ts
- Create server/src/after-sales/after-sales.validator.ts
- Create server/src/after-sales/__tests__/after-sales.policy.test.ts
- Create server/src/after-sales/__tests__/refund-calculator.test.ts

**Step 1: Write policy tests first**

Cover these exact boundary cases:

- status 1 with delivered_at null is ineligible for both types.
- a return at one millisecond before delivered_at plus seven UTC calendar days is eligible.
- a return exactly at the seven-day boundary is eligible.
- a return one millisecond after the boundary is rejected.
- a warranty with null or zero warranty months is rejected.
- a warranty at the inclusive month boundary is eligible and after it is rejected.
- statuses 0 and 2 are rejected even if timestamps would otherwise qualify.
- the transition map accepts only the approved edges and rejects every terminal-state transition.

Use exact public helpers:

~~~text
export const RETURN_WINDOW_DAYS = 7;
export function isReturnEligible(deliveredAt: Date | null, status: number, now: Date): boolean;
export function isWarrantyEligible(deliveredAt: Date | null, status: number, warrantyMonths: number | null, now: Date): boolean;
export function canTransition(from: AfterSalesStatus, to: AfterSalesStatus): boolean;
~~~

Run the focused file and confirm it fails because the implementation is absent.

**Step 2: Implement deterministic policy code**

Use UTC date arithmetic. Adding warranty months must preserve the calendar-month rule used by the service and handle end-of-month dates deterministically. Keep status 1 as the delivery-complete invariant and expose the eligibility result as a server-side value for UI rendering.

Define the state/status/provider-independent types:

~~~text
AfterSalesCaseType = 'RETURN' | 'WARRANTY'
AfterSalesResolution = 'REFUND' | 'REPLACEMENT' | 'REPAIR'
AfterSalesStatus = 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'CANCELED' | 'RECEIVED' | 'INSPECTING' | 'REFUND_PENDING' | 'REPAIRING' | 'REPLACEMENT_PENDING' | 'RESOLVED'
PaymentRefundStatus = 'MANUAL_REQUIRED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED'
~~~

**Step 3: Write refund tests first**

Use the exact calculator input:

~~~text
export function calculateRefund(input: {
  selectedGross: number;
  merchandiseGross: number;
  orderDiscount: number;
  paidAmount: number;
  outstandingRefunds: number;
}): number;
~~~

Test no discount, proportional discount, zero/negative payable, rounding of fractional VND allocations, selected gross greater than merchandise gross, prior successful/processing refunds, paid amount zero, and repeated calculation producing the same integer result. The expected output is never negative and never exceeds paidAmount minus outstandingRefunds.

**Step 4: Implement the calculator and validators**

Use a shared roundVnd helper with explicit half-up behavior for non-negative values. Reject malformed values before the service: integer positive quantities, non-empty allowed reason/note fields, supported case types/resolutions/status actions, and bounded pagination/filter values. Separate customer create input, guest proof input, admin transition input, restock input, and manual refund confirmation input.

Run:

~~~text
pnpm --dir server exec vitest run src/after-sales/__tests__/after-sales.policy.test.ts src/after-sales/__tests__/refund-calculator.test.ts
~~~

Expected: all policy and calculator tests pass.

**Step 5: Commit**

~~~text
git add server/src/after-sales/after-sales.types.ts server/src/after-sales/after-sales.policy.ts server/src/after-sales/refund-calculator.ts server/src/after-sales/after-sales.dto.ts server/src/after-sales/after-sales.validator.ts server/src/after-sales/__tests__/after-sales.policy.test.ts server/src/after-sales/__tests__/refund-calculator.test.ts
git commit -m "feat(after-sales): add policy and refund rules"
~~~

---

### Task 3: Build the repository boundary and safe order/payment projections

**Files:**

- Create server/src/after-sales/after-sales.repository.ts
- Modify server/src/orders/orders.repository.ts
- Modify server/src/orders/orders.types.ts
- Modify server/src/orders/orders.service.ts

**Step 1: Define repository contracts before SQL**

Implement an injectable AfterSalesRepository with explicit methods:

~~~text
getOrderAccessSnapshot(orderId: number, userId?: string): Promise<AfterSalesOrderSnapshot | null>
getGuestOrderAccessSnapshot(orderId: number, guestOrderToken: string): Promise<AfterSalesOrderSnapshot | null>
getCaseForCustomer(caseId: number, userId: string): Promise<AfterSalesCaseView | null>
getCaseForGuest(caseId: number, orderId: number, guestOrderToken: string): Promise<AfterSalesGuestCaseView | null>
getCaseForAdmin(caseId: number): Promise<AfterSalesAdminCaseView | null>
listCases(filter: AfterSalesListFilter): Promise<AfterSalesCaseListResult>
getSelectedOrderItemsForUpdate(tx: TransactionContext, orderId: number, itemIds: number[]): Promise<AfterSalesOrderItemSnapshot[]>
getCommittedQuantitiesForUpdate(tx: TransactionContext, orderId: number, itemIds: number[]): Promise<Map<number, number>>
insertCase(tx: TransactionContext, data: NewAfterSalesCase): Promise<number>
insertCaseItems(tx: TransactionContext, caseId: number, items: NewAfterSalesCaseItem[]): Promise<void>
insertCaseEvent(tx: TransactionContext, event: NewAfterSalesCaseEvent): Promise<void>
getCaseForUpdate(tx: TransactionContext, caseId: number): Promise<AfterSalesCaseRow | null>
getCaseItemsForUpdate(tx: TransactionContext, caseId: number): Promise<AfterSalesCaseItemRow[]>
getPaymentForUpdate(tx: TransactionContext, orderId: number): Promise<OrderPaymentForRefund | null>
getRefundTotalsForUpdate(tx: TransactionContext, paymentId: number): Promise<RefundTotals>
insertPaymentRefund(tx: TransactionContext, refund: NewPaymentRefund): Promise<number>
updatePaymentRefund(tx: TransactionContext, refundId: number, patch: PaymentRefundPatch): Promise<void>
updateCase(tx: TransactionContext, caseId: number, patch: AfterSalesCasePatch): Promise<void>
updateCaseItem(tx: TransactionContext, caseItemId: number, patch: AfterSalesCaseItemPatch): Promise<void>
listCaseEvents(caseId: number): Promise<AfterSalesCaseEventView[]>
~~~

**Step 2: Add parameterized SQL and lock ordering**

Use parameterized MySQL queries only. For create, lock the order first, then selected order_items, then existing after-sales case items for those order_item_ids. For admin state/refund/restock operations, lock case, case items, payment/refunds, and product rows in a stable order. Do not interpolate user-provided IDs into SQL.

The order access snapshot must include status, delivered_at, total_price, discount, currency, guest-token ownership proof, payment amount/status/provider, and immutable item fields: order_item_id, product_id, quantity, unit price/line total, and warrantyMonthsSnapshot. Expose only normalized safe fields to controllers.

**Step 3: Reuse existing guest-token verification**

Find the existing order guest-token hash/matching helper and call it from the repository/service boundary. It must return a safe order snapshot only after a successful comparison. Do not duplicate a weaker token comparison or persist a new plaintext token.

**Step 4: Extend order projections**

Add delivered_at and after-sales eligibility inputs to server order summary/detail types and queries. Preserve existing response keys and historical payment labels. Do not let the client submit or mutate delivery timestamps, warranty snapshots, prices, discounts, or payment totals.

Run:

~~~text
pnpm --dir server typecheck
~~~

Expected: the repository contracts compile without changing unrelated order endpoints.

**Step 5: Commit**

~~~text
git add server/src/after-sales/after-sales.repository.ts server/src/orders/orders.repository.ts server/src/orders/orders.types.ts server/src/orders/orders.service.ts
git commit -m "feat(after-sales): add locked order access boundary"
~~~

---

### Task 4: Implement customer and guest case creation, listing, lookup, and cancellation

**Files:**

- Modify server/src/after-sales/after-sales.service.ts
- Create server/src/after-sales/__tests__/after-sales.service.test.ts

**Step 1: Write service tests first**

Mock the repository and transaction context. Cover:

- authenticated customer creates a valid RETURN for an owned delivered order.
- authenticated customer creates a valid WARRANTY using the item warranty snapshot.
- guest creation succeeds only with matching orderId and guestOrderToken.
- status, delivery window, warranty window, payment currency, and server-side item snapshot are authoritative.
- selected quantity greater than ordered quantity or remaining quantity returns the conflict outcome.
- a second case cannot consume already committed quantity.
- empty item selection, duplicate item IDs, invalid type, invalid reason, or malformed note is rejected before transaction work.
- create inserts REQUESTED plus one case event and no refund.
- list/detail hide cases owned by another user.
- only REQUESTED can be canceled; cancellation inserts one event and is idempotent for a repeated same request.

Use exact service methods:

~~~text
createCustomerCase(orderId: number, userId: string, input: CreateAfterSalesCaseInput): Promise<AfterSalesCaseView>
createGuestCase(input: CreateGuestAfterSalesCaseInput): Promise<AfterSalesGuestCaseView>
listCustomerCases(userId: string, filter: AfterSalesListFilter): Promise<AfterSalesCaseListResult>
getCustomerCase(caseId: number, userId: string): Promise<AfterSalesCaseView>
lookupGuestCases(orderId: number, guestOrderToken: string): Promise<AfterSalesGuestCaseListResult>
getGuestCase(caseId: number, orderId: number, guestOrderToken: string): Promise<AfterSalesGuestCaseView>
cancelCustomerCase(caseId: number, userId: string): Promise<AfterSalesCaseView>
cancelGuestCase(caseId: number, orderId: number, guestOrderToken: string): Promise<AfterSalesGuestCaseView>
~~~

Run the focused service test and confirm it fails before implementation.

**Step 2: Implement transactional creation**

Within one withTransaction call:

1. Lock and load the order access snapshot.
2. Prove authenticated ownership or guest token possession.
3. Verify status 1, delivered_at, current UTC time, and case type policy.
4. Lock selected order items and prior committed quantities.
5. Validate requested quantities against ordered and remaining quantities.
6. Calculate server-side selected gross/refund estimate for RETURN/REFUND cases; store zero until a refund action is created if the case is WARRANTY or has no REFUND resolution yet.
7. Insert the case, items, and REQUESTED event.

Use an injected clock or a single transaction-start timestamp so eligibility and event timestamps are consistent and testable.

**Step 3: Implement safe reads and cancellation**

List and detail responses include safe item snapshots, current status, eligibility result, refund status/amount, and customer-visible events. Guest responses omit admin_note and actor_id. Cancellation locks the case, checks ownership/proof and REQUESTED status, then writes one CANCELED event. A repeated cancellation returns the current canceled view without adding a second event.

**Step 4: Run focused verification**

~~~text
pnpm --dir server exec vitest run src/after-sales/__tests__/after-sales.service.test.ts
pnpm --dir server typecheck
~~~

Expected: the tests prove seven-day and warranty enforcement, guest proof, quantity accounting, and cancellation idempotency.

**Step 5: Commit**

~~~text
git add server/src/after-sales/after-sales.service.ts server/src/after-sales/__tests__/after-sales.service.test.ts
git commit -m "feat(after-sales): support customer case requests"
~~~

---

### Task 5: Implement admin transitions, manual refunds, and idempotent restock

**Files:**

- Modify server/src/after-sales/after-sales.service.ts
- Modify server/src/inventory/inventory.service.ts or its existing transaction movement boundary
- Extend server/src/after-sales/__tests__/after-sales.service.test.ts

**Step 1: Write admin service tests first**

Cover every valid transition and representative invalid transition. Assert invalid transitions return the conflict result and do not add an event. Cover:

- APPROVED records approved_at.
- RECEIVED and INSPECTING record the corresponding timestamps.
- INSPECTING with REFUND enters REFUND_PENDING.
- INSPECTING with REPAIR enters REPAIRING.
- INSPECTING with REPLACEMENT enters REPLACEMENT_PENDING.
- terminal RESOLVED, REJECTED, and CANCELED cannot transition.
- admin note updates do not accidentally change status.
- refund creation computes selected-gross proportional discount, rounds whole VND, caps by outstanding paid, and creates one payment_refunds row.
- PayOS/COD refund creation is MANUAL_REQUIRED and never invokes a provider refund API.
- repeated refund command with the same case/payment returns the existing refund record without duplicate money.
- manual confirmation requires a non-empty external reference, changes MANUAL_REQUIRED or PROCESSING to SUCCEEDED once, sets completed_at/confirmed_by, and updates the payment aggregate to partially_refunded or refunded.
- failed/canceled refund records cannot be confirmed as succeeded without a new validated action.
- restock is rejected before RECEIVED, locks the item/product, creates one restock_returned_item movement, and repeated restock is idempotent.
- repair/replacement resolution does not create a shipment or automatic replacement order.

**Step 2: Implement the explicit transition map**

Use this map in one function shared by service tests and controller validation:

~~~text
REQUESTED: APPROVED, REJECTED, CANCELED
APPROVED: RECEIVED, CANCELED
RECEIVED: INSPECTING
INSPECTING: REFUND_PENDING, REPAIRING, REPLACEMENT_PENDING, REJECTED
REFUND_PENDING: RESOLVED
REPAIRING: RESOLVED
REPLACEMENT_PENDING: RESOLVED
REJECTED: none
CANCELED: none
RESOLVED: none
~~~

Admin action must lock the case and current case items, validate the requested resolution/status pair, apply the timestamp for the new status, and insert exactly one event when a status changes.

**Step 3: Implement refund orchestration**

Lock the case, case items, selected order payment, and existing refund totals in a stable order. Select the payment for the order only from server-side paid/eligible payment data. Calculate:

1. selectedGross from immutable selected order-item snapshots;
2. merchandiseGross from all order-item snapshot totals;
3. allocated discount as roundVnd(order.discount * selectedGross / merchandiseGross);
4. calculated amount as max(selectedGross - allocated discount, 0);
5. outstanding paid as payment amount minus successful or processing refund totals;
6. refund amount as the minimum of calculated amount and outstanding paid.

Require currency VND and whole-number amounts. Create a unique idempotency key derived from case/payment identity and keep the first record as the source of truth. Keep the case refund_amount synchronized with the calculated/confirmed amount without treating a client amount as authoritative.

**Step 4: Implement manual confirmation and payment aggregate update**

Manual confirmation must lock the refund and payment, require a non-blank external reference, update the refund exactly once, and calculate the aggregate from successful refunds. Set the payment status to partially_refunded when the aggregate is positive but below the original paid amount, and refunded when the aggregate reaches the paid amount. Preserve the existing payment status vocabulary/normalization used by the payment plan and add a focused compatibility adapter if the current table uses a different legacy spelling.

**Step 5: Implement restock through the existing inventory boundary**

The transaction locks each case item and its product row, skips already restocked items, inserts exactly one inventory movement with type restock_returned_item and the accepted quantity, and sets restocked_at/restocked_by. Re-running the command returns the authoritative current result and creates no second movement. Do not mutate stock before the case is RECEIVED or INSPECTING.

**Step 6: Run focused verification**

~~~text
pnpm --dir server exec vitest run src/after-sales/__tests__/after-sales.service.test.ts
pnpm --dir server typecheck
pnpm --dir server build
~~~

Expected: all state, refund, payment aggregate, and restock tests pass.

**Step 7: Commit**

~~~text
git add server/src/after-sales/after-sales.service.ts server/src/inventory/inventory.service.ts server/src/after-sales/__tests__/after-sales.service.test.ts
git commit -m "feat(after-sales): add refund and restock operations"
~~~

---

### Task 6: Expose secured customer, guest, and admin APIs

**Files:**

- Create server/src/after-sales/after-sales.controller.ts
- Create server/src/after-sales/after-sales.module.ts
- Create server/src/after-sales/__tests__/after-sales.controller.test.ts
- Create server/src/after-sales/__tests__/after-sales.integration.test.ts
- Modify server/src/app.module.ts

**Step 1: Write controller contract tests first**

Assert request validation and route guards for:

- authenticated customer create/list/detail/cancel.
- guest create/lookup/detail with orderId plus token proof.
- admin list/detail/transition/restock/refund/manual-refund-confirm.
- malformed payload returns 400.
- unauthenticated protected request is rejected.
- authenticated non-owner is hidden or rejected according to the existing route convention.
- non-admin cannot reach admin operations.
- invalid status transitions return 409.
- valid request outside policy returns 422.
- hidden/nonexistent case returns 404 without leaking whether another guest order has that ID.

**Step 2: Implement the module**

Create AfterSalesModule with AfterSalesRepository, AfterSalesService, controller, and the existing Orders/Inventory/Payments providers needed by the service. Register it in AppModule. Do not import Stripe or create a circular PaymentsModule-to-AfterSalesModule dependency. If an existing module owns an inventory transaction service, export/import that provider through its current module boundary.

**Step 3: Implement exact routes**

Authenticated customer:

~~~text
POST /api/orders/:oid/after-sales-cases
GET /api/after-sales/cases
GET /api/after-sales/cases/:id
POST /api/after-sales/cases/:id/cancel
~~~

Guest:

~~~text
POST /api/orders/guest/after-sales-cases
POST /api/orders/guest/after-sales-cases/lookup
POST /api/orders/guest/after-sales-cases/:id
~~~

Admin:

~~~text
GET /api/admin/after-sales/cases
GET /api/admin/after-sales/cases/:id
PATCH /api/admin/after-sales/cases/:id
POST /api/admin/after-sales/cases/:id/restock
POST /api/admin/after-sales/cases/:id/refund
POST /api/admin/after-sales/cases/:id/manual-refund-confirm
~~~

Use the existing Zod validation pipe, AuthGuard, RolesGuard, CSRF behavior, request correlation, and route-local { msg, ...data } response shape. Guest responses serialize through a dedicated safe mapper that omits admin notes and actor IDs.

**Step 4: Run focused verification**

~~~text
pnpm --dir server exec vitest run src/after-sales/__tests__/after-sales.controller.test.ts
pnpm --dir server typecheck
pnpm --dir server build
~~~

Expected: all routes compile and the guard/error contract is covered.

**Step 5: Commit**

~~~text
git add server/src/after-sales/after-sales.controller.ts server/src/after-sales/after-sales.module.ts server/src/after-sales/__tests__/after-sales.controller.test.ts server/src/app.module.ts
git commit -m "feat(after-sales): expose secured case APIs"
~~~

---

### Task 7: Add order-detail after-sales projections without leaking sensitive fields

**Files:**

- Modify server/src/orders/orders.repository.ts
- Modify server/src/orders/orders.service.ts
- Modify server/src/orders/orders.types.ts
- Modify client/src/features/orders/types.ts

**Step 1: Write projection tests**

Add focused server tests that assert authenticated and guest order details include:

- delivered_at;
- item id, quantity, snapshot line total, and warrantyMonthsSnapshot;
- server-computed returnEligible and warrantyEligible values where the order/item is eligible;
- existing payment method/currency fields.

Assert that guest responses do not include guest token hashes, admin notes, provider secrets, or internal actor identifiers.

**Step 2: Implement server projections**

Extend only the existing order detail/summary queries and mappers. Use the authoritative clock/policy helper for eligibility. Preserve current keys and aliases; add fields rather than renaming route-local payload data. Ensure historical completed orders with a backfilled delivered_at remain readable, while new status-1 transitions use the actual delivery timestamp.

**Step 3: Update client contracts**

Add nullable delivered_at and item warranty/eligibility fields to the existing order types. Keep historical payment labels for old records, but do not expose Stripe, card, or bank_transfer as selectable new checkout methods.

**Step 4: Verify**

~~~text
pnpm --dir server typecheck
pnpm --dir client exec tsc -p tsconfig.json --noEmit
~~~

Expected: order history and guest lookup compile against additive fields.

**Step 5: Commit**

~~~text
git add server/src/orders/orders.repository.ts server/src/orders/orders.service.ts server/src/orders/orders.types.ts client/src/features/orders/types.ts
git commit -m "feat(orders): expose after-sales eligibility data"
~~~

---

### Task 8: Build authenticated and guest customer UI

**Files:**

- Create client/src/features/after-sales/api.ts
- Create client/src/features/after-sales/types.ts
- Create client/src/features/after-sales/components/AfterSalesCaseForm.tsx
- Create client/src/features/after-sales/components/AfterSalesCaseTimeline.tsx
- Create client/src/features/after-sales/pages/AfterSalesPage.tsx
- Create client/src/features/after-sales/pages/AfterSalesCaseDetailPage.tsx
- Create client/src/features/after-sales/__tests__/AfterSalesCaseForm.test.tsx
- Create client/src/features/after-sales/__tests__/AfterSalesPage.test.tsx
- Modify client/src/features/orders/api.ts
- Modify client/src/features/orders/pages/OrderHistoryPage.tsx
- Modify client/src/features/orders/pages/GuestOrderLookupPage.tsx
- Modify client/src/routes/router.tsx
- Create client/src/styles/_after-sales.scss
- Modify client/src/styles/index.scss

**Step 1: Write component tests first**

Cover:

- the order detail shows Return or warranty only for server-eligible items;
- the form supports RETURN/WARRANTY, item quantity, reason, and note;
- quantity controls cannot exceed remaining quantity;
- client validation blocks empty items/note before request;
- loading, inline error, success, empty, and cancellation states are explicit;
- authenticated case list/detail renders status, refund state, timeline, and next action;
- guest lookup keeps orderId/token in controlled in-memory component state or the existing safe session flow and never puts the token in a route URL, query string, localStorage, or rendered text;
- guest views omit internal admin note and actor fields.

Run the focused Vitest files and confirm they fail before implementation.

**Step 2: Add API wrappers**

Implement the existing HTTP client pattern with these functions:

~~~text
createAfterSalesCase(orderId, input)
fetchAfterSalesCases(params)
fetchAfterSalesCase(caseId)
cancelAfterSalesCase(caseId)
createGuestAfterSalesCase(input)
lookupGuestAfterSalesCases(input)
fetchGuestAfterSalesCase(caseId, input)
~~~

Use the route-local payload keys and error envelope returned by the server. Never log or serialize the guest token outside the controlled request body.

**Step 3: Add the customer form and timeline**

Render server-provided item snapshots and remaining quantities. Explain the seven-day return rule, warranty snapshot, and manual-refund status in concise professional copy. Show calculated refund only when the server provides it; do not calculate a payable amount as an authority on the client. Keep validation and checkout/after-sales errors inline, using the existing global toast only for non-blocking success confirmation.

**Step 4: Add routes and order actions**

Add authenticated /after-sales and /after-sales/:id routes. Add a safe order-detail action that navigates with order ID only; the server rechecks eligibility. Add guest creation/lookup/detail to the existing guest order flow without putting the guest token in a URL.

**Step 5: Add responsive styles**

Create BEM-scoped after-sales styles using the existing storefront tokens and breakpoints. The form, status timeline, item table, and refund panel must remain readable at desktop and mobile widths, with explicit loading/empty/error states.

**Step 6: Run focused verification**

~~~text
pnpm --dir client test -- --run src/features/after-sales/__tests__/AfterSalesCaseForm.test.tsx src/features/after-sales/__tests__/AfterSalesPage.test.tsx
pnpm --dir client exec tsc -p tsconfig.json --noEmit
pnpm --dir client build
~~~

Expected: the customer and guest views compile and the tests prove token-safe rendering and eligibility-gated actions.

**Step 7: Commit**

~~~text
git add client/src/features/after-sales client/src/features/orders/api.ts client/src/features/orders/pages/OrderHistoryPage.tsx client/src/features/orders/pages/GuestOrderLookupPage.tsx client/src/features/orders/types.ts client/src/routes/router.tsx client/src/styles/_after-sales.scss client/src/styles/index.scss
git commit -m "feat(client): add customer after-sales workspace"
~~~

---

### Task 9: Build the admin after-sales queue and detail controls

**Files:**

- Modify client/src/features/admin/api.ts
- Modify client/src/components/layout/AdminSidebar.tsx
- Modify client/src/routes/router.tsx
- Modify client/src/styles/index.scss
- Modify client/src/styles/_after-sales.scss
- Create or extend client/src/features/after-sales/pages/AdminAfterSalesPage.tsx
- Create or extend client/src/features/after-sales/pages/AdminAfterSalesDetailPage.tsx
- Extend client/src/features/after-sales/__tests__/AfterSalesPage.test.tsx

**Step 1: Write admin UI tests first**

Cover queue filters/pagination, empty/loading/error states, detail item snapshots, eligibility result, calculated refund, payment status, event history, transition controls, restock controls, and manual refund confirmation. Assert admin-only notes and actor fields are rendered only in the admin view. Assert a successful action refreshes authoritative detail state and repeated restock/refund responses do not duplicate UI rows.

**Step 2: Add admin API wrappers**

Use authenticated HTTP calls and existing admin response conventions for:

~~~text
fetchAdminAfterSalesCases(params)
fetchAdminAfterSalesCase(caseId)
updateAdminAfterSalesCase(caseId, input)
restockAdminAfterSalesCase(caseId, input)
createAdminAfterSalesRefund(caseId, input)
confirmAdminAfterSalesRefund(caseId, input)
~~~

Do not expose raw payment provider credentials or guest tokens in query parameters.

**Step 3: Add route and navigation**

Add /admin/after-sales to the existing admin shell and sidebar. Reuse the established admin table/card/status/button/responsive primitives. The detail view must make the approved state machine obvious, disable impossible transitions, and show that PayOS/COD refunds require manual external-reference confirmation.

**Step 4: Run focused verification**

~~~text
pnpm --dir client test -- --run src/features/after-sales/__tests__/AfterSalesPage.test.tsx
pnpm --dir client exec tsc -p tsconfig.json --noEmit
pnpm --dir client build
~~~

Expected: the admin route is reachable, responsive, and does not alter unrelated Dashboard/admin pages.

**Step 5: Commit**

~~~text
git add client/src/features/admin/api.ts client/src/components/layout/AdminSidebar.tsx client/src/routes/router.tsx client/src/styles/index.scss client/src/styles/_after-sales.scss client/src/features/after-sales
git commit -m "feat(admin): add after-sales operations workspace"
~~~

---

### Task 10: Integrate, document, and verify the complete workflow

**Files:**

- Modify docs/API.md
- Modify docs/ARCHITECTURE.md
- Modify docs/DEVELOPMENT.md
- Modify Wiki/index.md
- Modify Wiki/architecture.md
- Modify Wiki/concepts/order-lifecycle-and-support.md
- Modify Wiki/log.md

**Step 1: Add integration coverage**

Add MySQL-backed integration tests for:

- authenticated and guest creation within the return boundary;
- rejection immediately after the boundary;
- warranty snapshot eligibility;
- quantity exhaustion after prior cases;
- token mismatch isolation;
- invalid state transition with no duplicate event;
- deterministic partial/full refund aggregate;
- manual refund confirmation;
- one-time restock movement.

Use an isolated test database only. Do not run production reset/seed operations.

**Step 2: Update maintained docs**

Document the routes, request shapes, safe guest proof behavior, status machine, seven-day/warranty policy, VND refund formula, manual PayOS/COD refund workflow, restock idempotency, and the non-goals. Update architecture ownership and append one concise dated line to Wiki/log.md. Bump Wiki/index.md Last updated date. Do not rewrite archived Stripe history.

**Step 3: Run complete checks**

~~~text
pnpm --dir server prisma:validate
pnpm --dir server typecheck
pnpm --dir server build
pnpm --dir server lint
pnpm --dir server test -- --run
pnpm --dir client exec tsc -p tsconfig.json --noEmit
pnpm --dir client build
pnpm --dir client lint
pnpm --dir client test -- --run
git diff --check
~~~

If the isolated MySQL target is available, also run:

~~~text
pnpm --dir server test:integration
pnpm --dir server prisma:migrate:status
~~~

Run Playwright for authenticated customer creation/cancellation, guest lookup/create/detail with token secrecy, admin transition/refund/manual-confirm/restock, refresh persistence, and desktop/mobile layouts. Record environment failures separately from application failures.

**Step 4: Review security and scope**

Inspect the final diff for plaintext guest tokens, secrets, unparameterized SQL, missing AuthGuard/RolesGuard/CSRF boundaries, client-authoritative money/eligibility fields, duplicate state events, duplicate inventory movements, and edits to client/src/i18n/en.ts. Confirm no Stripe/bank-transfer runtime behavior is reintroduced.

**Step 5: Commit documentation and test changes**

~~~text
git add docs/API.md docs/ARCHITECTURE.md docs/DEVELOPMENT.md Wiki/index.md Wiki/architecture.md Wiki/concepts/order-lifecycle-and-support.md Wiki/log.md server/src/after-sales/__tests__/after-sales.integration.test.ts
git commit -m "docs(after-sales): document returns and refund operations"
~~~

Expected: the branch contains the approved after-sales feature, payment integration remains VND/PayOS/COD-only, the unrelated i18n modification remains outside the feature commits, and main is untouched until a separately authorized PR/merge action.
