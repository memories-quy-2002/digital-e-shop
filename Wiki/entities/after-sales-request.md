# After-sales request

Back to [[index]]. Related: [[order]], [[payment]], [[support-ticket]], [[order-lifecycle-and-support]].

## Purpose

An `AfterSalesRequest` represents a return or warranty review for one delivered
order. It is deliberately separate from a free-form support ticket so
eligibility, quantity conflicts, operator decisions, and refunds remain
machine-auditable.

## Persistence

- `after_sales_requests`: owner, order, kind, current status, reason, admin note, and refund result.
- `after_sales_items`: selected `order_items` and requested quantities.
- `after_sales_events`: append-only status transitions and operator notes.
- `order_payments.refunded_amount`: cumulative ledger projection used to cap refunds.

Customer ownership uses `user_id`. Guest ownership uses
`guest_order_token_hash`; the raw token is never returned or stored. A unique
`request_idempotency_key` makes retries safe, and a different identity cannot
replay an existing key.

## Eligibility and quantity

The order must be Done (`status = 1`) and have `delivered_at`. Returns are
eligible through the inclusive UTC date seven calendar days after delivery.
Warranty requests use the immutable `warranty_months_snapshot` on each order
item. Active requests reserve quantities until they are rejected or closed;
overlapping requests receive a meaningful `QUANTITY_UNAVAILABLE` conflict.

## API boundary

Authenticated customer routes:

- `POST /api/after-sales/requests`
- `GET /api/after-sales/requests`
- `GET /api/after-sales/requests/:id`

Guest capability routes:

- `POST /api/orders/guest/after-sales/requests`
- `POST /api/orders/guest/after-sales/requests/lookup`
- `POST /api/orders/guest/after-sales/requests/:id/lookup`

The lookup routes intentionally use POST so capability tokens do not appear
in URL logs or referrers. Admin routes are under
`/api/admin/after-sales/requests`; only admins can transition states or confirm
refunds.

## Refund boundary

Refund amounts are computed from item price snapshots. The admin request cannot
choose an amount. The service locks the request and payment ledger, checks the
remaining balance and currency, calls `PaymentProviderService`, and only then
updates the after-sales event and payment projection. A live provider that has
no configured refund adapter returns a fail-closed error; it never marks the
request as refunded.

The first release does not automate replacement shipping, carrier pickup, or
external PayOS refunds.
