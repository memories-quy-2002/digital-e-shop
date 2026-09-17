---
contentType: Reference
goal: Trace checkout and payment behavior to its source files
audience: Maintainers and AI agents
contentPlan: Route entrypoints, validation, reservation, provider finalization, and reconciliation
openQuestions: Should OpenAPI generation replace the checked-in static document?
---

Back to [[index]]

# Where checkout and payment behavior lives

TL;DR: Checkout crosses cart, order, inventory, and payment boundaries. These source notes identify the files that validate requests, create reservations, finalize payments, and expose operator controls.

## Request entrypoints

The order controller owns the public route surface:

- `server/src/orders/orders.controller.ts` handles authenticated and guest
  purchase, PayOS session creation, guest lookup, cancellation, discount
  validation, and local mock confirmation
- `server/src/cart/cart.controller.ts` handles guest cart persistence and
  authoritative preview
- `server/src/payments/payosWebhook.controller.ts` receives the unauthenticated
  provider callback and delegates signature verification and finalization
- `server/src/payments/admin-payments.controller.ts` exposes reconciliation,
  COD confirmation, and webhook history to admins

The controller layer parses request data and delegates business work. It does
not own SQL or payment provider state transitions.

## Validation and reservation

`server/src/orders/orders.validator.ts` defines the accepted checkout shapes.
Authenticated checkout accepts a cart, shipping address, discount input, and
`cash` or `payos`. Guest checkout additionally validates contact and shipping
snapshots and limits each guest cart item to a quantity of 99.

`server/src/orders/checkout-reservation.service.ts` coordinates the
server-authoritative quote, inventory reservations, discount redemption, and
pending checkout record. `server/src/orders/checkout-reservation.repository.ts`
keeps SQL and transaction-specific persistence in the repository boundary.

The client total is an input for validation, not proof of the payable amount.
The service reloads products, stock, promotions, and payment currency before it
commits a reservation or order.

## Provider finalization

`server/src/orders/orders.payos.service.ts` creates PayOS links and owns the
local mock confirmation boundary. The mock path requires the exact order code,
payment-link reference, and whole-number VND amount.

`server/src/payments/payos.service.ts` verifies provider signatures and queries
PayOS when reconciliation runs. `server/src/payments/payment-reconciliation.service.ts`
normalizes provider data, checks amount and reference equality, claims
webhook events idempotently, and records terminal or retryable outcomes.

`server/src/payments/payment-reconciliation.repository.ts` persists webhook
events and append-only reconciliation attempts. The database migration
`server/src/database/prisma/migrations/20260916100000_vnd_payment_reconciliation/migration.sql`
defines the operational tables and indexes.

## Operational guarantees

The runtime currently enforces these guarantees:

- PayOS and COD are the only active checkout providers
- New payment amounts use exact whole-number VND
- Successful PayOS finalization requires verified data
- Duplicate webhook delivery does not create a second payment effect
- Reconciliation runs clamp their candidate limit to 100
- COD collection requires guarded admin confirmation
- Refunds remain manual ledger operations

See [[payment]], [[vnd-payment-operations]], and the
[API guide](../../docs/API.md) for the public contract.
