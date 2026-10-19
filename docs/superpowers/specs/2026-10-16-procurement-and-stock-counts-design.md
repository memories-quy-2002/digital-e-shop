# Suppliers, receiving and stock counts

Date: 2026-10-16
Status: approved by the owner on 2026-10-16; implementation has not started.
Scope: P1-01 for one retailer and one warehouse.
Confirmed by owner: only admins perform all operations in this release.
Related: [P1 backlog](../../backlog/P1.md),
[QA checklist](../../bmad/qa-checklist.md),
[orchestration](../../CODEX_ORCHESTRATION.md).

## Outcome and success criteria

An admin can trace incoming sellable units to a supplier, purchase order and
posted receipt, retain the acquisition cost recorded on each receipt, and
review stock-count differences before applying them. Existing sales,
reservations and internal delivery continue to use the same inventory.

Success means receipts cannot add stock twice, accepted receipt quantities
cannot exceed their purchase-order obligation, and count approval cannot
overwrite an intervening inventory change or undercut active reservations.

The owner approved P1-01, admin-only access and this written design, including
the counting basis below. The existing stock field is not a complete physical
warehouse ledger.

Implementation: [task plan](../plans/2026-10-16-procurement-and-stock-counts.md).

## Existing source boundaries

- `products.stock` is the authoritative book quantity. Order placement and
  paid-checkout finalization deduct it before packing or physical dispatch.
- Active `inventory_reservations` are included in `products.stock` and are
  subtracted when computing customer-facing `available_stock`.
- `checkout-reservation.repository.ts` locks products by ascending ID before
  validating availability. The new workflows must follow the same ordering.
- `products.service.ts` already supports both product-editor stock changes
  and dedicated inventory adjustments. Both must invalidate stale counts.
- Inventory movements can be written transactionally; older asynchronous
  movement helpers are best effort and cannot serve as a revision counter.
- `admin_audit_events` provides transactional operator audit history.
- MySQL feature repositories own runtime persistence. Additive migrations and
  the Prisma projection must describe the same tables and columns.
- Order-level packing and delivery states do not reliably establish all
  physical quantities still in the warehouse, including legacy orders.

## Scope and boundaries

Included: supplier contacts and archival; purchase-order drafts and confirmation;
immutable confirmed line snapshots; partial receiving with accepted, rejected
and missing quantities; immutable actual unit acquisition costs; reviewed count
sessions; inventory movements; admin audit; bilingual responsive admin screens.

This release uses one warehouse and whole-number VND. It does not introduce
supplier payments or debt, tax accounting, landed-cost allocation, FIFO or
weighted-average valuation, gross-profit reports, invoice issuance, serial/IMEI
tracking, multiple locations, or physical dispatch/allocation accounting.
Existing inventory without a receipt has unknown acquisition cost, not zero.

Supplier communication remains outside the application: confirming a purchase
order records the admin's decision and does not send an email or place an
external supplier order. No new integration, worker or dependency is needed.

## Approaches considered

1. **One-warehouse procurement with optimistic count approval (selected).**
   Reuse current stock, reservations, transactional movements and audit. A
   product revision detects intervening inventory mutations. Stale counts
   require a recount. This addresses P1-01 without changing checkout semantics.
2. **Freeze sales while a count is open.** Easier reconciliation but requires
   blocking every stock writer and customer checkout for selected products.
   This adds operational disruption and is not selected.
3. **Full physical warehouse/allocation ledger.** Supports counting all units
   physically on the premises, including sold units waiting to leave. It
   requires explicit picking, dispatch, failed-delivery return and legacy
   reconciliation records. That is a separate feature and is not selected.

## Approved counting basis

Count **unallocated warehouse units**: sellable units not already deducted for
a placed order. Include units held by active pending checkout reservations,
because those holds have not yet deducted `products.stock` or created an order.
Do not add active reservation quantities to the entered count a second time.

