# API Guide

This guide summarizes the main API areas. Check `server/src/routes` for exact
route definitions before implementing changes.

## Conventions

- API routes are mounted under `/api`.
- Unsafe requests require the existing CSRF flow.
- Admin routes must enforce admin authorization.
- Backend responses should use clear status codes and actionable error messages.
- Query and schema handling should stay in model files.

## Public APIs

Typical public read paths:

```text
GET /api/health
GET /api/products
GET /api/products/:id
GET /api/reviews/product/:productId
```

These routes are suitable for read-only performance testing.

## Customer APIs

Customer routes include:

```text
GET    /api/users/:id/orders
GET    /api/users/:id/addresses
POST   /api/users/:id/addresses
PUT    /api/users/:id/addresses/:addressId
DELETE /api/users/:id/addresses/:addressId
GET    /api/users/:id/notifications
POST   /api/users/:id/notifications/read-all
POST   /api/orders/:oid/cancel
GET    /api/support/tickets
POST   /api/support/tickets
```

Customer write routes should validate ownership. Do not allow one customer to
read or mutate another customer's data.

## Admin APIs

Admin routes include product, order, account, dashboard, promotion,
notification, export, and inventory operations.

Operational endpoints also include:

```text
GET   /api/admin/alerts
GET   /api/support/tickets
PATCH /api/support/tickets/:id
```

Support ticket reads are scoped to the authenticated customer unless the
caller is an admin. Ticket updates are admin-only.

Important admin patterns:

- Keep list endpoints paginated.
- Apply filters against the full dataset, not only the current page.
- Return minimal row data for tables and detailed data through detail endpoints
  or modals.
- Use soft-delete behavior for products.
- Record inventory movement when stock changes.

## Promotion APIs

Promotion code data is stored in the `discounts` table. The promotion model is
schema-aware, so promotion code operations should use the promotion service and
model instead of writing direct SQL in controllers.

Reviews can only be created or updated by a customer who owns a product in an
order with status `Done` (`1`). Public review rows expose the verified-purchase
flag from the same rule.

## Order APIs

Order operations should coordinate:

- Order status updates.
- Tracking timeline events.
- Inventory movement entries for stock deductions.
- Customer notifications when meaningful status changes occur.
- Pending-only cancellation, one-time inventory restoration, and a Stripe
  refund attempt when the latest payment ledger entry is paid.
- USD as the canonical order currency. PayOS quotes are stored as integer VND
  settlement amounts using `PAYOS_USD_TO_VND_RATE`.

Payment providers are intentionally symbolic in the current local setup. Set
`PAYMENT_PROVIDER_MODE=mock` for deterministic provider references; live Stripe
checkout/refunds require the corresponding Stripe credentials, while the mock
Stripe card flow finalizes the reserved order locally and returns to the local
checkout-success page. PayOS live operations are fail-closed until its provider
credentials and webhook flow are implemented.

## Performance-Safe Routes

Read-only k6 tests should target `GET` endpoints only. Avoid these routes
against real data unless using a cloned test database:

```text
POST /api/orders/purchase/:uid
POST /api/reviews
POST /api/cart
POST /api/users/:id/addresses
POST /api/users/:id/notifications/read-all
PUT  /api/products/:id
DELETE /api/products
```
