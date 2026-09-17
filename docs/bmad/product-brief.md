# Product brief for Digital-E

A living, lightweight brief for product and engineering decisions. Update it
when product direction changes.

Goal: provide a shared product baseline for feature planning without replacing
the current source code or API documentation.

Audience: the maintainer, product engineers, reviewers, and AI agents.

Content plan: product, users, value, current scope, constraints, deferred work,
and open questions.

Open questions: see the final section. Keep unresolved decisions explicit.

## Product

Digital-E is a full-stack e-commerce platform for electronic components and
devices. It serves customers through a storefront and operators through an
admin dashboard.

## Target users

- Customers browse, compare available products, manage carts and wishlists,
  check out, track orders, and request support
- Guest shoppers browse, maintain an anonymous cart, complete token-protected
  checkout, and look up their order with a one-time token
- Admins manage products, orders, accounts, promotions, inventory, payments,
  support work, and analytics

## Value proposition

Digital-E combines a focused electronics catalog with operational controls for
inventory movement, order timelines, VND payment evidence, reconciliation, and
customer support.

## Current scope

- Storefront: catalog, search, filters, pagination, product details,
  attributes, reviews, ratings, carts, checkout, coupons, wishlist, reorder,
  order history, addresses, notifications, and support tickets
- Guest commerce: anonymous cart persistence, server-authoritative preview,
  COD or PayOS checkout, one-time order lookup, and cart merge after sign-in
- Admin: dashboard analytics, product and inventory management, order
  operations, accounts, promotions, notifications, alerts, payments, and
  reconciliation
- Backend: cookie-based JWT sessions, Firebase verification in production,
  CSRF protection, roles and ownership guards, MySQL repositories, partial
  Prisma migrations, inventory reservations, payment ledger, verified PayOS
  webhook handling, and support ticket persistence

## After-sales direction

The agreed return window is seven calendar days after successful delivery.
The current API provides authenticated support tickets, but it does not yet
expose dedicated return, warranty, refund, or guest after-sales routes.

The next after-sales implementation should let guests create a request tied to
their order and proof token. It must enforce ownership, expose only guest-safe
fields, verify the delivery date on the server, and record operator actions.
Do not describe this future flow as current behavior until the runtime supports
it.

## Payment direction

PayOS and cash on delivery are the active payment choices for new checkout.
New catalog, order, checkout, and ledger amounts use exact whole-number VND.
PayOS return URLs resume status polling. Verified webhook data finalizes
payment. Reconciliation and guarded COD confirmation provide operator recovery.
Refunds remain manual ledger operations until a separate workflow is approved.

## Constraints

- Keep `client/` and `server/` as independent pnpm packages
- Preserve API response keys, route aliases, cookies, CSRF, CORS, role checks,
  ownership checks, and existing error contracts
- Keep MySQL as the primary runtime persistence path. Treat Prisma as partial
  and migration-scoped
- Do not add a dependency or a new abstraction without a concrete need
- Keep contact details, phone numbers, addresses, and business metrics as fake
  placeholders until the maintainer explicitly provides public values
- Do not commit secrets, tokens, cookies, personal data, or production payment
  credentials

## Deferred or out of scope

- Full Prisma ownership of the legacy database
- Replacing cookie-based authentication or Firebase identity verification
- Stripe and `bank_transfer` as new checkout choices
- Automated refunds without approved evidence, authorization, and ledger rules
- Guest accounts or a second persistent guest-cart database
- Guest returns, warranty, or refund requests until the token-bound workflow is
  designed and implemented

## Open questions

- Which order evidence should a guest submit with a return or warranty request?
- Which products, delivery states, and exception reasons are eligible for
  return within seven calendar days?
- Which operator roles can approve a refund, and which ledger transitions are
  required?
- When should a payment reconciliation result create or update an order
  notification?
