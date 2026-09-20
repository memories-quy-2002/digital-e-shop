# Digital-E API reference

## TL;DR

The Digital-E API is a NestJS service with a global /api prefix. Run the
server locally and open /docs for the Scalar reference or /api/openapi.json
for the checked-in OpenAPI document. The source controllers remain the
authority when a compatibility alias or a newly added route is not yet
represented in the document.

## Start the reference

From the repository root, start the server package:

~~~powershell
pnpm --dir server dev
~~~

Then open:

~~~text
http://localhost:4000/docs
http://localhost:4000/api/openapi.json
http://localhost:4000/api/health
~~~

The production API reference uses the same routes under the deployed server
origin.

## Request conventions

Send JSON with Content-Type: application/json unless the endpoint accepts
multipart form data. Include cookies on authenticated requests. The client HTTP
layer already sends credentials automatically.

For unsafe requests protected by CSRF, first call GET /api/users/csrf and send
the returned token in X-CSRF-Token. The middleware ignores GET, HEAD, and
OPTIONS. Login, registration, and refresh retain their explicit
authentication-flow exclusions.

### Response contract

Every JSON object returned by a normal API route receives shared success
metadata without moving the route-specific fields:

```json
{
  "success": true,
  "requestId": "request-correlation-id",
  "message": "Canonical success message when the route provides one",
  "products": []
}
```

The domain key remains route-specific (`product`, `products`, `order`,
`orders`, `pagination`, `userData`, `notifications`, and so on). A route that
does not provide a message does not invent one. The older `msg` success field
is retained as a compatibility alias.

Expected errors use one shared envelope:

```json
{
  "success": false,
  "message": "Stock changed",
  "code": "CHECKOUT_CONFLICT",
  "requestId": "request-correlation-id",
  "details": { "issues": [] },
  "msg": "Stock changed",
  "error": "Stock changed"
}
```

Use `message` for display and `code` for machine decisions. `msg` and
`error` are deprecated compatibility aliases and remain temporarily so older
clients continue to work. Structured details may also be exposed at the top
level for legacy consumers. The `X-Request-Id` response header always carries
the same correlation ID used in the envelope and server logs. The OpenAPI
document at `/api/openapi.json` defines this shared error schema.

## Route inventory

### Public and catalog

| Method | Path | Purpose |
| --- | --- | --- |
| GET | / | Root service status |
| GET | /api/health | API health check |
| GET | /api/blob/health | Blob storage health check |
| GET | /api/products | Browse the catalog |
| GET | /api/products/:id | Read one product |
| GET | /api/products/search | Search products |
| GET | /api/products/facets | Read catalog facets |
| GET | /api/products/relevant/:pid | Read related products |
| GET | /api/products/recommendations/:uid | Read recommendations |
| GET | /api/products/images/:filename | Read a product image |
| GET | /api/reviews/:pid | Read product reviews |
| GET | /api/cart/guest | Read the anonymous cart |
| POST | /api/cart/guest/preview | Preview authoritative prices and stock |
| POST | /api/cart/guest/sync | Synchronize the anonymous cart |
| POST | /api/cart/guest/clear | Clear the anonymous cart |

GET /api/products accepts pagination, term, category, brand, price, sort, and
JSON-encoded typed attribute filters. The server bounds pagination and
recalculates the catalog query from the request.

Guest cart synchronization accepts
{ "items": [{ "productId": 10, "quantity": 2 }] }. The server assigns an
HttpOnly digitalEGuestCartId cookie and stores only product IDs and quantities.
The cookie expires after 30 days. Sending { "converted": true } to the clear
route also records the cart as converted for aggregate admin analytics.

### Authentication

| Method | Path | Access |
| --- | --- | --- |
| GET | /api/users/csrf | Public |
| POST | /api/users/register | Public |
| POST | /api/users/login | Public |
| POST | /api/users/refresh | Refresh session |
| POST | /api/users/logout | Authenticated |
| GET | /api/users/session/check | Authenticated |
| GET | /api/users/me | Authenticated |

Authentication verifies Firebase identity on the server. Successful
authentication issues the server cookie-backed access and refresh session. The
server does not accept email/password credentials and does not expose
password-reset or email-verification token routes.

Registration accepts an ID token and optional profile input:

~~~json
{
  "idToken": "your_firebase_id_token",
  "user": {
    "username": "customer"
  }
}
~~~

