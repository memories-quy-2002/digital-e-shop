---
contentType: Conceptual
goal: Explain payment records, provider boundaries, and reconciliation state
audience: Maintainers, operators, and AI agents
contentPlan: Payment records, provider flow, reconciliation, and audit rules
openQuestions: When should automated refunds replace the current manual ledger action?
---

Back to [[index]]

# How Digital-E records a payment

TL;DR: Payment state is separate from order state. The payment ledger links an order to PayOS or COD, while pending checkout, webhook events, and reconciliation attempts preserve the operational audit trail.

## Payment records

An `OrderPayment` belongs to an order and stores the provider, status, provider
references, idempotency key, amount, currency, payment timestamps, simulated
flag, reconciliation status, and the last reconciliation result.

`PendingCheckout` holds a temporary checkout reservation. It stores the
provider reference, provider order code, expected amount and currency,
reservation token, cart snapshot, guest identity snapshot, expiration, and
state. It exists before a PayOS payment becomes a committed order.

`PaymentWebhookEvent` stores a provider event key, payload hash, normalized
payload, PayOS identifiers, amount, currency, processing status, attempt count,
and processing timestamps. `PaymentReconciliationAttempt` stores each operator
or scheduled comparison, including expected values, provider values, outcome,
requesting actor, and mismatch reason.

## Active providers and currency

The active provider boundary accepts `payos` and `cash`. The current store
currency is `VND`, represented as exact whole-number amounts for new catalog,
checkout, order, and payment-ledger records.

PayOS receives the VND amount unchanged. The local mock mode simulates the
PayOS link and confirmation without an external request. Legacy Stripe fields
and historical USD rows remain readable for database compatibility, but they do
not represent active checkout choices.

## Payment lifecycle

The payment lifecycle follows the order reservation:

1. Checkout validates the server-authoritative cart and reserves inventory
2. PayOS creates a provider link, or COD creates a pending payment
3. PayOS finalizes only after a verified webhook or guarded reconciliation
4. COD becomes collected only through the guarded admin confirmation
5. Refunds remain manual ledger operations

The finalizer checks the exact provider order code, payment-link reference,
amount, currency, and payment status. Idempotency keys, unique provider
references, webhook event keys, and reservation state prevent duplicate
finalization.

## Reconciliation states

The reconciliation workspace compares local records with PayOS results and
records append-only attempts. It uses `PENDING`, `MATCHED`, `MISMATCH`,
`UNAVAILABLE`, and `MANUAL_CONFIRMED` states.

Admin runs clamp their candidate limit to 100. A mismatch does not silently
mark an order paid. Operators must inspect the provider values and the linked
webhook history before taking a manual action.

## Source trail

Payment record definitions live in
`server/src/database/prisma/schema.prisma`. Provider and ledger types live in
`server/src/payments/payment.types.ts`. Reconciliation behavior lives in
`server/src/payments/payment-reconciliation.service.ts` and
`server/src/payments/payment-reconciliation.repository.ts`.

See [[vnd-payment-operations]], [[0005-vietnam-first-vnd-catalog-and-mock-payos]],
and the [API guide](../../docs/API.md).
