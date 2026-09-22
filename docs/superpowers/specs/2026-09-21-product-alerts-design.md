# Product Alerts — Design Specification

**Status:** Draft for review  
**Date:** 2026-09-21  
**Scope:** Authenticated customer price-drop and back-in-stock alerts

## Context

Digital-E already has a customer wishlist and an in-app notification center,
but wishlist rows do not store alert preferences and product notifications do
not carry structured metadata or an event identity. Product price changes are
handled by the products service, while stock changes are handled by product
admin updates, checkout, and order cancellation/restock flows.

The feature must work with the current independent `client/` and `server/`
packages, keep MySQL as the runtime persistence boundary, preserve existing
notification and wishlist response contracts, and support English/Vietnamese
plus dark/light themes.

## Goals

- Let an authenticated customer subscribe independently to price-drop and
  back-in-stock alerts for a product.
- Expose the controls on Product Detail and Wishlist without forcing the
  customer to understand the underlying subscription model.
- Create one in-app notification per customer per product alert event, even if
  the triggering write is retried.
- Localize alert notifications in the existing notification center using
  structured metadata rather than storing only rendered English copy.
- Cover every authoritative price and stock transition currently present in
  the backend.
- Keep the UI responsive at 375px, 768px, 1024px, and desktop widths, with no
  page-level horizontal overflow.

## Non-goals

- Email, SMS, browser push, or Firebase push delivery in the first version.
- Customer-defined target prices or price history charts.
- Guest subscriptions or anonymous notification storage.
- A notification preference center unrelated to product alerts.
- Changing the existing product, cart, checkout, or wishlist public response
  shapes beyond additive fields/endpoints.

## Approved business rules

1. A subscription is identified by `(user_id, product_id)` and contains two
   independent booleans: `price_drop_enabled` and `back_in_stock_enabled`.
2. A missing subscription means both alert types are disabled. Updating both
   flags to `false` removes the subscription row after the update succeeds.
3. Enabling an alert is idempotent. Re-enabling an existing alert does not
   replay old events or create a historical notification.
4. A price-drop event occurs only when the product's effective customer price
   strictly decreases. The effective price is the valid positive `sale_price`
   when it is lower than `price`; otherwise it is `price`.
5. Saving a product without changing its effective price does not create an
   event. A later decrease creates a new event even if that price was used by a
   previous event.
6. A back-in-stock event occurs only when raw product stock transitions from
   `<= 0` to `> 0`. Pending checkout reservations do not create an event by
   themselves; the product is considered in stock when raw stock is positive.
7. Checkout stock deductions do not create back-in-stock events. Admin restock,
   product-editor stock increases, and canceled-order inventory restoration do
   create an event when they cross the defined boundary.
8. Only subscriptions enabled at event creation receive that event's
   notification. The subscription remains enabled after delivery until the
   customer disables it.
9. Removing a wishlist item does not implicitly disable a separate alert
   subscription. This avoids surprising customers who used Product Detail's
   alert control. The Wishlist UI must make the active alert state visible and
   provide the same disable controls.
10. Deleted or unavailable products are never returned by the alert API. A
    product that becomes unavailable after a subscription exists produces no
    new notification; existing notifications remain readable.
11. Notification insertion is idempotent by `(alert_event_id, user_id)`. A
    retry or concurrent duplicate dispatch cannot create a second notification
    for the same customer and event.
12. Alert notifications link to `/product?id=<productId>`. If a customer is
    not authenticated, Product Detail controls route to Login with a URL-safe
    return target.

## Backend design

### Persistence

Add a forward MySQL migration and matching Prisma schema/migration metadata.
The legacy SQL dump remains a baseline and must not be treated as the runtime
migration mechanism.

#### `product_alert_subscriptions`

```sql
id                   INT AUTO_INCREMENT PRIMARY KEY
user_id              VARCHAR(255) NOT NULL
product_id           INT NOT NULL
price_drop_enabled   TINYINT(1) NOT NULL DEFAULT 0
back_in_stock_enabled TINYINT(1) NOT NULL DEFAULT 0
created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
updated_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
UNIQUE (user_id, product_id)
INDEX (product_id)
FOREIGN KEY user_id -> users.id
FOREIGN KEY product_id -> products.id
```

The table is intentionally separate from `wishlist`: alerts are an explicit
customer action and can be enabled from Product Detail without silently adding
an item to the wishlist. Wishlist rows join to the subscription when the page
is loaded.

#### `product_alert_events`

```sql
id                INT AUTO_INCREMENT PRIMARY KEY
product_id        INT NOT NULL
alert_type        VARCHAR(32) NOT NULL
previous_price    DECIMAL(10,2) NULL
current_price     DECIMAL(10,2) NULL
previous_stock    INT NULL
current_stock     INT NULL
created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
INDEX (product_id, alert_type, created_at)
FOREIGN KEY product_id -> products.id
```

Each qualifying transition receives a new event row. Its ID is the stable
dedupe identity for notification delivery, so repeated identical prices or
stock quantities across separate transitions remain valid future events.

#### `customer_notifications` additions

- `metadata JSON NULL`, containing a bounded object such as
  `{ productId, productName, currentPrice, previousPrice, eventId }`.
- `alert_event_id INT NULL` with an index and a unique nullable pair for
  `(alert_event_id, user_id)`.

Existing order notifications continue to work with null metadata and null event
identity. The repository must parse JSON safely and return metadata in the
existing normalized notification payload.

### Module and service boundary

Add a `server/src/product-alerts/` feature with:

- `product-alerts.controller.ts`
- `product-alerts.service.ts`
- `product-alerts.repository.ts`
- `product-alerts.module.ts`
- DTO, validator, types, and focused tests

