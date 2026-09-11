# Prisma and database workflow

Digital-E uses Prisma Migrate to track reviewed forward changes while legacy MySQL repositories remain the dominant runtime persistence layer. The Prisma schema is intentionally partial. Runtime code does not create tables, alter schema, or discover columns.

## Migration ownership

The legacy bootstrap files live under `src/database/migrations/`:

- `defaultdb_2026-06-01_142319.sql` is the historical MySQL dump
- `2026-07-07-add-stripe-payment-support.sql` is the pre-Prisma Stripe schema change

New deployable migrations live under `src/database/prisma/migrations/`:

```text
0_init
20260824053250_enforce_stripe_checkout_idempotency
20260906080000_secure_auth_sessions
20260906090000_checkout_inventory_reservations
20260906095000_inventory_movements
20260906100000_promotion_redemptions
20260906110000_product_sku_order_snapshots
20260906120000_product_attributes
20260906130000_audit_schema_ownership
20260907100000_order_payments_and_operations
20260908100000_guest_checkout
```

`0_init` is a metadata-only baseline marker. It must be recorded as applied after the existing legacy schema is loaded and inspected. It is not a create-schema migration.

The forward migrations cover secure auth sessions, inventory reservations and movements, promotion redemptions, product identity and order snapshots, structured attributes, audit tables, order payments and operations, support tickets, and guest checkout identity fields.

## Environment contract

Migration and runtime commands read `DATABASE_URL`. The MySQL pool also reads `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, and optional `DB_SSL` and `DB_SSL_CA_PATH`.

Authentication and checkout deployments may also require `JWT_SECRET_KEY`, `JWT_REFRESH_SECRET_KEY`, `CSRF_SECRET`, Firebase Admin credentials, Stripe credentials, `CLIENT_URL`, `SERVER_URL`, and `PAYMENT_PROVIDER_MODE`. Use [`.env.example`](.env.example) as the placeholder template and never commit populated environment files.

## Commands

Run from `server/`, or prefix the command with `pnpm --dir server` from the repository root:

```powershell
pnpm prisma:generate
pnpm prisma:validate
pnpm prisma:migrate:status
pnpm prisma:migrate:deploy
pnpm seed:demo
pnpm demo:verify
```

Use `prisma:migrate` for intentional local development migrations only. Use `prisma:migrate:deploy` for shared or production rollout. Never run `prisma migrate reset`, `prisma db push`, or an unreviewed destructive command against a data-bearing database.

`pnpm dev` only runs Prisma Client generation before starting the watcher. It does not migrate or seed. Apply migrations explicitly, then run `pnpm seed:demo` when the local database should contain the demo graph.

## Local Docker setup

The local database is MySQL at `127.0.0.1:3307` with database `digital_e_shop_local`. From the repository root:

```powershell
Copy-Item server/.env.example server/.env
Copy-Item server/.env.docker.example server/.env.docker
pnpm --dir server docker:setup
```

The setup starts Docker MySQL, imports the legacy baseline and historical Stripe SQL, records `0_init`, deploys forward migrations, runs the deterministic demo seed, and verifies counts, images, totals, and orphan relationships.

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
3. Check for duplicate Stripe Checkout Session IDs and the existing unique key when relevant
4. Record `0_init` as applied only after reconciling the legacy baseline
5. Run `prisma:migrate:status`, `prisma:migrate:deploy`, and status again
6. Verify the resulting schema, API health, and a normal checkout or webhook flow

The push-to-`main` CI job runs reviewed migrations only after the disposable client and server jobs pass and the protected `production` Environment approves the operation. The job does not resolve `0_init` for a new target.

## Manual production demo reset

`.github/workflows/demo-seed.yml` is the only approved remote path for rebuilding the selected database from the checked-in demo baseline. It is manual-only, must be dispatched from `main`, and requires a protected `production` Environment, a non-empty verified backup reference, and the exact confirmation `RESET_DEMO_DATABASE`.

The workflow drops base tables, reloads the legacy SQL baseline, records `0_init`, deploys forward migrations, runs `prisma:seed`, and finishes with `demo:verify` and migration status. Do not replace this sequence with `prisma migrate reset` because the Prisma schema is partial.
