---
contentType: Concept
goal: Record the customer loyalty earning, redemption, and voucher boundaries
audience: Maintainers and AI agents
contentPlan: Point policy, ledger idempotency, payment confirmation, checkout reservations, and voucher ownership
openQuestions: none
---

Back to [[index]]

# Loyalty points and promotion vouchers

Loyalty is customer-owned. New or existing accounts without ledger activity
read as zero points; no historical purchases are backfilled. Guest orders do
not participate.

## Earning and direct redemption

The policy awards one point per 1,000 VND of merchandise value after promotion
and direct-point discounts. Shipping is excluded. PayOS awards points only
after a verified paid transition; COD awards points after collection is
confirmed. Ledger event keys make repeated webhooks and confirmation paths
idempotent.

One point offsets one VND of eligible merchandise. Checkout validates the
requested amount against the remaining merchandise total and customer balance.
PayOS reserves points with its checkout attempt and releases them when the
attempt is canceled. COD deducts points when the order is created and returns
them once if the order is canceled.

## Promotion vouchers

An admin promotion with a positive `loyalty_points_cost` can be claimed by a
customer. Claiming atomically deducts points and creates a unique,
single-use voucher bound to the customer. Checkout rechecks ownership, source
promotion dates, minimum order, and usage limits. A guest cannot apply a
customer voucher.

The runtime MySQL repositories own the transaction boundary. Prisma schema and
the forward migration describe the additive persistence change; deployment
must apply the migration before the feature is enabled.

## Source trail

Implementation lives in `server/src/loyalty/`, with checkout integration in
`server/src/orders/`, `server/src/promotions/`, and `server/src/payments/`.
Customer UI lives in `client/src/features/loyalty/`; see [[guest-checkout]]
and [[payos-checkout-reliability]] for adjacent access and payment guarantees.
