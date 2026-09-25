# Product alert

Back to [[index]]. Product alerts connect a customer's saved product to
in-app price-drop and back-in-stock notifications.

## Preferences

`product_alert_subscriptions` stores one row per `(user_id, product_id)` with
`price_drop_enabled` and `back_in_stock_enabled` flags. A customer can read or
update these preferences through the owner-scoped product-alert routes. When
both flags are disabled, the row is removed. There is no target-price field or
external delivery channel. Alert reads join the catalog and exclude invalid
rows with negative raw stock, while keeping `stock = 0` products visible for
back-in-stock management. Enabling either alert checks and locks the product
row inside the write transaction, so soft-deleted or missing products cannot
receive new subscriptions. Disabling both alerts still deletes an existing
subscription without requiring the product row to remain available.

The client exposes the same preference controls on Product Detail and Wishlist.
Guests are sent to the canonical login route with the current product URL as a
validated redirect. Wishlist alert loading is independent from wishlist item
loading, so a temporary alert API failure keeps the saved products usable and
offers a retry.

## Transition events

`product_alert_events` is the durable event identity for a product transition.
The policy derives an effective positive price from `sale_price` only when it
is lower than the positive catalog price; otherwise it uses the catalog price.
It emits:

- `price_drop` only when the effective price decreases.
- `back_in_stock` only when raw stock crosses from `<= 0` to `> 0`.

Product update and authoritative order-restock paths call the alert service
inside their existing MySQL transaction. Checkout reservations and other
non-authoritative stock changes do not emit restock alerts.

## Notifications

For each enabled subscription, the same transaction inserts a
`customer_notifications` row with `alert_event_id`, `type`, a product link,
and JSON metadata containing product name, price/stock snapshots, and event
identity. The unique `(alert_event_id, user_id)` key makes retries idempotent.
The customer account resolver translates `price_drop` and `back_in_stock` into
English or Vietnamese copy when metadata is valid; malformed metadata falls
back to the server-provided title/message without rendering `undefined` or an
invalid price.

## Boundaries

- Runtime persistence remains MySQL through the feature repository.
- Prisma schema and the forward migration mirror the alert tables and
  notification metadata columns, but do not replace raw-MySQL transaction
  ownership.
- `AuthGuard`, `RolesGuard`, `OwnerParam`, and strict Zod input validation stay
  on the API routes.