Exclude already sold units awaiting picking, packing or delivery, rejected
incoming goods, and goods quarantined as damaged. The admin must segregate or
identify those goods before counting. The count screen must show these
instructions before the first count and label its quantity accordingly.

For example, a shelf holds 12 units, of which 2 belong to already placed orders
and 3 are temporary checkout holds. The entered count is 10, not 12 or 7. The
system stores `stock = 10` and derives availability as `10 - 3 = 7` while those
holds remain active. Approval rejects a count below current active holds.

This is not a claim to reconcile gross physical warehouse stock. If the owner
needs to count every unit on the premises, the design must be expanded to
include a maintained allocation/dispatch ledger before implementation.

## Supplier workflow

An admin creates and edits a supplier code, name, contact name, email, phone,
address and notes. Code and name are required; contact fields are optional,
bounded and validated. Codes are normalized and unique.

Suppliers are archived rather than deleted. An archived supplier cannot be
selected for a new or newly confirmed purchase order. Existing confirmed
orders may still receive goods, preserving their original obligation and
supplier snapshot. Audit records retain actor, action and changed field names
without copying contact details into general operation logs.

## Purchase-order workflow

- `DRAFT`: select an active supplier and existing active product SKUs; enter
  positive whole quantities, planned unit cost in VND and optional notes.
  A product appears at most once per order. Editing uses a document version to
  reject concurrent edits rather than overwriting them.
- `ORDERED`: confirmation freezes supplier identity and product ID/SKU/name,
  ordered quantity and planned unit cost snapshots. A later catalog or supplier
  edit does not rewrite these snapshots. Confirmation does not change stock.
- `PARTIALLY_RECEIVED`: at least one accepted unit has been posted and some
  ordered units remain outstanding.
- `RECEIVED`: cumulative accepted quantity equals the ordered quantity on
  every line. No further receipts may be posted.
- `CLOSED`: admin closes an ordered or partially received order with a required
  reason and an outstanding-quantity summary. Receipts and stock are retained.
- `CANCELED`: admin cancels a draft with a reason. A confirmed order uses close
  instead, preserving the distinction between cancellation and short closing.

Confirmed lines cannot be increased, repriced or deleted in place. Extra units
require a new purchase order. This release rejects over-receiving instead of
introducing an amendment/approval workflow.

## Receiving workflow and costs

Each receipt belongs to one open confirmed purchase order. An admin may receive
a subset of its lines over multiple deliveries. For each included line, enter
expected quantity for this delivery, accepted, rejected and missing quantities;
the three dispositions must sum to the expected quantity. At least one
quantity must be nonzero and the expected quantity cannot exceed the remaining
accepted obligation for that line. Rejection or shortage requires a note.

Only accepted units enter sellable stock. Rejected and missing units remain
outstanding for a later replacement/delivery until accepted or the order is
closed. Therefore cumulative **accepted** quantity cannot exceed ordered
quantity; rejected replacement attempts remain recorded without increasing
stock. Rejected goods are excluded from sellable counts.

Actual unit acquisition cost is recorded per receipt line, defaults to the
planned cost, and requires an explanation when different. Both original planned
cost and actual receipt cost remain immutable after posting. Amounts are
non-negative safe whole VND, and totals are checked for overflow. These records
do not reprice products or retrospectively value legacy stock.

Receipt creation and posting form one transaction; there is no persisted
unposted receipt whose status can be mistaken for received stock. The UI keeps
an unsaved form until the admin reviews and posts it.

Posting locks the purchase order, validates the current outstanding quantities,
then locks affected products in ascending ID order. It inserts the immutable
receipt and lines, adds accepted stock, increments stock revisions, records
receipt-linked inventory movements and product-alert transitions, updates PO
status and appends the admin audit event in the same transaction. It performs
no network work while holding locks.

