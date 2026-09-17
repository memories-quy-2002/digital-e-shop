---
contentType: Conceptual
goal: Explain how VND payment operations protect checkout and settlement
audience: Maintainers, operators, and AI agents
contentPlan: Currency, providers, finalization, reconciliation, and recovery
openQuestions: What evidence and approval should a future automated refund require?
---

Back to [[index]]

# How VND payment operations stay auditable

TL;DR: Digital-E accepts PayOS and COD for new checkout. Pending reservations, verified PayOS webhooks, guarded COD confirmation, and append-only reconciliation attempts keep the local order state aligned with payment evidence.

## Currency and provider boundary

The runtime uses exact whole-number VND for new catalog, checkout, order, and
payment-ledger amounts. PayOS receives the same VND amount without foreign
exchange conversion.

The active provider values are `payos` and `cash`. Legacy Stripe identifiers
and historical USD rows remain readable for compatibility, but new checkout
does not expose those choices.

## Finalization sequence

Payment operations follow this sequence:

1. The server recalculates the cart and reserves inventory
2. PayOS creates a payment link, or COD creates a pending ledger payment
3. PayOS sends a signed event to the webhook endpoint
4. The server verifies the event and compares order code, link ID, amount, and currency
5. The server finalizes the reservation once and records the payment state
6. An operator confirms COD collection through an admin-only action

Return URLs resume status polling. They do not prove that a payment completed.
Local mock PayOS uses the same exact-value checks without an external provider.

## Reconciliation and recovery

The admin reconciliation service compares PayOS data with pending checkout or
order payment records. It stores the outcome, provider values, mismatch reason,
requesting actor, and timestamp in `PaymentReconciliationAttempt`.

The service recognizes these states:

| State | Meaning |
| --- | --- |
| `PENDING` | The local record needs comparison |
| `MATCHED` | Provider data matches the local payment |
| `MISMATCH` | Provider data conflicts with the local payment |
| `UNAVAILABLE` | PayOS data cannot be retrieved now |
| `MANUAL_CONFIRMED` | An operator confirmed a COD collection |

Each run accepts at most 100 candidates. A failed or mismatched comparison
remains visible for operator review. It does not silently mark the order paid.

## Audit and idempotency

`PaymentWebhookEvent` uses a provider and event key uniqueness boundary.
Payload hashes and attempt counters preserve evidence and retry context.
Payment idempotency keys, provider references, and reservation state prevent a
duplicate webhook from creating a second order effect.

Refunds remain manual ledger operations. A future refund workflow must verify
the original payment, refund amount, currency, order state, and operator
approval before it changes the ledger.

## Operational references

See [[payment]], [[checkout-and-payment-runtime]],
[[0003-payment-ledger-and-usd-canonical-currency]],
[[0005-vietnam-first-vnd-catalog-and-mock-payos]], and the
[API guide](../../docs/API.md).