Firebase owns verification, password reset, and email-change action links.
After a verified sign-in, the server synchronizes the Firebase claim to the
user record.

### Authenticated customer

| Method | Path | Access |
| --- | --- | --- |
| GET | /api/cart/:uid | Owner or admin |
| GET | /api/cart/:uid/validation | Owner or admin |
| POST | /api/cart | Owner or admin |
| PUT | /api/cart | Owner or admin |
| DELETE | /api/cart | Owner or admin |
| GET | /api/orders/user/:uid | Owner or admin |
| GET | /api/orders/:oid | Order owner or admin |
| POST | /api/orders/purchase/:uid | Verified owner or admin |
| POST | /api/orders/payos-checkout-session/:uid | Verified owner or admin |
| GET | /api/orders/by-payos-order-code/:orderCode | Order owner or admin |
| POST | /api/orders/:oid/cancel | Order owner or admin |
| POST | /api/orders/discount | Customer or admin |
| GET | /api/users/:id/addresses | Owner or admin |
| POST | /api/users/:id/addresses | Owner or admin |
| PUT | /api/users/:id/addresses/:addressId | Owner or admin |
| DELETE | /api/users/:id/addresses/:addressId | Owner or admin |
| GET | /api/users/:id/notifications | Owner or admin |
| POST | /api/users/:id/notifications/read-all | Owner or admin |
| POST | /api/users/:id/notifications/:notificationId/read | Owner or admin |
| GET | /api/wishlist/:uid | Owner or admin |
| POST | /api/wishlist | Authenticated |
| DELETE | /api/wishlist | Authenticated |
| DELETE | /api/wishlist/:pid | Authenticated |
| POST | /api/reviews | Verified customer |
| GET | /api/support/tickets | Customer or admin |
| POST | /api/support/tickets | Customer or admin |
| POST | /api/after-sales/requests | Customer or admin |
| GET | /api/after-sales/requests | Customer or admin |
| GET | /api/after-sales/requests/:id | Customer or admin |

Authenticated checkout and review creation require a verified Firebase email.
Customers can still browse, maintain a cart, view order history, and use
support while unverified.

### Guest checkout

Guest checkout does not accept a user ID and never trusts client prices or
totals:

| Method | Path | Purpose |
| --- | --- | --- |
| POST | /api/orders/guest/purchase | Create a COD or PayOS guest order |
| POST | /api/orders/guest/payos-checkout-session | Create a guest PayOS payment link |
| POST | /api/orders/guest/lookup | Read a guest order with its token |
| POST | /api/orders/guest/by-payos-order-code | Read a guest PayOS order with its token |
| POST | /api/orders/mock-payos/confirm | Confirm a local mock PayOS payment |

The guest purchase shape is:

~~~json
{
  "cart": [
    {
      "productId": 10,
      "quantity": 2
    }
  ],
  "contact": {
    "email": "customer@example.com",
    "name": "Demo Customer",
    "phone": "0900000000"
  },
  "shipping": {
    "address": "123 Demo Street",
    "city": "Ho Chi Minh City",
    "country": "Vietnam"
  },
  "paymentMethod": "cash"
}
~~~

The server validates contact and shipping fields, rechecks stock and
promotions, and creates a one-time guest order token. The database stores only
the token hash. Public lookup requires the order ID or PayOS order code
together with that token.

Guest after-sales uses the same capability token but keeps it in POST bodies:

| Method | Path | Purpose |
| --- | --- | --- |
| POST | /api/orders/guest/after-sales/requests | Create a guest return/warranty request |
| POST | /api/orders/guest/after-sales/requests/lookup | List guest requests |
| POST | /api/orders/guest/after-sales/requests/:id/lookup | Read one guest request |

The admin after-sales queue is available at
`/api/admin/after-sales/requests`. Admin status transitions use
`PATCH /:id/status`; refund confirmation uses `POST /:id/refund`. The server
calculates refund value from order-item snapshots and rejects requests that
exceed the payment ledger balance. Pagination is bounded to 100 rows.

The local mock PayOS flow uses POST /api/orders/mock-payos/confirm with the
exact order code, payment link reference, and VND amount. It does not call an
external payment provider.

### Admin operations