Each post carries a client-generated idempotency key retained for retries.
A unique `(purchase_order_id, idempotency_key)` constraint and canonical payload
hash ensure that identical retries return the original receipt and changed
payloads using the same key fail with conflict. Simultaneous receipts serialize
on the purchase-order row and cannot consume the same remaining quantity.
Posting failure rolls back stock, movements, costs, document state and audit.
Posted receipts cannot be edited, deleted or reposted.

## Stock-count lifecycle and concurrency

1. Create a `DRAFT` session for a bounded subset of existing active SKUs.
   Capture each product's stock, revision and product identity snapshot under
   product locks. A session has no stock effect while counting.
2. Enter non-negative whole counts and discrepancy notes. A nonzero difference
   requires a reason. The server computes the difference from the saved
   baseline; it does not trust a client-provided adjustment.
3. Submit the complete session for review. The same admin may count and approve;
   this release does not require a second admin. The review summarizes increases,
   decreases, reasons and current reservation commitments.
4. Approval locks the count header and all product rows in ascending ID order.
   It rechecks that every product is active, each stock revision still equals
   the captured revision, and no proposed count is below current active pending
   checkout reservations. Checks and stock writes use the same transaction.
5. If any line is stale or insufficient, reject the whole approval with a
   structured conflict listing affected products. No lines, movements or audit
   approvals commit. The admin explicitly reopens the session, refreshes the
   baseline for affected lines and recounts them; previous observations remain
   available in the audit trail. Refreshing clears affected entered counts.
6. If valid, apply the counted stock, increment revisions for changed products,
   write count-linked movements and any back-in-stock alert transitions, record
   approval and audit, and mark the session `APPROVED` atomically. Equal counts
   are documented without zero-quantity inventory movements.
7. Repeated approval returns the already approved result and never reapplies
   adjustments. Approved sessions are immutable. Draft/submitted sessions can
   be canceled with a required reason and no inventory effect.

Add `products.stock_revision`, initially zero, and increment it atomically on
every actual stock mutation. Cover product-editor and dedicated adjustments,
order deductions, cancellation restocks, soft deletion, new receipts/counts,
retained legacy writers and supported seed updates. A stock change followed by
an equal opposite change must still invalidate an old count. Do not rely on
second-resolution timestamps or best-effort movement records. Use explicit
repository updates rather than a hidden database trigger; verify all writers.

Reservation creation/finalization continues to use the existing product locks.
Pending reservations change availability, not the counted book-stock basis.
Approval reads their current total under product locks and does not lock pending
checkout headers in reverse order. A new reservation must not pass using the
pre-adjustment stock while approval is holding the product lock.

## Persistence and feature ownership

Additive tables: `suppliers`, `purchase_orders`, `purchase_order_items`,
`purchase_receipts`, `purchase_receipt_lines`, `stock_counts`, and
`stock_count_items`. Use appropriate foreign keys, unique supplier codes,
unique document-line product keys, receipt idempotency constraints and indexes
for status/supplier/document/product lookups. Document tables retain immutable
snapshots; catalog/supplier archival cannot remove their history.

Link inventory movements to either a receipt line or count line with nullable
typed references and unique constraints so one document line cannot apply its
stock effect twice. Existing order movements and API fields remain compatible;
the API may add optional source identifiers for the admin ledger.

`server/src/procurement/` owns supplier and purchasing controllers, validators,
services, types and repositories. `server/src/inventory/` owns count workflows
and shared stock revision/movement behavior. Existing products and orders
repositories retain their current stock-writer responsibilities and become
revision-aware. Register the procurement module at the composition root.

Update Prisma models and relations alongside the forward SQL migration. No
DDL is applied to production or a shared database in this task. Migration tests
and integration verification use an explicitly isolated local MySQL target.

## API, UI and authorization

New admin endpoint families under the existing `/api` prefix:

- `/admin/suppliers`: bounded list, create, detail, version-checked edit/archive.
- `/admin/purchase-orders`: bounded list, create/detail/edit draft,
  confirm/cancel/close, and `/:id/receipts` for immutable receipt list/post.
