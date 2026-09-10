# Order lifecycle and support

Back to [[index]]. Related: [[architecture]], [[0003-payment-ledger-and-usd-canonical-currency]].

## Order lifecycle

The numeric order status remains `0 Pending`, `1 Done`, and `2 Canceled`. Only Pending orders can move to Done or Canceled; Done and Canceled are terminal. Repeating the same terminal operation is idempotent.

Canceling a Pending order locks the order, restores its deducted inventory, records a cancellation movement, writes one timeline event, and emits one customer notification. `orders.inventory_restored_at` is the order-level concurrency/idempotency guard. A paid Stripe order must pass through the provider refund boundary before the database finalizes cancellation.

## Review eligibility

A user can create or update a product review only when a Done order contains that product. Public verified-purchase badges use the same predicate; Pending and Canceled orders do not qualify.

## Support tickets

Customer support submissions are stored in `support_tickets`. Customers can create and view their own tickets; admins can view and update all tickets. The API keeps the existing auth, CSRF, rate-limit, ownership, and role boundaries.

The current routes are:

- `POST /api/support/tickets` and `GET /api/support/tickets` for customers
- `PATCH /api/support/tickets/:id` for admins

Ticket state belongs to the database record; a client-only success toast is not
the source of truth.

## Deferred work

Product comparison is deliberately deferred to a later phase so the order/payment and customer-support flows can stabilize first.
