# Order lifecycle and support

Back to [[index]]. Related: [[architecture]], [[0003-payment-ledger-and-usd-canonical-currency]].

## Order lifecycle

The numeric order status remains `0 Pending`, `1 Done`, and `2 Canceled`; a successful Done transition records `delivered_at` when it is first applied. Only Pending orders can move to Done or Canceled; Done and Canceled are terminal. Repeating the same terminal operation is idempotent.

Canceling a Pending order locks the order, restores its deducted inventory, records a cancellation movement, writes one timeline event, and emits one customer notification. `orders.inventory_restored_at` is the order-level concurrency/idempotency guard. PayOS and COD refunds are currently manual operator actions; the payment ledger and reconciliation attempt provide the audit record before cancellation is finalized.

## Reporting and retention

Canceled orders remain in the database for auditability, but status `2` is
excluded from revenue, discounts, order-item performance, payment mix,
customer spend, and period-order metrics. Average order value uses Done orders
only. There is currently no order soft-delete column or cleanup path; any
future archival feature must be separate from cancellation and every report
must continue to exclude archived rows explicitly.

## Review eligibility

A user can create or update a product review only when a Done order contains that product. Public verified-purchase badges use the same predicate; Pending and Canceled orders do not qualify.

## Support tickets

Customer support submissions are stored in `support_tickets`. Customers can create and view their own tickets; admins can view and update all tickets. The API keeps the existing auth, CSRF, rate-limit, ownership, and role boundaries.

The current routes are:

- `POST /api/support/tickets` and `GET /api/support/tickets` for customers
- `PATCH /api/support/tickets/:id` for admins

Ticket state belongs to the database record; a client-only success toast is not
the source of truth.

## After-sales workflow

Returns and warranty requests are persisted separately from support tickets in
`after_sales_requests`, `after_sales_items`, and `after_sales_events`. A
request is bound to a customer ID or to a hash of the guest order capability
token. The server rechecks that the order is Done, applies the inclusive
seven-day UTC return window or the item warranty snapshot, and locks the order
items before reserving the requested quantity for after-sales processing.

The supported state machine is:

`REQUESTED -> APPROVED|REJECTED -> RECEIVED -> REFUND_PENDING -> REFUNDED -> CLOSED`

Only the admin route can transition or confirm a refund. Refund value is
derived from order-item price snapshots, never from client input, and the
payment ledger is locked before a provider refund is attempted. Live provider
refunds fail closed until the provider adapter is configured. Guest lookup and
guest after-sales operations use POST bodies so the raw capability token does
not enter URLs, browser history, or referrer logs.

See [[after-sales-request]] and [[0006-after-sales-capability-and-refund-boundary]].

## Product comparison

Product comparison is now a public, guest-friendly catalog flow. The client
keeps only two to four positive product IDs in the versioned local selection
(`digital-e:comparison:v1`) and opens `/compare?ids=...`; no account or cart
record is created. `GET /api/products/compare` validates same-category IDs and
returns current VND prices, available stock, review summary, warranty, and
normalized attributes. The client maps `COMPARE_INVALID_IDS`,
`COMPARE_PRODUCTS_NOT_FOUND`, and `COMPARE_CATEGORY_MISMATCH` to readable
English/Vietnamese states, while checkout and cart remain authoritative for
the final price and stock decision.

See [[architecture]], [[api-response-contract]], and the maintained [API guide](../../docs/API.md).
