# ADR 0003: Historical USD-canonical payment ledger decision

Back to [[index]]. Status: **Accepted historical decision; superseded for new
records**. Current-state refresh: 2026-09-17. Related: [[architecture]],
[[0001-mysql-primary-prisma-partial]], [[0005-vietnam-first-vnd-catalog-and-mock-payos]].

## Decision

This page preserves the earlier USD-canonical design for historical context. New
catalog, order, and payment-ledger records now use exact whole-number VND, and
the runtime supports only PayOS and cash on delivery as new payment methods.
Provider-specific settlement data remains in an additive payment ledger rather
than being added as more nullable columns on `orders`.

Each new payment row stores the expected and provider amount/currency, provider
references, reconciliation state, idempotency data, and refund state. PayOS
receives an integer VND amount derived from a server-authoritative quote, and a
pending checkout snapshots the order code, provider reference, amount, and
currency before redirect. A verified PayOS webhook, not a return URL, finalizes
the reservation. Legacy USD and provider identifiers remain readable only for
historical compatibility.

## Why

The existing `orders.payment_method` column is a compatibility field, not a
payment state machine. The ledger represents PayOS and COD attempts, retries,
paid state, reconciliation, and refunds without coupling the order table to one
provider. Legacy values remain readable but are not selectable in checkout.

Automatic FX fetching is outside the current scope. A configured rate makes local/staging behavior deterministic and prevents a provider from receiving an unexplained amount.

## Consequences

- New provider operations implement the payment boundary without changing
  product/order prices.
- PayOS is active behind live credentials and stores exact VND settlement data;
  the payment ledger prevents duplicate finalization and cancellation effects.
- In local mock mode, PayOS checkout finalizes the reservation locally through
  an explicit simulator; it never contacts an external provider.
- PayOS retries are idempotent through the provider order code and the payment ledger reference; amount and currency mismatches fail closed.
- Admin reconciliation is bounded to 100 candidates per run, and COD
  collection requires guarded manual confirmation with an optional audit note.
- Operational code must treat the payment ledger and order status as separate but transactionally coordinated state.