| Method | Path | Purpose |
| --- | --- | --- |
| GET | /api/analytics/summary | Read analytics |
| GET | /api/admin/alerts | Read operational alerts |
| GET | /api/users | List users |
| GET | /api/users/:id | Read a user |
| GET | /api/users/:id/profile | Read a customer profile |
| PUT | /api/users/:id | Update a user |
| POST | /api/products/add | Create a product |
| PUT | /api/products/:id | Update a product |
| PUT | /api/products/:id/inventory | Adjust stock |
| DELETE | /api/products | Soft-delete products |
| GET | /api/products/admin/inventory-movements | Read inventory movements |
| GET | /api/promotions | List promotions |
| POST | /api/promotions | Create a promotion |
| PUT | /api/promotions/:id | Update a promotion |
| DELETE | /api/promotions/:id | Delete a promotion |
| GET | /api/orders | List orders |
| GET | /api/orders/item | List order items and sales |
| POST | /api/orders/status/:oid | Update order status |
| PATCH | /api/support/tickets/:id | Update a support ticket |
| GET | /api/admin/after-sales/requests | List after-sales requests |
| GET | /api/admin/after-sales/requests/:id | Read an after-sales request |
| PATCH | /api/admin/after-sales/requests/:id/status | Transition an after-sales request |
| POST | /api/admin/after-sales/requests/:id/refund | Confirm a provider-backed refund |
| POST | /api/blob/upload | Upload a product image |

Admin list endpoints accept bounded pagination where implemented. Admin access
requires the admin role. Product deletion preserves the existing soft-delete
behavior, and stock changes record inventory movements.

### Payment operations and webhook

| Method | Path | Access |
| --- | --- | --- |
| GET | /api/admin/payments/reconciliation | Admin |
| POST | /api/admin/payments/reconciliation/run | Admin |
| POST | /api/admin/payments/:paymentId/reconcile | Admin |
| POST | /api/admin/payments/:paymentId/confirm-cod | Admin |
| GET | /api/admin/payments/:paymentId/webhook-events | Admin |
| POST | /api/orders/webhooks/payos | PayOS |

The active payment providers are PayOS and cash on delivery. All new catalog,
checkout, order, and payment-ledger records use exact whole-number VND amounts.
There is no active Stripe or bank_transfer checkout path, and no foreign
exchange conversion is applied. Historical USD orders remain readable for
database compatibility.

PayOS checkout returns a payment URL, provider order code, payment-link ID,
amount, and currency. Return URLs only resume status polling. They never prove
payment. The verified webhook is the payment finalization signal.

PayOS webhook processing verifies the signature, stores the event, claims it
idempotently, and checks the exact VND amount, order code, and payment-link
reference. The response reports processed, ignored, mismatch, or retryable
outcomes. PayOS configuration requires PAYOS_CLIENT_ID, PAYOS_API_KEY, and
PAYOS_CHECKSUM_KEY.

Payment reconciliation accepts these provider values:

~~~text
cash
payos
~~~

It accepts these reconciliation states:

~~~text
PENDING
MATCHED
MISMATCH
UNAVAILABLE
MANUAL_CONFIRMED
~~~

The reconciliation run clamps its limit to 100 candidates per request.
Operators can retry PayOS reconciliation, confirm COD collection with an
optional note, and inspect linked webhook events. Refunds currently remain
manual operator actions recorded in the payment ledger.

### Support, returns, warranty, and refunds

Support tickets currently require an authenticated customer or admin session.
The create payload accepts subject, message, optional category, and an
optional orderId. The validator allows a free-form category up to 32
characters, so the storefront can use values such as return, warranty, or
refund without changing the API.

~~~json
{
  "subject": "Request a warranty inspection",
  "message": "The product does not power on after delivery.",
  "category": "warranty",
  "orderId": 1001
}
~~~

Support tickets remain the general authenticated customer-care channel. Use the
dedicated after-sales routes above for return, warranty, and refund workflow;
they enforce order eligibility, quantity conflicts, and payment-ledger bounds.

## Compatibility aliases

Addresses preserve both /api/users/:id/addresses and
/api/user/:id/addresses routes. Notifications preserve both
/api/users/:id/notifications and /api/user/:id/notifications routes. User
profile and user management routes also
preserve the /api/user controller alias. Use the plural /api/users routes for
new clients.

## Performance-safe routes

The k6 scripts in server/test/ send read-only requests. Use
pnpm --dir server perf:readonly, perf:catalog, perf:admin-readonly,
perf:customer-readonly, or perf:auth-readonly as appropriate. Do not run
write-heavy checkout, cart, review, address, notification, promotion,
product, or admin scenarios against production or shared data.
