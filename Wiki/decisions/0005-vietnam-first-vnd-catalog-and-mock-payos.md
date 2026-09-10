# 0005 Vietnam-first VND catalog and mock PayOS checkout

Status: accepted
Date: 2026-09-10

## Decision

Vietnam is the first market. The demo catalog, demo discounts, new orders, and
new payment-ledger snapshots use whole-number VND by default through
`STORE_CURRENCY=VND`. The demo seed materializes its readable reference prices
as VND and writes order currency explicitly.

PayOS receives the VND catalog amount unchanged when the store currency is VND.
`PAYOS_USD_TO_VND_RATE` remains available for an explicitly USD-backed catalog,
but is not silently applied to VND prices.

Local `PAYMENT_PROVIDER_MODE=mock` creates a pending reservation and redirects
to `/mock-payos-checkout`. The order is finalized only after the simulator calls
`POST /api/orders/mock-payos/confirm` with the server-issued payment link id,
order code, and exact amount. Live PayOS orders still finalize only through the
verified webhook path.

## Consequences

- Demo storefront and checkout values are displayed as VND.
- Running `pnpm --dir server prisma:seed` is required to materialize the new
  demo values in a local database; the seed remains target-guarded.
- Stripe remains an optional international rail and should be enabled only with
  a deliberate USD currency/catalog configuration. The VND checkout does not
  expose the Card option and the server rejects Stripe checkout in VND mode.
- Historical USD rows remain readable through their stored order currency.
