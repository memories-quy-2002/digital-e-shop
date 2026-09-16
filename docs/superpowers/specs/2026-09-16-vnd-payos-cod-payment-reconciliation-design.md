# VND PayOS and COD Payment Reconciliation Design

**Date:** 2026-09-16
**Status:** Approved for implementation
**Scope:** Remove Stripe and bank transfer from the new runtime payment surface; keep PayOS and COD as the only checkout methods; add durable PayOS webhook processing and payment reconciliation.

## Goal

Make Digital-E a VND-only checkout system with PayOS as the online payment provider and COD as the manual payment provider. The system must be able to recover from missed or duplicated PayOS webhooks, identify local/provider mismatches, and keep historical Stripe and bank-transfer data readable without allowing new orders to use those methods.

## Decisions

### 1. Supported payment methods

New checkout requests accept exactly:

- `payos` — online PayOS payment link in VND.
- `cash` — customer-facing label `Cash on delivery (COD)`.

The runtime rejects `stripe`, `card`, and `bank_transfer` for new orders. Existing historical orders and payment rows remain readable through compatibility fields and are never rewritten by this feature.

No additional provider is included in this implementation. MoMo, VNPay, ZaloPay, and other VND-native providers can be added later behind the same provider boundary after their merchant contracts, credentials, webhook contracts, and refund capabilities are verified.

### 2. VND-only money model

VND is the store, order, and provider currency for all new records. New PayOS amounts are whole-number VND values and are sent to PayOS unchanged. New COD ledger rows use VND with an effective FX rate of `1` for compatibility with the existing ledger shape; no conversion is performed.

`PAYOS_USD_TO_VND_RATE` is removed from new runtime configuration and documentation. The existing FX columns remain available for historical records and are not used to calculate new VND prices.

All amounts are recomputed from server-authoritative order and order-item snapshots. A client cannot choose the payment amount, currency, provider reference, or refund amount.

### 3. Stripe and bank-transfer removal boundary

Remove Stripe and bank transfer from the runtime source, client checkout, dependencies, environment templates, API validators, route wiring, tests, and maintained documentation. This includes the Stripe checkout service, Stripe webhook controller/module, Stripe SDK adapter, Stripe-specific client methods, and card checkout UI.

Keep the following for migration and historical compatibility:

- `orders.stripe_checkout_session_id` and `orders.stripe_payment_intent_id` columns.
- Historical Stripe SQL and Prisma migration files.
- Historical payment rows and old `orders.payment_method` values.
- Read-only formatting for legacy order records when an old Stripe or bank-transfer order is inspected.

No new code writes Stripe identifiers or creates a bank-transfer payment row.

### 4. Order delivery and COD confirmation

The numeric order status remains `0 = Pending`, `1 = Done`, and `2 = Canceled`. A new nullable `orders.delivered_at` timestamp is the source of truth for the return window.

The existing admin Pending-to-Done transition remains compatible and records `delivered_at` when it is first applied. For a COD order, the same completed-delivery operation confirms the COD payment in the same transaction because the first release treats successful COD delivery as collection. A future fulfillment model can separate delivery and collection without changing the after-sales contract.

Existing Done rows receive a deterministic `delivered_at` backfill from `date_added` during the additive migration. This only preserves historical behavior; all newly completed orders receive the actual transition timestamp.

### 5. PayOS webhook authority

The PayOS webhook remains at `POST /api/orders/webhooks/payos`. It verifies the provider signature before any business mutation. A valid event is acknowledged only after it has been durably recorded; a transient processing failure remains retryable.

The browser return URL only resumes status polling. It never marks a payment as paid, consumes a reservation, deducts stock, or creates an order.

## Architecture

The existing MySQL-first repositories remain the operational source of truth. Prisma receives an additive schema update and generated client alignment, but the feature logic stays in the existing NestJS payment, order, inventory, and admin boundaries.

The payment flow has three durable layers:

1. `pending_checkouts` holds the server-authoritative PayOS reservation before payment.
2. `order_payments` holds the current payment ledger state for a created order.
3. `payment_webhook_events` and `payment_reconciliation_attempts` hold provider event and operator audit history.

Webhook processing is synchronous and transaction-bounded in the first release. It does not introduce Redis, a queue, or a new worker process. Failed events can be retried by PayOS and by an admin reconciliation action.

## Data model

### Modify `orders`

Add:

- `delivered_at DATETIME NULL` with an index for after-sales eligibility queries.

