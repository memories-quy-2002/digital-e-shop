---
contentType: Conceptual
goal: Explain how a customer journey crosses Digital-E domains
audience: Maintainers, product engineers, and AI agents
contentPlan: Catalog, cart, checkout, order, payment, and after-sales handoffs
openQuestions: Which journey steps should become explicit application events?
---

Back to [[index]]

# How a Digital-E purchase moves through the system

TL;DR: A purchase starts with current catalog data, passes through an authoritative cart and inventory reservation, becomes an order, and then enters payment and after-sales operations. Each handoff has a separate source of truth.

## Journey map

The main customer journey follows this sequence:

1. Product browsing reads current product, price, stock, and attribute data
2. Cart persistence stores product IDs and quantities
3. Cart preview recalculates stock, promotions, and totals on the server
4. Checkout reserves inventory and creates a pending payment when needed
5. COD creates a pending order payment, while PayOS creates a provider link
6. A verified PayOS event or COD confirmation completes the payment operation
7. The order becomes Done after successful delivery and records `delivered_at`
8. A customer can review a purchased product or open a support ticket

The browser improves responsiveness, but it does not own price, stock,
payment, or order state.

## Source of truth at each handoff

| Handoff | Source of truth | Why it matters |
| --- | --- | --- |
| Catalog to cart | Current product records | Product values can change |
| Cart to checkout | Server preview and transaction | Client totals are not trusted |
| Checkout to payment | Pending checkout and reservation | Inventory cannot oversell |
| Provider to order | Verified provider data | A return URL is not payment proof |
| Delivery to after-sales | Order `delivered_at` and status | Return timing needs a stable start |
| Ticket to operation | Database support ticket | A toast is not a workflow record |

## Identity and privacy boundaries

Authenticated customers use Firebase-backed sessions and ownership checks.
Guests use an anonymous cart cookie and a one-time token for order lookup.
Guest orders keep a contact snapshot, but guest token hashes never appear in
admin responses or public URLs.

Payment callbacks do not use customer authentication. The PayOS webhook uses
signature verification, exact amount and reference checks, durable event
storage, and idempotent claiming instead.

## After-sales gap

The support ticket is the current entry point for return, warranty, and refund
questions. It requires an authenticated customer and accepts a free-form
category plus an optional order reference.

The agreed return window is 7 calendar days after successful delivery. The
current runtime does not enforce that window or expose a dedicated guest
after-sales endpoint. See [[support-ticket]] and
[[support-and-after-sales-runtime]] before planning that feature.

## Related knowledge

See [[product]], [[order]], [[payment]], [[guest-checkout]], and
[[vnd-payment-operations]]. Use the [API guide](../../docs/API.md) for the
endpoint contract.
