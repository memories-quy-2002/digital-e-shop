# Commerce Operations and Payments Design

**Date:** 2026-09-07
**Status:** Approved for implementation
**Scope:** Order lifecycle, payment abstraction, currency conversion, review eligibility, support tickets, Firebase account recovery, promotion analytics, and admin alerts.

## Goal

Make the customer and admin operations real enough to be safely used in local and staging environments while preserving the current MySQL-first architecture and existing route payloads.

Product comparison is intentionally deferred to a later phase.

## Decisions

### 1. Order status and cancellation

The existing numeric status contract remains stable:

- `0` — Pending
- `1` — Done
- `2` — Canceled

Only these transitions are valid:

- `Pending -> Done`
- `Pending -> Canceled`

`Done` and `Canceled` are terminal. Repeating an already-applied transition is idempotent; attempting a different transition returns a conflict.

Cancellation is available to the order owner and an admin while the order is Pending. The service locks the order row, restores inventory inside the same transaction, writes one cancellation timeline event, and emits one customer notification. A nullable order-level restoration timestamp is the idempotency guard, so concurrent/repeated cancellation cannot add stock twice.

If the order has a paid Stripe payment, cancellation first goes through the payment provider refund operation. The provider call is outside the database transaction; the order is finalized as Canceled only after the provider returns a successful or already-refunded result. A failed refund leaves the order Pending and returns a retryable error.

### 2. Payment providers and currency

`orders.payment_method` remains for backward compatibility. A new `order_payments` ledger records provider-specific attempts and settlement state:

- `cash`, `bank_transfer`, `stripe`, and `payos` providers
- `pending`, `paid`, `failed`, `refund_pending`, `refunded` statuses
- provider reference/payment ID, idempotency key, base amount, payment amount, currency, FX rate, and refund reference

USD is the canonical order currency. New orders store `currency = USD` and `base_amount` in USD. A provider may use a different settlement currency:

- Stripe defaults to USD.
- PayOS uses VND and receives an integer amount in VND because PayOS payment-link amounts are integer currency units.

The conversion is explicit and reproducible: `payment_amount = round(base_amount * usdToVndRate)`, with the rate stored on the payment row. `PAYOS_USD_TO_VND_RATE` is required when PayOS is selected. The app never silently invents an exchange rate in production.

Provider adapters expose `createPayment` and `refundPayment`. `PAYMENT_PROVIDER_MODE=mock` is the safe local default for symbolic Stripe/PayOS flows and never calls an external provider. Production/staging can use the Stripe adapter only when its secret and webhook secret are configured; PayOS remains a signed integration boundary but is not enabled by this task. No payment credentials are committed.

### 3. Review eligibility

Creating or updating a review requires the authenticated user to have at least one order containing the product with `orders.status = 1` (`Done`). Pending and canceled orders do not qualify. Public review badges use the same Done-only predicate.

### 4. Support tickets

Contact/support submissions create a persisted ticket instead of only showing a toast. Customers can create tickets and list their own tickets. Admins can list all tickets and update status/priority/admin notes. Ticket writes validate the payload, enforce ownership, and use the existing auth, CSRF, rate-limit, and role guards.

Ticket statuses are `OPEN`, `IN_PROGRESS`, `WAITING_FOR_CUSTOMER`, `RESOLVED`, and `CLOSED`. The API preserves route-local `{ msg, ...data }` response conventions.

### 5. Firebase password recovery and email verification

The client exposes Firebase `sendPasswordResetEmail` and `sendEmailVerification` helpers. Signup sends a verification email after account creation, and the account surface can resend it. A dedicated forgot-password route sends the Firebase reset email and uses a neutral success message to avoid revealing whether an email exists. This phase does not block existing users from login solely because their email is unverified.

### 6. Real analytics and admin alerts

Promotion analytics are computed from `discount_redemptions` and completed/non-canceled orders rather than configured-promotion placeholders. The existing response keys remain available, with actual redemption counts and discount totals.

Admin alerts are served by an admin-only backend endpoint that derives current alerts from orders, payment status, support tickets, products/stock, and users. The client consumes that endpoint rather than downloading broad datasets and rebuilding alerts in the browser. Alerts are resolved by the underlying state (for example, an order is no longer Pending), so no fake client-only dismissal is used.

## API contract

### Orders

- `POST /api/orders/:oid/cancel` — authenticated owner or admin; optional `{ reason?: string }`; returns the current order and refund state.
- `POST /api/orders/status/:oid` — existing admin route; now uses the same transition policy and side effects.
- `GET /api/orders/:oid` — keeps existing order payload and adds `currency`, `payment`, and `timeline` fields where available.

### Support

- `POST /api/support/tickets` — customer; body `{ subject, message, category?, orderId? }`.
- `GET /api/support/tickets` — customer gets own tickets; admin gets all tickets with optional `status`.
- `PATCH /api/support/tickets/:id` — admin; body `{ status?, priority?, adminNote? }`.

### Admin alerts

- `GET /api/admin/alerts` — admin; returns `{ alerts, unread, msg }`.

## Database changes

Additive Prisma/MySQL migration only:

- `orders.currency` default `USD`
- `orders.inventory_restored_at` nullable
- `orders.cancellation_reason` nullable
- `order_payments` payment ledger with unique idempotency key
- `support_tickets`

Existing tables, raw SQL repositories, Prisma schema, and generated client stay aligned. No destructive migration or production reset is part of this task.

## Non-goals

- Product comparison UI/API; phase later.
- Live PayOS payment-link creation or production PayOS webhook activation.
- Automatic FX-rate fetching; the configured rate is explicit and snapshotted.
- Blocking login for unverified Firebase accounts.
- Rewriting all route response shapes or replacing the MySQL repositories with Prisma.

## Acceptance criteria

1. A Pending cash/bank order can be canceled by its owner or admin; stock is restored once, timeline and notification are written once, and repeated cancellation is idempotent.
2. A paid Stripe order invokes the refund adapter before cancellation; mock mode is deterministic and production mode never pretends a missing provider credential succeeded.
3. Cash, bank transfer, Stripe, and symbolic PayOS orders have a payment ledger entry. PayOS amount is an integer VND quote derived from the stored USD amount and configured FX rate.
4. Review create/update is rejected unless a Done order contains the product; public verification badges use the same rule.
5. Contact/support form creates a ticket visible to its owner and admins, and admins can update it.
6. Signup can resend Firebase verification email; forgot-password sends a reset email with a neutral confirmation state.
7. Promotion metrics and admin alerts are backed by database queries and the admin client consumes the server endpoint.
8. Product comparison has no implementation changes and is explicitly recorded as deferred.
9. Relevant focused tests, typechecks, builds, lint, and `git diff --check` pass; any environment-blocked command is reported exactly.
