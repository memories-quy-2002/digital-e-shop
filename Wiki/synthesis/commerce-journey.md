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
PayOS tokens are kept in `sessionStorage` with the attempt before redirect.
If that browser session is lost, email OTP recovery issues a replacement
token, invalidates the old token, and rotates matching after-sales hashes in
one transaction. Guest token hashes never appear in admin responses or public
URLs.

Payment callbacks do not use customer authentication. The PayOS webhook uses
signature verification, exact amount and reference checks, durable event
storage, and idempotent claiming instead.

## Journey recovery points

Return requests use the exact inclusive UTC deadline returned with order
details: 23:59:59.999 on the seventh UTC calendar day after delivery. The UI
shows that timestamp in the selected language and labels UTC.

Single-use delivery quotes can become expired, invalid, or stale when cart,
route, or settings change. The API returns stable error codes; the client
discards the old quote while retaining the typed address and map pin, then
blocks checkout until a replacement quote is confirmed.

Cart merge uses an owner-scoped operation ID and immutable snapshot. The API
commits item increments and the stored result together, so a retry after a
lost response does not add quantities twice. Partial results retain rejected
guest items for a new operation.

## Related knowledge

See [[product]], [[order]], [[payment]], [[guest-checkout]], and
[[vnd-payment-operations]]. Use the [API guide](../../docs/API.md) for the
endpoint contract.
