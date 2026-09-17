---
contentType: Reference
goal: Trace support ticket behavior and after-sales gaps to source files
audience: Maintainers, support operators, and AI agents
contentPlan: Routes, validation, persistence, order context, and deferred guest flow
openQuestions: Which identity proof should a guest use to create an after-sales request?
---

Back to [[index]]

# Where support and after-sales behavior lives

TL;DR: The current support implementation provides authenticated tickets, not a complete return or warranty state machine. This note records the source-level boundary so future work can extend it without weakening order privacy.

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
deadline.

The agreed return rule is 7 calendar days after successful delivery. The
runtime has no dedicated return request endpoint, eligibility query, return
status, or refund transition. Admin handling must therefore verify the rule
manually when a ticket represents an after-sales request.

## Deferred guest flow

Guest order lookup protects an order with a one-time token, but support tickets
require a persisted authenticated user. A guest cannot currently create or read
a support ticket through this controller.

A future guest after-sales endpoint should bind the request to an order and a
token hash, expose only guest-safe fields, enforce the 7-day delivery window,
and record every operator decision. It should not place raw tokens in URLs or
reuse the public order lookup response as a ticket write contract.

See [[support-ticket]], [[order]], and [[order-lifecycle-and-support]].
