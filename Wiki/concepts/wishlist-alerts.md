# Wishlist alerts

## Purpose

Wishlist alerts let an authenticated customer opt into two independent
in-app updates for a saved product: a lower effective VND selling price and a
return from zero stock to a positive quantity.

## Runtime boundary

- `server/src/wishlist/` owns the preference table, owner-scoped PATCH route,
  and alert processor.
- `ProductsService` processes admin price/stock edits.
- `OrdersService` processes checkout deductions, PayOS reservation
  finalization, and canceled-order restocks.
- `customer_notifications.metadata` carries product context for the client;
  `CustomerAccountPage` localizes the alert copy in EN/VI.

## Consistency rules

The alert preference row is locked with `FOR UPDATE` and updated in the same
transaction as the product mutation. Price-drop state stores the current
effective selling price as its baseline. Back-in-stock state stores whether
the product was available, so one `0 -> positive` transition produces one
notification. A notification insert failure rolls back the related mutation.

Adding a wishlist item creates a disabled preference with the current baseline;
removing it deletes that preference. The PATCH route requires the wishlist
owner and accepts only booleans; the server never accepts a client-provided
baseline or price.

## Client behavior

The Wishlist row exposes separate, labeled controls with loading, error, and
focus states. The controls use shared light/dark theme tokens and remain
stacked on narrow viewports. No email/SMS provider or guest subscription is
part of this feature.
