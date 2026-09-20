---
contentType: Reference
goal: Trace support ticket behavior and after-sales workflow to source files
audience: Maintainers, support operators, and AI agents
contentPlan: Routes, validation, persistence, order context, guest capability flow, and refund ledger
openQuestions: none
---

Back to [[index]]

# Where support and after-sales behavior lives

TL;DR: Support tickets remain authenticated-only, while the dedicated after-sales module now handles customer and guest returns/warranty requests with token-hash ownership and payment-ledger refund coordination.

## Route and role boundary

`server/src/support/support.controller.ts` mounts the support API under
`/api/support/tickets`. Authenticated customers can create and list their own
tickets. Admins can list the operational queue and update ticket status,
priority, or notes.

The controller uses `AuthGuard` and `RolesGuard`. Customer reads are scoped by
the authenticated identity, and the admin update route requires the admin role.
Unsafe requests keep the global CSRF and rate-limit protections.

## Request and persistence boundary

`server/src/support/support.validator.ts` validates subject, message, category,
orderId, status, priority, and adminNote. It accepts a free-form category up to
32 characters, so return, warranty, and refund can be represented without
changing the schema.

`server/src/support/support.service.ts` coordinates business behavior, while
`server/src/support/support.repository.ts` owns support ticket SQL. The
database model in `server/src/database/prisma/schema.prisma` links a ticket to
one required user and one optional order.

## Order context

`server/src/orders/orders.controller.ts` and
`server/src/orders/orders.service.ts` own delivery and order status changes.
The order lifecycle stores `delivered_at` when a Pending order becomes Done.
The current support validator does not compare that value with a return
deadline. The dedicated after-sales policy does: the return window is seven
inclusive UTC calendar days after delivery, while warranty uses the item
snapshot.

## After-sales runtime

Guest order lookup protects an order with a one-time token, and after-sales
requests reuse only its SHA-256 token hash. The raw token is accepted in POST
bodies for create/list/detail operations and is never persisted or placed in a
URL. Guest response objects do not expose the token hash.

`server/src/after-sales/after-sales.policy.ts` owns eligibility and legal
transitions. `after-sales.service.ts` owns order-item ownership, quantity
conflict checks, idempotency, and provider fail-closed behavior. The
repository owns the three after-sales tables and the `refunded_amount` payment
ledger projection.

Routes are documented in [[after-sales-request]] and `docs/API.md`.

See [[support-ticket]], [[order]], and [[order-lifecycle-and-support]].
