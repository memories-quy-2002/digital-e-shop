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
```

Customer write routes should validate ownership. Do not allow one customer to
read or mutate another customer's data.

## Admin APIs

Admin routes include product, order, account, dashboard, promotion,
notification, export, and inventory operations.

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

## Order APIs

Order operations should coordinate:

- Order status updates.
- Tracking timeline events.
- Inventory movement entries for stock deductions.
- Customer notifications when meaningful status changes occur.

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