Do not change the existing numeric status values or remove the legacy Stripe columns.

### Modify `order_payments`

Keep existing provider amount, currency, idempotency, paid, and refund fields. Add:

- `reconciliation_status VARCHAR(24) NOT NULL DEFAULT 'PENDING'` with values `PENDING`, `MATCHED`, `MISMATCH`, `UNAVAILABLE`, and `MANUAL_CONFIRMED`.
- `provider_status VARCHAR(32) NULL` for the last provider-reported status.
- `last_reconciled_at DATETIME NULL`.
- `last_reconciliation_error TEXT NULL`.

Add an index over `(reconciliation_status, last_reconciled_at)`.

New payment status behavior is:

- PayOS: `pending -> paid` after verified exact-match webhook or exact-match reconciliation.
- COD: `pending -> paid` when the order is completed/delivered.
- A partial refund may later use `partially_refunded`; a full refund uses `refunded`. Refund state is primarily recorded in the after-sales refund table.

### Create `payment_webhook_events`

Columns:

- `id INT AUTO_INCREMENT PRIMARY KEY`.
- `provider VARCHAR(32) NOT NULL`.
- `event_key VARCHAR(255) NOT NULL`.
- `event_type VARCHAR(64) NOT NULL`.
- `payload_hash CHAR(64) NOT NULL`.
- `normalized_payload JSON NOT NULL` containing only non-secret normalized provider fields.
- `order_code BIGINT NULL`.
- `payment_link_id VARCHAR(255) NULL`.
- `amount DECIMAL(14,0) NULL`.
- `currency CHAR(3) NULL`.
- `status VARCHAR(24) NOT NULL DEFAULT 'RECEIVED'` with values `RECEIVED`, `PROCESSING`, `PROCESSED`, `MISMATCH`, `IGNORED`, and `FAILED`.
- `attempt_count INT NOT NULL DEFAULT 0`.
- `last_error TEXT NULL`.
- `received_at DATETIME NOT NULL`.
- `processed_at DATETIME NULL`.
- `created_at DATETIME NOT NULL`.
- `updated_at DATETIME NOT NULL`.

Add a unique key on `(provider, event_key)` and indexes on `(status, received_at)` and `(provider, order_code)`.

PayOS does not expose a Stripe-style event ID in the current integration contract. The event key uses the provider transaction `reference` when available. If it is absent, the service hashes a canonical representation of `orderCode`, `paymentLinkId`, `amount`, `currency`, `code`, `status`, and `transactionDateTime`.

### Create `payment_reconciliation_attempts`

Columns:

- `id INT AUTO_INCREMENT PRIMARY KEY`.
- `provider VARCHAR(32) NOT NULL`.
- `pending_checkout_id INT NULL`.
- `order_payment_id INT NULL`.
- `requested_by VARCHAR(255) NULL`.
- `outcome VARCHAR(24) NOT NULL` with values `MATCHED`, `MISMATCH`, `UNAVAILABLE`, `FAILED`, and `MANUAL_CONFIRMED`.
- `local_status VARCHAR(24) NULL`.
- `provider_status VARCHAR(32) NULL`.
- `expected_amount DECIMAL(14,0) NULL`.
- `provider_amount DECIMAL(14,0) NULL`.
- `expected_currency CHAR(3) NULL`.
- `provider_currency CHAR(3) NULL`.
- `provider_reference VARCHAR(255) NULL`.
- `mismatch_reason TEXT NULL`.
- `created_at DATETIME NOT NULL`.

The service requires exactly one of `pending_checkout_id` or `order_payment_id` for each row. Foreign keys and indexes support both targets. Attempts are append-only; the latest result is projected onto `order_payments.reconciliation_status`.

## Payment flows

### PayOS checkout

1. The server validates the cart, promotion, stock, and total.
2. The server creates a pending checkout and inventory reservation using VND values.
3. The server creates a PayOS payment link with the exact integer VND amount.
4. The server attaches `payment_provider = payos`, provider order code, payment link ID, amount, currency `VND`, and FX rate `1` to the reservation.
5. The customer pays on PayOS.
6. PayOS sends the signed webhook.
7. The webhook event is inserted idempotently, then the existing finalization transaction locks the pending checkout, verifies provider identity and exact amount, creates the order/payment ledger, deducts stock, consumes the reservation, and writes one timeline event.
8. The event is marked `PROCESSED` only after the transaction commits.

### PayOS duplicate or malformed webhook

