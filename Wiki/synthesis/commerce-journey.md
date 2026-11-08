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

## Storefront path

Catalog search folds Vietnamese spelling and ranks exact SKU and model matches.
Empty results offer individual filter removal while preserving the keyword.
Product detail keeps the purchase action reachable after scrolling on mobile.
Comparison retains its differences filter and brings category-specific specs
forward. The component checker compares explicit socket or memory-standard
evidence and reports missing or ambiguous data.

The footer links directly to guest order lookup. Checkout can invalidate stale
shipping fees while keeping entered delivery details. Client analytics records
bounded search outcomes and cart and checkout attempts as separate series.
See the [storefront guide](../../docs/storefront-customer-journey.md) for metric
definitions and verification scope.

The 2026-11-08 browser review used intercepted API fixtures. It confirmed
mobile add-to-cart feedback, stock blocking, empty-search recovery, sticky
purchase access, and a CPU/motherboard specification lookup at 390px, plus a
desktop product layout at 1440px. This is client-flow evidence only. The local
API could not connect to MySQL (`127.0.0.1:3307`), so persistence, authoritative
checkout, delivery quotes, and payment remain unverified; see the guide for the
full evidence boundary.

From the storefront, customers can add products as guests or signed-in users,
edit quantities in the cart, and apply a discount code. The checkout action
revalidates the cart with the server. If it succeeds, the customer moves
directly to checkout; there is no separate cart-review dialog that repeats the
item subtotal before delivery is known.

Checkout keeps contact, delivery, and payment on one page. Customers can reuse
saved or recent addresses, request an internal delivery quote, apply eligible
loyalty points when signed in, and compare PayOS with cash on delivery. The
summary shows the quoted shipping fee and payable total before the final action.
A three-step progress indicator marks the cart complete, delivery and payment
current, and order confirmation next; the completed cart step returns to the
cart.

Cart validation failures remain in the cart with item-level issues. Checkout
keeps recoverable form errors visible and requires a fresh quote when address,
cart, or pricing changes. These are implemented recovery paths; conversion
impact has not been measured with analytics or an experiment.

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
