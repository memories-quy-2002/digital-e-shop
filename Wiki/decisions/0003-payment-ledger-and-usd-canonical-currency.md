# ADR 0003: Payment ledger with USD canonical currency

Back to [[index]]. Related: [[architecture]], [[0001-mysql-primary-prisma-partial]].

## Decision

Orders keep USD as the canonical pricing currency. Provider-specific settlement data is stored in an additive payment ledger rather than being added as more nullable columns on `orders`.

Each payment row stores the USD base amount, provider amount/currency, and the FX rate used for the quote. PayOS receives an integer VND amount; the conversion is explicit and the rate is snapshotted. Local symbolic Stripe/PayOS flows use mock mode and are never presented as live settlement.

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
- PayOS integration can be activated later without storing VND as the order's canonical price.
- Operational code must treat the payment ledger and order status as separate but transactionally coordinated state.