- `/admin/stock-counts`: bounded list, create/detail/edit observations,
  submit/reopen/approve/cancel actions.

Controllers stay thin; owning Zod validators reject unknown write fields,
invalid IDs, duplicate lines, invalid state transitions and unsafe quantities.
Use `AuthGuard` and `RolesGuard` with `@Roles("admin")` on every new controller.
Existing cookie/CSRF/rate-limit behavior remains enforced. Customer and delivery
staff direct calls must fail even when their accounts are otherwise active.
Response keys follow the route-local `{ msg, supplier/order/receipt/count }`
pattern and existing pagination conventions. Concurrent edits and stale counts
return actionable conflicts rather than generic server failures.

Start with at most 100 PO/receipt lines, 200 count lines and 100 list rows per
request; bound text and search inputs and allowlist statuses/sorting. Server
totals, remaining quantities, differences, statuses, actor and timestamps are
authoritative. Clients never choose their actor or stock adjustment directly.

New screens live in `client/src/features/admin/` with feature-local API/type
files and reuse `client/src/lib/http.ts`, current admin layout and theme tokens.
Provide supplier list/form, PO list/detail/receipt review, count list/input/review
and links back to related stock movements. Add navigation and guarded routes
without changing existing product/checkout/fulfillment URLs.

Support English/Vietnamese, light/dark themes, desktop/mobile, keyboard labels
and focus, accessible validation, and explicit loading/empty/error/saved states.
Disable duplicate submission while preserving the same idempotency key for an
uncertain retry. Do not display a success state until the API confirms commit.
Conflict screens preserve entered data and explain which lines need recounting
or reloading. Destructive close/cancel/archive and stock approval summarize the
consequences before submission.

## Acceptance and verification

- Supplier/archive and PO state validations, active-supplier rules, immutable
  snapshots and actual cost snapshots are covered by focused unit tests.
- Admin-only guards reject customer and delivery-staff requests; CSRF still
  protects writes. Audit contains real actor IDs without unnecessary contact PII.
- Partial accepted receipts add exactly their accepted quantities; rejected and
  missing quantities add no stock and remain outstanding; short close is audited.
- Duplicate receipt posts have one stock/movement/cost effect; changed-payload
  key reuse conflicts. Concurrent receipts cannot over-receive.
- An injected failure after a stock update rolls back all related rows.
- Count approval correctly handles zero, increase, decrease and no difference,
  is idempotent, and preserves its reviewed immutable result.
- Concurrent checkout, receipt, manual adjustment, cancellation, catalog soft
  deletion and competing count approvals cause safe serialization or conflicts.
  A change-and-reversal still conflicts through the revision counter.
- Counts below active reservations are rejected; reservations cannot race past
  a committed decrease. The counting-basis example is covered in logic/UI tests.
- Relevant client/server unit suites, typechecks, lint and builds pass. Run the
  isolated-MySQL integration suite for actual locks, rollback and concurrency;
  mocks alone do not prove these properties.
- Browser evidence covers the three admin workflows on desktop/mobile, both
  locales/themes, keyboard operation, validation, retry and stale-count recovery.

Update API/OpenAPI, testing/development guidance, the P1 tracker and relevant
Wiki product/inventory/procurement concepts when implementation is complete.
Bump the Wiki index date and append its maintenance log. Keep local, simulated,
browser and real-MySQL evidence distinct; do not claim production acceptance.

## Delivery sequence

After written-design approval, create a bounded implementation plan covering
schema/contracts, backend workflows, admin UI, integration/browser verification
and documentation. Main Codex owns shared contracts, integration, review and
Git; independent backend/frontend packets may use the configured Luna roles.

The current source baseline is `bugfix/audit-feature-findings` at `0196f9e` and
depends on the P0 changes in open PR #320. Keep this feature's commits separate
from that PR and preserve the existing uncommitted internal-delivery documents.
Do not merge PR #320, modify `main`, create a PR or deploy as part of design
preparation. Resolve the implementation branch/base before product edits.
