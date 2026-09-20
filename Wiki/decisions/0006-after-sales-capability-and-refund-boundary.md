# 0006 — Dedicated after-sales requests and capability-safe guest access

Status: accepted — 2026-09-20

## Decision

Use a dedicated after-sales module with request, item, and event tables. Keep
support tickets as the general customer-care channel. Authenticated customers
are scoped by user ID; guests are scoped by the existing order capability token
hash.

Use POST body-token lookup for guest after-sales reads and writes. This is a
deliberate contract choice over GET query tokens because query values commonly
enter access logs, browser history, and referrer metadata.

Refunds are admin-confirmed but server-calculated. The service derives the
amount from immutable order-item snapshots, locks the payment ledger, delegates
to the provider boundary, and writes the ledger only after provider success.
Unconfigured live refunds fail closed.

## Consequences

- Customers and guests can use the same policy without sharing an identity model.
- Quantity overlap and refund balance become enforceable database-backed rules.
- Provider-specific refund support remains a separate integration task.
- The client must retain the guest token in memory for the current lookup flow;
  it must not put the token in a route or query string.