The service owns subscription policy, transition detection, event creation, and
notification fan-out. The repository owns parameterized SQL. Product and order
services call a transaction-aware service method after locking and updating the
product row; they do not construct notification SQL themselves.

The module must be importable by Products, Orders, and Wishlist without
creating a circular dependency. Notification persistence can be extended with
a transaction-aware repository method, while the existing notification service
continues to own order notification behavior.

### API

```http
GET /api/users/:uid/product-alerts
GET /api/users/:uid/product-alerts/:productId
PUT /api/users/:uid/product-alerts/:productId
```

All routes use `AuthGuard`, `RolesGuard`, `OwnerParam("uid")`, and Zod
validation. The update body is:

```json
{
  "priceDropEnabled": true,
  "backInStockEnabled": false
}
```

The list response is bounded to the authenticated user's subscriptions and
returns:

```json
{
  "alerts": [
    {
      "productId": 42,
      "priceDropEnabled": true,
      "backInStockEnabled": false
    }
  ],
  "msg": "Product alerts retrieved successfully"
}
```

The single-product endpoint returns a disabled default when no subscription
exists. The update endpoint returns the persisted state and a route-local
`msg`; it never accepts a user ID from a trusted client body.

### Transition integration

- `NestProductsService.updateInventoryService`: lock the old stock, update the
  product, then call the transaction-aware alert service with old/new stock.
- `NestProductsService.updateProductDetailsService`: compare old/new effective
  price and stock inside the same transaction and record qualifying events.
- Order cancellation/restoration: for each locked product, compare stock before
  and after restoration and record a back-in-stock event when appropriate.
- Checkout deduction remains event-free for back-in-stock purposes.

Event creation and notification fan-out occur in the same database transaction
as the authoritative product transition. The unique constraint provides the
last line of defense against duplicate notifications. A notification failure
must be observable through structured logging and covered by tests; the service
must not issue unbounded per-user queries.

### Notification localization

Extend the existing notification normalization to return safe metadata. The
client maps `price_drop` and `back_in_stock` to localized title/message copy,
using the product name and formatted VND price from metadata. If metadata is
missing or malformed, the UI falls back to the server title/message instead of
crashing or showing `undefined`.

## Frontend design

### Product Detail

Add a compact “Stay in the loop” panel beneath the purchase actions:

- Heading and one-line explanation.
- Two labelled switch rows with an icon, label, helper text, and current state.
- `Price drop` is available regardless of current stock.
- `Back in stock` is available for future restock tracking, especially when the
  item is unavailable.
- Guest interaction redirects to Login with the current product URL.
- Authenticated interaction shows saving, saved, error, and retry states.

The primary purchase CTA remains authoritative: alerts never enable Add to Cart
or imply inventory reservation.

### Wishlist

Join each wishlist item with its alert state and render an “Alert preferences”
subsection inside the existing item card/row. On desktop it uses a compact
two-column detail area; on mobile it stacks below product information and
actions. It must not reintroduce clipped prices or the previous excessive empty
left-side spacing.

The page summary may include a count of products with at least one active alert,
but the individual controls remain the primary action. Removing a wishlist item
must update only wishlist state; alert subscriptions remain manageable from
Product Detail or the notification flow.

### Notifications

Extend the existing customer notification center so alert types have:

- localized title and message in EN/VI;
- distinct line icon and semantic accent;
- product-detail link;
- the same read/unread and mark-all-read behavior as order notifications.

### Visual and accessibility requirements

- Use existing Digital-E theme tokens; no raw color literals in component SCSS.
- Preserve both dark and light theme contrast, including inactive switches and
  focus rings.
- Use 44px minimum interactive targets and visible keyboard focus.
- Add `aria-label`, `aria-checked`, and a live status for saving/error feedback.
- Never communicate state by color alone; pair state with text or icon shape.
- Use mobile-first layout and test 375px, 768px, 1024px, and desktop widths.
- Respect `prefers-reduced-motion`; keep transitions to meaningful 150–300ms
  feedback and avoid animating layout dimensions.
- Use existing SVG/icon components; no emoji or generated bitmap in production
  UI.

### Localization

Add all customer-facing copy and status messages to `client/src/i18n/en.ts`
and `client/src/i18n/vi.ts`. Alert notification rendering must use the active
locale and existing currency/date helpers. Do not hard-code English in the new
components.

## Verification plan

### Backend

- Unit-test effective-price normalization and strict price-drop detection.
- Unit-test stock boundary transitions, including cancellation restoration.
- Unit-test subscription upsert/delete behavior and ownership validation.
- Unit-test notification metadata normalization and event dedupe.
- Test repository SQL for parameterization, bounded fan-out, and unique event
  identity.
- Run the server typecheck, build, lint, and focused Vitest suite.
- Run MySQL integration tests when the isolated integration database is
  available; do not run production migrations as part of local verification.

### Frontend

- Test Product Detail guest redirect and authenticated toggle states.
- Test Wishlist alert loading, optimistic state rollback, retry, and removal.
- Test localized alert notifications with valid and malformed metadata.
- Test EN/VI and dark/light states with no clipped text or horizontal overflow.
- Use Playwright for Product Detail, Wishlist, and Notifications at desktop and
  mobile viewports after implementation.
- Run client typecheck, focused Vitest tests, build, lint, and the client test
  suite.

## Documentation updates after implementation

- Add the three alert endpoints and response examples to `docs/API.md`.
- Update the relevant Wiki entity/concept pages and append one entry to
  `Wiki/log.md`.
- Add a lightweight ADR only if the separate subscription/event-ledger choice
  needs to be recorded beyond this specification.