- A processed or ignored duplicate returns HTTP 200 without creating another order, stock movement, notification, or timeline event.
- A valid but mismatched amount, currency, order code, or payment link is recorded as `MISMATCH`, raises an admin alert, and returns a durable acknowledgement without finalizing the order.
- A database or transient service failure records `FAILED` where possible and returns HTTP 500 so the provider can retry.
- A failed event can be replayed through the admin reconciliation action after the underlying issue is fixed.

### COD

1. The server creates the order and a VND `cash` payment ledger row with status `pending`.
2. The admin marks the order Done after successful delivery/collection.
3. The transaction sets `delivered_at`, marks the COD payment `paid`, records `MANUAL_CONFIRMED`, and writes the order timeline event once.
4. Repeating the command is idempotent.

## Reconciliation

Admin-only endpoints expose the following operations:

- `GET /api/admin/payments/reconciliation` — paginated candidates and previous outcomes.
- `POST /api/admin/payments/reconciliation/run` — bounded PayOS reconciliation run with a maximum of 100 candidates per request.
- `POST /api/admin/payments/:paymentId/reconcile` — reconcile one created-order payment.
- `POST /api/admin/payments/:paymentId/confirm-cod` — confirm a COD payment with an audit note.
- `GET /api/admin/payments/:paymentId/webhook-events` — inspect normalized event history.

PayOS reconciliation calls the provider payment-request lookup using the order code or payment link ID. It compares provider status, payment link ID, order code, currency, and amount. A matching `PAID` result invokes the same idempotent finalization service used by the webhook, which recovers orders whose webhook was missed. Pending, canceled, expired, unavailable, and mismatched results are recorded without falsely marking an order paid.

COD has no external provider query. Its reconciliation record is created by the admin confirmation command and cannot be auto-confirmed from client input.

The first release uses explicit admin/bounded runs rather than a cron job. This keeps provider calls observable and avoids adding a worker dependency before production payment volume requires one.

## API and UI changes

### Client payment surface

- Checkout payment choices render PayOS and COD only.
- PayOS displays VND directly and keeps the existing local mock simulator for development/test mode.
- The mock confirmation endpoint remains unreachable outside mock mode.
- Legacy Stripe/card order data can be rendered as a read-only historical label, but no new checkout path or client API method exists for it.

### Admin payment surface

Add an admin reconciliation page with:

- Provider and status filters.
- Expected/local amount versus provider amount.
- Order code/payment link ID.
- Last webhook state and last reconciliation outcome.
- Mismatch reason and retry action.
- COD confirmation action.

All admin write actions use the existing authentication, role, CSRF, request-correlation, and route-local response conventions.

## Security and error handling

- Verify the PayOS signature before event persistence or business mutation.
- Keep webhook routes outside normal CSRF validation only because they are authenticated by provider signature.
- Do not log API keys, checksum keys, raw webhook payloads, guest tokens, or bank/account secrets.
- Normalize and redact provider payload fields before storing them.
- Enforce exact integer VND amount and currency comparisons.
- Lock pending checkout/payment rows during finalization and reconciliation.
- Use unique event keys and payment idempotency keys to prevent duplicate side effects.
- Return 400 for missing/invalid signatures, 200 for durably acknowledged business mismatches, 500 for retryable processing failures, and 409 for local state conflicts.

## Verification and acceptance criteria

1. New authenticated and guest checkout accepts only PayOS or COD.
2. `stripe`, `card`, and `bank_transfer` payloads are rejected before persistence.
3. New PayOS and COD ledger rows use VND and never call an FX conversion.
4. A duplicate PayOS webhook produces one order, one stock deduction, one notification, and one timeline event.
5. A mismatched PayOS amount/reference/currency never creates or finalizes an order.
6. A missed but provider-confirmed PayOS payment can be recovered by reconciliation.
7. A failed webhook can be safely retried without duplicate effects.
8. COD completion confirms payment and `delivered_at` exactly once.
9. Existing historical Stripe/bank-transfer rows remain readable and migration history remains deployable.
10. Focused unit tests, MySQL integration tests, client tests, Playwright payment journeys, typechecks, builds, lint, Prisma validation, and `git diff --check` pass.

## Non-goals

- Adding MoMo, VNPay, ZaloPay, or another provider.
- Automatic PayOS refund API calls without a verified provider contract.
- Removing historical database columns or migration files.
- Replacing MySQL repositories with a full Prisma rewrite.
- Adding a queue, cron worker, shipping carrier integration, or email provider.
