# 0005 Vietnam-first VND catalog and mock PayOS checkout

Back to [[index]].

Status: accepted
Date: 2026-09-10

## Decision

Vietnam is the first market. The demo catalog, demo discounts, new orders, and
new payment-ledger snapshots use exact whole-number VND. The runtime exposes
VND as a constant rather than a selectable currency environment variable. The
demo seed materializes its readable reference prices as VND and writes order
currency explicitly.

PayOS receives the VND catalog amount unchanged when the store currency is VND.
No FX conversion is active for new records; historical USD rows retain their
stored currency for compatibility.

Local `PAYMENT_PROVIDER_MODE=mock` creates a pending reservation and redirects
to `/mock-payos-checkout`. The order is finalized only after the simulator calls
`POST /api/orders/mock-payos/confirm` with the server-issued payment link id,
order code, and exact amount. Live PayOS orders still finalize only through the
verified webhook path.

## Consequences

- Demo storefront and checkout values are displayed as VND.
- Running `pnpm --dir server prisma:seed` is required to materialize the new
  demo values in a local database; the seed remains target-guarded.
- PayOS and cash are the only active purchase methods. Legacy provider identifiers remain historical database/migration compatibility data and are not active checkout rails.
- Historical USD rows remain readable through their stored order currency.
- Verified PayOS webhooks are durable and idempotent. Admin reconciliation is
  bounded to 100 candidates per run, COD collection is manually confirmed with
  an audit note, and refunds remain manual ledger operations.
