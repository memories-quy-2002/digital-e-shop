# After-Sales Returns, Warranty, and Refund Design

**Date:** 2026-09-16
**Status:** Approved for implementation
**Scope:** Add authenticated and guest return/warranty cases with a seven-day return window, warranty eligibility from order snapshots, auditable item-level processing, and VND refund records for PayOS and COD orders.

## Goal

Give Digital-E a complete post-purchase workflow: a customer can request a return or warranty case, an admin can review and inspect the selected items, inventory can be restocked exactly once when appropriate, and a refund can be tracked to manual confirmation without overstating PayOS or COD settlement.

This design depends on the payment contract in `2026-09-16-vnd-payos-cod-payment-reconciliation-design.md`.

## Decisions

### 1. Eligibility

Return requests are allowed only for orders with status `1` and a non-null `delivered_at` timestamp. The request is accepted through the inclusive boundary of `delivered_at + 7 days` using UTC timestamps. Canceled, pending, and legacy orders without a delivery timestamp are not eligible for a new return request.

Warranty requests are allowed while the selected order-item snapshot has a positive `warranty_months_snapshot` and the current time is within `delivered_at + warranty_months_snapshot` months. The product’s current warranty value is never used to decide eligibility for an existing order.

The server validates each selected item and quantity against the order snapshot and subtracts quantities already committed by approved, processing, or resolved return cases. There can be only one open case for the same order item at a time. A resolved warranty claim does not permanently consume the item quantity, so a later valid warranty claim remains possible.

### 2. Customer identity

Authenticated customers use the existing session, ownership, and role boundaries. Guest customers use `orderId + guestOrderToken` for every create and lookup request. The raw token is never stored in a case or returned by the API; the existing order token hash remains the only persisted guest secret.

The guest API returns only the guest-safe order/case view already allowed by the guest lookup boundary. It never exposes internal admin notes, actor identifiers, provider credentials, or raw token material.

### 3. Case types and resolutions

Case types:

- `RETURN` — customer requests to return an item within seven days.
- `WARRANTY` — customer reports a defect or warranty issue during the snapshot warranty period.

Resolutions:

- `REFUND` — refund the eligible VND amount after inspection.
- `REPLACEMENT` — admin records a replacement outcome; shipment/inventory fulfillment remains manual in this release.
- `REPAIR` — admin records a repair outcome; repair logistics remain manual in this release.

Return cases default to `REFUND`. Warranty cases can use any of the three resolutions.

### 4. State machine

The allowed transitions are:

```text
REQUESTED -> APPROVED | REJECTED | CANCELED
APPROVED -> RECEIVED | CANCELED
RECEIVED -> INSPECTING
INSPECTING -> REFUND_PENDING | REPAIRING | REPLACEMENT_PENDING | REJECTED
REFUND_PENDING -> RESOLVED
REPAIRING -> RESOLVED
REPLACEMENT_PENDING -> RESOLVED
REJECTED, CANCELED, RESOLVED -> terminal
```

Only the customer can cancel a `REQUESTED` case. Admins can perform review, receipt, inspection, resolution, restock, and manual refund confirmation. A refund case cannot become `RESOLVED` until its refund record is `SUCCEEDED`.

Every transition is locked and idempotent. Repeating the same already-applied command returns the current case; a different invalid transition returns HTTP 409.

## Architecture

The after-sales module owns case validation, state transitions, item quantity rules, refund calculation, inventory return movement, and customer/admin response shaping. It calls the existing order repository and payment/refund boundary rather than writing provider code in a controller.

The payment provider boundary records a VND refund request but does not claim that PayOS or COD has returned money until an authorized admin confirms the external refund. This is necessary because the current PayOS integration supplies payment-link lookup/cancel and webhook contracts, not a verified automatic refund operation.

## Data model

### Create `after_sales_cases`

Columns:

- `id INT AUTO_INCREMENT PRIMARY KEY`.
- `order_id INT NOT NULL`.
- `user_id VARCHAR(255) NULL` for authenticated ownership; guest cases remain linked through the order’s guest identity.
- `case_type VARCHAR(16) NOT NULL` with `RETURN` and `WARRANTY`.
- `status VARCHAR(32) NOT NULL DEFAULT 'REQUESTED'`.
- `reason VARCHAR(64) NOT NULL`.
- `customer_note TEXT NOT NULL`.
- `resolution VARCHAR(24) NULL`.
- `admin_note TEXT NULL`.
- `refund_amount DECIMAL(14,0) NOT NULL DEFAULT 0`.
- `currency CHAR(3) NOT NULL DEFAULT 'VND'`.
- `requested_at DATETIME NOT NULL`.
- `approved_at DATETIME NULL`.
- `received_at DATETIME NULL`.
- `inspected_at DATETIME NULL`.
- `resolved_at DATETIME NULL`.
- `canceled_at DATETIME NULL`.
- `created_at DATETIME NOT NULL`.
- `updated_at DATETIME NOT NULL`.

