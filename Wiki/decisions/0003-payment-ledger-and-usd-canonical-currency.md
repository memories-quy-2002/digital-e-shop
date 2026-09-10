# ADR 0003: Payment ledger with USD canonical currency and Vietnam-first PayOS settlement

Back to [[index]]. Status: **Accepted, implemented**. Current-state refresh:
2026-09-10. Related: [[architecture]], [[0001-mysql-primary-prisma-partial]].

## Decision

Orders keep USD as the canonical pricing currency. Provider-specific settlement data is stored in an additive payment ledger rather than being added as more nullable columns on `orders`.

Each payment row stores the USD base amount, provider amount/currency, and the FX rate used for the quote. PayOS is the primary Vietnam checkout rail: it receives an integer VND amount derived from a server-authoritative quote, and the pending checkout snapshots the order code, provider reference, amount, currency, and FX rate before redirect. A verified PayOS webhook, not a return URL, finalizes the reservation. Stripe remains an optional international rail. Local symbolic Stripe/PayOS flows use mock mode and are never presented as live settlement.

## Why

The existing `orders.payment_method` column is a compatibility field, not a payment state machine. A ledger can represent cash, bank transfer, Stripe, and PayOS attempts, retries, paid state, and refunds without coupling the order table to one provider.

Automatic FX fetching is outside the current scope. A configured rate makes local/staging behavior deterministic and prevents a provider from receiving an unexplained amount.

## Consequences

- New provider integrations implement the payment boundary without changing product/order prices.
- Stripe refunds use the provider payment reference and a deterministic
  idempotency key, while the database ledger prevents duplicate cancellation
  side effects.
- In local mock mode, card checkout finalizes the reservation locally and
  returns to the local success page; it never opens a live Stripe session.
- PayOS is active behind live credentials without storing VND as the order's canonical product/order price.
- PayOS retries are idempotent through the provider order code and the payment ledger reference; amount and currency mismatches fail closed.
- Operational code must treat the payment ledger and order status as separate but transactionally coordinated state.
