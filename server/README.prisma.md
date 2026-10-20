# Prisma and database workflow

Digital-E uses Prisma Migrate to track reviewed forward changes while legacy MySQL repositories remain the dominant runtime persistence layer. The Prisma schema is intentionally partial. Runtime code does not create tables, alter schema, or discover columns.

## Migration ownership

The legacy bootstrap files live under `src/database/migrations/`:

- `defaultdb_2026-06-01_142319.sql` is the historical MySQL dump
- `2026-07-07-legacy-checkout-schema.sql` provides the legacy checkout schema needed to replay the immutable bootstrap history

New deployable migrations live under `src/database/prisma/migrations/`:

Applied migration names and SQL are immutable history. Keep new deployable changes in a later timestamped migration; do not rename or edit already-applied migrations. `0_init` is a metadata-only baseline marker that is recorded after the legacy schema is loaded and inspected.

The forward migrations cover secure auth sessions, inventory reservations and movements, promotion redemptions, product identity and order snapshots, structured attributes, audit tables, order payments and operations, support tickets, guest checkout, Firebase-era account fields, provider-neutral pending checkouts, VND reconciliation, after-sales/refund state, and VND defaults for newly inserted order/payment rows.

## Current schema projection

As of 2026-09-20, the checked-in legacy baseline contains 30 application
tables, excluding Prisma's own `_prisma_migrations` table. The Prisma schema
now models all 30 of them:

- Identity/session: `users`, `marketing_subscriptions`, `customer_sessions`,
  `customer_addresses`, `customer_notifications`
- Catalog lookup: `brands`, `categories`
- Catalog and cart: `products`, `product_attributes`, `carts`, `cart_items`,
  `guest_carts`, `guest_cart_items`
- Commerce and payments: `discounts`, `orders`, `pending_checkouts`,
  `inventory_reservations`, `discount_redemptions`, `order_items`,
  `order_payments`, `payment_webhook_events`,
  `payment_reconciliation_attempts`
- Operations and support: `inventory_movements`, `order_status_events`,
  `reviews`, `support_tickets`, `after_sales_requests`, `after_sales_items`,
  `after_sales_events`, `wishlist`

Phase 2 added the `Brand` and `Category` read-only projection plus the
existing `Product` foreign-key relations and indexes. Phase 3 added
`CustomerAddress`, `CustomerNotification`, and `Wishlist` after reviewing
their columns, indexes, nullability, defaults, and actual foreign keys. No
baseline projection migration was created: these tables already belong to the
legacy baseline, and the changes only expand the generated client projection.
Runtime writes and cross-table transactions remain owned by the raw MySQL
repositories. Addresses and notifications intentionally have no Prisma
relation to `User` because the legacy tables do not declare foreign keys;
`Wishlist` retains its existing `User` and `Product` relations.

The `20260920120000_vnd_defaults` migration changes only the database defaults
for future `orders.currency` and `order_payments.base_currency` inserts. It
does not rewrite historical USD rows or mixed-currency payment snapshots.

Do not use `prisma db pull` to overwrite the checked-in partial schema. Adding
another model still requires deciding how its already-existing table is
represented in migration history; this projection must not be treated as
permission to run `migrate dev`, `db push`, or a reset against a data-bearing
database.

## Environment contract

Migration and runtime commands read `DATABASE_URL`. The MySQL pool also reads `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, and optional `DB_SSL` and `DB_SSL_CA_PATH`.

Authentication and checkout deployments may also require `JWT_SECRET_KEY`, `JWT_REFRESH_SECRET_KEY`, `CSRF_SECRET`, Firebase Admin credentials, `CLIENT_URL`, `SERVER_URL`, and `PAYMENT_PROVIDER_MODE`. Use [`.env.example`](.env.example) as the placeholder template and never commit populated environment files.

## Commands

Run from `server/`, or prefix the command with `pnpm --dir server` from the repository root:

```powershell
pnpm prisma:generate
pnpm prisma:validate
pnpm prisma:migrate:status
pnpm prisma:migrate:deploy
pnpm prisma:seed
```

Use `prisma:migrate` for intentional local development migrations only. Use `prisma:migrate:deploy` for shared or production rollout. Never run `prisma migrate reset`, `prisma db push`, or an unreviewed destructive command against a data-bearing database.

## Local Docker setup

The local database is MySQL at `127.0.0.1:3307` with database `digital_e_shop_local`. From the repository root:

```powershell
Copy-Item server/.env.example server/.env
Copy-Item server/.env.docker.example server/.env.docker
pnpm --dir server docker:setup
```

The setup starts Docker MySQL, imports the legacy baseline and historical checkout SQL, records `0_init`, deploys forward migrations, runs the deterministic demo seed, and verifies counts, images, totals, and orphan relationships. The final forward migration removes retired checkout-provider columns from the active schema.

The normal demo seed is transactional and idempotent for its demo-owned rows. It rejects non-local database targets. Use `pnpm --dir server demo:verify` to check the graph again without reseeding.

The local demo accounts use the password `DemoPass123!`:

- `demo.admin@digital-e.local` with role `Admin`
- `demo.alice@digital-e.local` with role `Customer`
- `demo.bob@digital-e.local` with role `Customer`
- `demo.carol@digital-e.local` with role `Customer`

Use these accounts only with the local demo database. The seed currently covers 28 products across 8 categories and 16 brands, with linked carts, orders, reviews, wishlists, addresses, notifications, sessions, discounts, and inventory movements.

## Production migration procedure

The repository does not connect to production automatically from a code change. Before a production migration:

1. Create and verify a recoverable backup
2. Confirm the selected host and database
3. Review migration-specific schema changes and confirm the backup is recoverable before deploying cleanup migrations
4. Record `0_init` as applied only after reconciling the legacy baseline
5. Run `prisma:migrate:status`, `prisma:migrate:deploy`, and status again
6. Verify the resulting schema, API health, and a normal checkout or webhook flow

The push-to-`main` CI job runs reviewed migrations only after the disposable client and server jobs pass and the protected `production` Environment approves the operation. The job does not resolve `0_init` for a new target.

## Manual production demo reset

`.github/workflows/demo-seed.yml` is the only approved remote path for rebuilding the selected database from the checked-in demo baseline. It is manual-only, must be dispatched from `main`, and requires a protected `production` Environment, a non-empty verified backup reference, and the exact confirmation `RESET_DEMO_DATABASE`.

Before dropping tables, the workflow validates the existing production Firebase email/password demo accounts with the read-only `demo:firebase:verify` command. Configure `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY` as secrets in the protected GitHub `production` Environment; the service account needs Firebase Authentication user-read access. The seed then maps MySQL user IDs to the existing Firebase UIDs and syncs Firebase's email-verification state without changing Firebase accounts or passwords. The workflow reloads the legacy SQL baseline, records `0_init`, deploys forward migrations, runs `prisma:seed`, and finishes with `demo:verify` and migration status. Do not replace this sequence with `prisma migrate reset` because the Prisma schema is partial.