Add indexes on `(order_id, status)`, `(user_id, created_at)`, and `(case_type, status, created_at)`. Add a foreign key to `orders` and a nullable foreign key to `users`.

### Create `after_sales_case_items`

Columns:

- `id INT AUTO_INCREMENT PRIMARY KEY`.
- `case_id INT NOT NULL`.
- `order_item_id INT NOT NULL`.
- `requested_quantity INT NOT NULL`.
- `approved_quantity INT NOT NULL DEFAULT 0`.
- `resolved_quantity INT NOT NULL DEFAULT 0`.
- `calculated_refund_amount DECIMAL(14,0) NOT NULL DEFAULT 0`.
- `item_reason VARCHAR(128) NULL`.
- `restocked_at DATETIME NULL`.
- `restocked_by VARCHAR(255) NULL`.
- `created_at DATETIME NOT NULL`.
- `updated_at DATETIME NOT NULL`.

Add a unique key on `(case_id, order_item_id)` and indexes on `order_item_id` and `(case_id, restocked_at)`. Foreign keys link the case and original order item.

### Create `after_sales_case_events`

Columns:

- `id INT AUTO_INCREMENT PRIMARY KEY`.
- `case_id INT NOT NULL`.
- `from_status VARCHAR(32) NULL`.
- `to_status VARCHAR(32) NOT NULL`.
- `action VARCHAR(48) NOT NULL`.
- `note TEXT NULL`.
- `actor_id VARCHAR(255) NULL`.
- `created_at DATETIME NOT NULL`.

Add an index on `(case_id, created_at, id)`. Events are append-only and are the source for the customer/admin case timeline.

### Create `payment_refunds`

Columns:

- `id INT AUTO_INCREMENT PRIMARY KEY`.
- `order_payment_id INT NOT NULL`.
- `after_sales_case_id INT NOT NULL`.
- `amount DECIMAL(14,0) NOT NULL`.
- `currency CHAR(3) NOT NULL DEFAULT 'VND'`.
- `status VARCHAR(24) NOT NULL` with `MANUAL_REQUIRED`, `PROCESSING`, `SUCCEEDED`, `FAILED`, and `CANCELED`.
- `provider_reference VARCHAR(255) NULL`.
- `idempotency_key VARCHAR(128) NOT NULL`.
- `reason VARCHAR(128) NOT NULL`.
- `failure_reason TEXT NULL`.
- `requested_by VARCHAR(255) NULL`.
- `confirmed_by VARCHAR(255) NULL`.
- `requested_at DATETIME NOT NULL`.
- `completed_at DATETIME NULL`.
- `created_at DATETIME NOT NULL`.
- `updated_at DATETIME NOT NULL`.

Add unique keys on `after_sales_case_id` and `idempotency_key`, plus indexes on `(order_payment_id, status)` and `(status, created_at)`. A case can have at most one refund record; retrying the same case reuses that record.

## Refund calculation

The customer never submits a refund amount. The service calculates it from immutable order-item snapshots:

1. `merchandiseGross` is the sum of the selected order-item snapshot totals.
2. `orderPayable` is `max(order.total_price - order.discount, 0)`.
3. The selected item’s proportional discount allocation is `roundVnd(order.discount * selectedGross / merchandiseGross)`.
4. `calculatedRefund` is `max(selectedGross - allocatedDiscount, 0)`.
5. `outstandingPaid` is the payment amount minus successful or processing refunds for the same payment.
6. The refund record amount is `min(calculatedRefund, outstandingPaid)`.

The implementation uses deterministic VND rounding and caps the final amount to the original payment amount. Shipping is not refunded separately because the current order contract does not store a distinct shipping fee. A future shipping-fee field can extend the formula without changing case ownership or refund idempotency.

For PayOS and COD, the approved refund enters `MANUAL_REQUIRED`. An admin confirms the external transfer/reference through a protected command. Only then does the refund become `SUCCEEDED`; the related payment becomes `partially_refunded` or `refunded` based on the aggregate successful refund amount.

## Inventory behavior

