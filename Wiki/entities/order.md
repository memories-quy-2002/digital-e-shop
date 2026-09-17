---
contentType: Conceptual
goal: Explain order identity, lifecycle, and historical data boundaries
audience: Maintainers and AI agents
contentPlan: Identity, lifecycle, item snapshots, access, and reporting
openQuestions: When should a dedicated return workflow become an order capability?
---

Back to [[index]]

# How an order preserves the customer transaction

TL;DR: An order records a committed purchase for an authenticated customer or a guest. Its identity, status, item snapshots, payment link, and inventory effects define the source of truth after checkout.

## Order identity

An authenticated order stores `user_id`. A guest order keeps `user_id` null and
stores a contact snapshot with guest email, name, phone, and a SHA-256 hash of
the one-time guest order token.

The raw guest token is returned once during checkout and is never stored in the
database. Guest lookup requires both the order identifier or PayOS order code
and the token. Authenticated reads enforce order ownership unless the caller
has the admin role.

## Order lifecycle

The numeric `status` uses one stable mapping:

- `0 Pending`: the order is not complete
- `1 Done`: delivery is complete and `delivered_at` is set once
- `2 Canceled`: the order is terminal and inventory restoration is complete

Only Pending orders can move to Done or Canceled. Repeating a terminal
operation remains idempotent. Canceling a Pending order locks the order,
restores deducted inventory once, records an inventory movement, writes a
status event, and emits one customer notification.

`inventory_restored_at` acts as the order-level concurrency and idempotency
guard. `cancellation_reason` records the optional reason without deleting the
order.

## Item and payment relationships

An order owns one or more `OrderItem` rows. Each item keeps the product
identity and commercial values seen at checkout, including SKU, name, image,
unit price, brand, category, warranty, specifications, and quantity.

An order can have related `OrderPayment`, `PendingCheckout`,
`DiscountRedemption`, `OrderStatusEvent`, `InventoryMovement`, and
`SupportTicket` records. These records let operators audit payment, inventory,
promotion, status, and after-sales actions without reconstructing history from
the current catalog.

## Reporting and access rules

Canceled orders remain stored for auditability, but status `2` is excluded from
revenue, discount, item performance, payment mix, customer spend, and period
order metrics. Review eligibility uses the same completed-order rule, so
Pending and Canceled orders do not qualify.

Guest orders stay outside authenticated customer history. Admin order queries
may display guest contact snapshots, but they never expose guest token hashes.

## Source trail

Order behavior lives in `server/src/orders/`, payment relations live in
`server/src/payments/`, and the persistence model lives in
`server/src/database/prisma/schema.prisma`. See
[[order-lifecycle-and-support]] and [[commerce-journey]] for cross-domain
behavior.
