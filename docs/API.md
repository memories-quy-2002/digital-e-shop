# API guide

The Digital-E API is a NestJS application on the Express adapter. It sets the global `/api` prefix, uses cookie credentials, and preserves route-specific response keys for compatibility with the client.

## Discover the API

Run the server locally, then open these endpoints:

```text
GET /api/health
GET /api/openapi.json
GET /docs
```

`/docs` serves the Scalar API reference. The generated OpenAPI document covers the stable API surface, while the source controllers remain the authority for newly added routes and compatibility aliases.

## Request conventions

- Send JSON with `Content-Type: application/json` unless the endpoint accepts multipart form data
- Include cookies for authenticated requests; the client HTTP layer sets credentials automatically
- Fetch a CSRF token from `GET /api/users/csrf` before unsafe requests and send it as `X-CSRF-Token`
- Preserve route-local response keys such as `msg`, `error`, `product`, `products`, `order`, `orders`, `pagination`, `userData`, and `notifications`
- Use the `X-Request-Id` response header to correlate a request with server logs
- Expect validation and domain failures to use the established `{ msg }` or `{ error }` shape rather than a new global contract

The CSRF middleware ignores `GET`, `HEAD`, and `OPTIONS`. Login, registration, and refresh retain their explicit authentication-flow exclusions. Do not broaden either exclusion set.

## Public and catalog routes

The public catalog surface includes:

```text
GET  /api/health
GET  /api/products
GET  /api/products/:id
GET  /api/products/search
GET  /api/products/facets
GET  /api/products/relevant/:pid
GET  /api/products/recommendations/:uid
GET  /api/products/images/:filename
GET  /api/reviews/:pid
POST /api/cart/guest/preview
```

`GET /api/products` accepts pagination, term, category, brand, price, sort, and JSON-encoded typed attribute filters. The server bounds pagination and recalculates the catalog query from the request. Product image names are constrained before a file is read.

Guest cart preview accepts product IDs, quantities, and an optional discount code. It returns authoritative product, price, stock, discount, and total information. The client must not treat local cart values as authoritative.

## Authentication routes

Authentication is exposed under `/api/users`:

```text
GET  /api/users/csrf
POST /api/users/register
POST /api/users/login
POST /api/users/refresh
POST /api/users/logout
GET  /api/users/session/check
GET  /api/users/me
```

Production authentication verifies Firebase identity on the server. Development can use the configured local provider. Successful authentication issues the server's cookie-backed access and refresh session. Refresh reloads the current user and active session before issuing a new access token.

## Customer routes

Customer routes require authentication and enforce resource ownership where the URL or body contains a user identifier:

```text
GET    /api/cart/:uid
GET    /api/cart/:uid/validation
POST   /api/cart
PUT    /api/cart
DELETE /api/cart

GET    /api/orders/user/:uid
GET    /api/orders/:oid
POST   /api/orders/purchase/:uid
POST   /api/orders/checkout-session/:uid
POST   /api/orders/:oid/cancel

GET    /api/users/:id/addresses
POST   /api/users/:id/addresses
PUT    /api/users/:id/addresses/:addressId
DELETE /api/users/:id/addresses/:addressId

GET    /api/users/:id/notifications
POST   /api/users/:id/notifications/read-all
POST   /api/users/:id/notifications/:notificationId/read

GET    /api/wishlist/:uid
POST   /api/wishlist
DELETE /api/wishlist
DELETE /api/wishlist/:pid

GET    /api/support/tickets
POST   /api/support/tickets
POST   /api/reviews
```

The address and notification controllers also preserve the singular `/api/user`
alias for clients that still use it. User profile routes expose both
`/api/users` and `/api/user` aliases.

Reviews use the completed-order predicate, `orders.status = 1`, for write eligibility and verified-purchase display. Support-ticket reads are scoped to the authenticated customer; admin callers can read the operational queue.

## Guest checkout routes

Guest checkout does not accept a user ID and never trusts client prices or totals:

```text
POST /api/orders/guest/purchase
POST /api/orders/guest/checkout-session
POST /api/orders/guest/by-session
POST /api/orders/guest/lookup
```

The server validates contact and shipping fields, rechecks stock and promotions, and uses the same inventory and payment boundaries as authenticated checkout. A successful guest order returns a raw access token once. The client stores it only for the active success and lookup flow. The database stores only its SHA-256 hash, and public lookup requires both an order or session identifier and the token.

## Admin routes

Admin routes use `AuthGuard` and `RolesGuard` with the `admin` role:

```text
GET    /api/analytics/summary?range=7d|30d|90d
GET    /api/admin/alerts

GET    /api/users
GET    /api/users/:id
GET    /api/users/:id/profile
PUT    /api/users/:id

POST   /api/products/add
PUT    /api/products/:id
PUT    /api/products/:id/inventory
DELETE /api/products
GET    /api/products/admin/inventory-movements

GET    /api/promotions
POST   /api/promotions
PUT    /api/promotions/:id
DELETE /api/promotions/:id

GET    /api/orders
GET    /api/orders/item
POST   /api/orders/status/:oid
GET    /api/support/tickets
PATCH  /api/support/tickets/:id
```

Admin order queries use left joins so guest orders can display their contact snapshot without exposing token hashes. Admin list endpoints should remain paginated and apply filters against the full dataset. Product deletion keeps the existing soft-delete behavior, and stock changes record inventory movements.

## Payments and order state

Checkout reserves inventory before payment completion. Stripe Checkout uses the Checkout Session identifier as an idempotency boundary, and webhook finalization consumes a reservation once. Pending cancellation can restore inventory once and request a Stripe refund through the provider boundary.

Orders keep USD as the canonical amount. The payment ledger stores provider currency, settlement amount, exchange-rate snapshot, idempotency key, and refund state. PayOS values are integer VND quotes derived from `PAYOS_USD_TO_VND_RATE`. Local mock mode does not call external payment APIs.

The Stripe webhook endpoint is:

```text
POST /api/orders/webhooks/stripe
```

Keep raw request-body handling and webhook signature verification intact when changing this route.

## Performance-safe routes

The k6 scripts in `server/test/` send read-only requests. Use `pnpm --dir server perf:readonly`, `perf:catalog`, `perf:admin-readonly`, `perf:customer-readonly`, or `perf:auth-readonly` as appropriate. Never run write-heavy checkout, cart, review, address, notification, promotion, product, or admin scenarios against production or shared data.