An item is restocked only after the case reaches `RECEIVED` or `INSPECTING` and an admin explicitly confirms that the item is accepted back into inventory. The service locks the case item and product row, writes one `restock_returned_item` inventory movement, and sets `restocked_at` in the same transaction. Repeated restock commands are idempotent.

Repair and replacement outcomes do not automatically create a shipment, replacement order, or stock movement in this release. Admin notes and case events record the manual operational result.

## API contract

### Authenticated customer

- `POST /api/orders/:oid/after-sales-cases` — create a return or warranty case.
- `GET /api/after-sales/cases` — list the customer’s cases.
- `GET /api/after-sales/cases/:id` — read an owned case and timeline.
- `POST /api/after-sales/cases/:id/cancel` — cancel a requested case.

Create body:

```json
{
  "type": "RETURN",
  "reason": "DAMAGED_ON_DELIVERY",
  "note": "The connector arrived damaged.",
  "items": [{ "orderItemId": 42, "quantity": 1, "reason": "DAMAGED" }]
}
```

### Guest customer

- `POST /api/orders/guest/after-sales-cases` — create a case with `orderId` and `guestOrderToken`.
- `POST /api/orders/guest/after-sales-cases/lookup` — list the guest order’s cases with `orderId` and `guestOrderToken`.
- `POST /api/orders/guest/after-sales-cases/:id` — read one guest case with the same token proof.

Guest responses use the existing guest-safe order contract and omit internal notes and actor identifiers.

### Admin

- `GET /api/admin/after-sales/cases` — paginated queue with type/status/priority filters.
- `GET /api/admin/after-sales/cases/:id` — full case, order snapshot, payment and event history.
- `PATCH /api/admin/after-sales/cases/:id` — perform a validated state transition, resolution, or admin note update.
- `POST /api/admin/after-sales/cases/:id/restock` — accept returned items into stock.
- `POST /api/admin/after-sales/cases/:id/refund` — create or resume the VND refund record.
- `POST /api/admin/after-sales/cases/:id/manual-refund-confirm` — record external refund reference and complete the refund.

All admin writes require `AuthGuard`, `RolesGuard`, CSRF protection, ownership of the target admin scope, request correlation, and route-local `{ msg, ...data }` responses.

## Client UI

Customer order detail adds a `Return or warranty` action only when the selected order/item is eligible. The form supports case type, item quantities, reason, and note. The customer sees case status, refund state, timeline, and next action without seeing provider secrets or internal notes.

Add a customer after-sales list/detail view and an admin after-sales queue/detail view. The admin detail includes item snapshots, eligibility result, calculated refund, payment status, state transition controls, restock controls, and manual refund confirmation.

No file upload, shipping-label generation, email provider, automatic replacement order, or carrier integration is included in this release.

## Security and error handling

- Prove authenticated ownership or guest token possession before revealing an order item or case.
- Never trust product price, warranty duration, delivered time, payment amount, or quantity from the client.
- Use transaction row locks for eligibility/quantity checks, state transitions, refund creation, payment aggregate updates, and restock.
- Return 400 for malformed payloads, 403 for ownership failure, 404 for hidden/nonexistent resources, 409 for invalid state or exhausted quantity, and 422 for an otherwise valid request outside the return/warranty policy.
- Do not log guest tokens, personal contact data, payment secrets, or external bank references beyond the operator-entered reference needed for audit.

## Verification and acceptance criteria

1. Authenticated and guest customers can create a return request within seven days of delivery.
2. A request after the inclusive seven-day boundary is rejected.
3. Warranty eligibility uses the order-item warranty snapshot and delivery timestamp.
4. A customer cannot request more quantity than the order contains or than remains after prior cases.
5. A guest cannot read another order’s case with a mismatched token.
6. Invalid state transitions return 409 and do not create duplicate events.
7. Refund calculation is deterministic, VND-only, discount-aware, and capped by the paid amount.
8. PayOS and COD refunds remain manual until an admin confirms an external refund reference.
9. Partial refunds update the payment aggregate correctly; full refunds become `refunded` only after the full amount succeeds.
10. Restock creates one inventory movement per accepted item and cannot be repeated.
11. Customer and admin UIs show the authoritative case/payment state after refresh.
12. Focused unit tests, MySQL integration tests, Playwright customer/admin journeys, typechecks, builds, lint, Prisma validation, and `git diff --check` pass.

## Non-goals

- Automatic PayOS refunds without a verified refund API contract.
- Stripe, card, or bank-transfer runtime support.
- New payment providers in this release.
- Carrier/shipping-label integration.
- Automatic replacement-order fulfillment.
- Destructive removal of historical order/payment columns or migrations.
