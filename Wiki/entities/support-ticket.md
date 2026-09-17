---
contentType: Conceptual
goal: Explain support tickets and their after-sales boundaries
audience: Maintainers, support operators, and AI agents
contentPlan: Identity, validation, workflow, access, and return-policy gap
openQuestions: When will guest after-sales requests receive a token-protected API?
---

Back to [[index]]

# How support tickets represent after-sales work

TL;DR: A support ticket connects an authenticated customer to a question or after-sales request. It can reference an order, but the current API does not yet create guest tickets or enforce return eligibility.

## Ticket identity

The `support_tickets` table requires a `user_id` and assigns an integer `id`.
It can reference an `order_id` and stores a category, subject, message, status,
priority, optional admin note, and timestamps.

The order link is optional because customers may ask a general product or
account question. For return, warranty, or refund requests, the storefront can
use the category field and attach the relevant order when available.

## Validation and workflow

The create validator requires a subject with 3 to 160 characters and a message
with 1 to 5,000 characters. Category accepts up to 32 characters, and `orderId`
must be a positive integer when supplied.

Ticket status uses `OPEN`, `IN_PROGRESS`, `WAITING_FOR_CUSTOMER`, `RESOLVED`,
and `CLOSED`. Priority uses `LOW`, `NORMAL`, `HIGH`, and `URGENT`. Admin
updates must change at least one of status, priority, or `adminNote`.

## Access boundary

Customers can create tickets and list only their own tickets. Admins can list
the operational queue and update any ticket. The controller keeps the existing
authentication, role, ownership, CSRF, and rate-limit boundaries.

Guest order lookup protects order data with a one-time token, but the current
support controller has no equivalent guest ticket endpoint. The storefront
must not ask a guest to expose a token or personal data in a public URL.

## Return-policy status

The agreed business rule allows returns within 7 calendar days after successful
delivery. The current support validator does not calculate this window, and no
dedicated return, warranty, or refund state machine exists yet.

Until that workflow is implemented, an admin must verify delivery timing,
order status, item condition, and payment context inside the support operation.
The future implementation should use `delivered_at` as the start of the
eligibility window and record the decision in an auditable order or after-sales
record.

## Source trail

The entity model lives in `server/src/database/prisma/schema.prisma`. Request
validation lives in `server/src/support/support.validator.ts`, while route
access lives in `server/src/support/support.controller.ts`. Persistence and
workflow coordination live in `server/src/support/support.repository.ts` and
`server/src/support/support.service.ts`.

See [[order]], [[order-lifecycle-and-support]], and
[[support-and-after-sales-runtime]].
