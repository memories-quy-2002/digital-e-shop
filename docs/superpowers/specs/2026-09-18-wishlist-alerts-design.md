# Wishlist price-drop and back-in-stock alerts

## Goal

Let authenticated customers opt into in-app alerts for products already in
their wishlist:

- price drop: notify when the effective selling price becomes lower than the
  customer's stored baseline while the product is available;
- back in stock: notify once when stock moves from zero to a positive quantity.

## Product decisions

- Delivery channel is the existing in-app customer notification center only.
- Customers explicitly control price-drop and back-in-stock alerts separately.
- Alert state is event-driven from the server's product and order stock
  mutations, not from polling or a client-only comparison.
- Price-drop notifications are deduplicated by the locked preference baseline.
- Back-in-stock notifications are deduplicated by a persisted out-of-stock
  cycle state.
- Notification records carry product metadata so English and Vietnamese copy
  can be rendered by the client without storing personal data in the message.
- Existing auth, ownership, CSRF, response-envelope, VND formatting, dark/light
  tokens, and responsive behavior remain unchanged.

## API and data contract

- `GET /api/wishlist/:uid` returns the existing product fields plus
  `price_drop_alert_enabled` and `back_in_stock_alert_enabled`.
- `PATCH /api/wishlist/:pid/alerts` accepts the owner-scoped payload
  `{ uid, priceDropEnabled, backInStockEnabled }` and returns the two persisted
  booleans.
- A forward SQL migration adds `wishlist_alert_preferences` and nullable JSON
  metadata to `customer_notifications`.

## Acceptance criteria

1. A user can enable or disable either alert only for a product in their own
   wishlist; malformed payloads and non-owned products are rejected.
2. Adding a wishlist item creates a disabled preference baseline from the
   current product price and stock state; deleting it removes the preference.
3. A qualifying price/stock mutation creates at most one matching in-app
   notification per preference state, inside the same transaction as the
   mutation.
4. A failed notification write rolls back the related product mutation rather
   than silently losing the alert state.
5. Wishlist controls show loading, success, and failure feedback, are keyboard
   accessible, have explicit labels, and remain legible in EN/VI and light/dark
   themes on mobile and desktop.
6. Existing order notifications and wishlist actions continue to work.

## Out of scope

Email/SMS delivery, guest subscriptions, admin alert campaigns, external
providers, price percentage configuration, and automatic alert enrollment.
