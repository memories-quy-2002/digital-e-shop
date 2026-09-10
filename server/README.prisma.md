# Prisma migration workflow

Digital-E Shop uses Prisma Migrate to **track and deploy forward database migrations** while the existing MySQL database remains partially legacy-managed.

`src/database/prisma/schema.prisma` is still a partial model of the Digital-E database, and repositories still use parameterized raw SQL for some legacy tables. Prisma migrations nevertheless own every new schema change. Runtime repositories never run `CREATE TABLE`, `ALTER TABLE`, `SHOW COLUMNS`, or information-schema discovery; they assume the deployed migration history is present.

## Files

```text
src/database/prisma/
├── schema.prisma
└── migrations/
    ├── migration_lock.toml
    ├── 0_init/
    │   └── migration.sql
    ├── 20260824053250_enforce_stripe_checkout_idempotency/
    │   └── migration.sql
    ├── 20260906120000_product_attributes/
    │   └── migration.sql
    └── 20260906130000_audit_schema_ownership/
        └── migration.sql
```

`0_init` is a metadata-only baseline marker. It must be recorded as applied on the existing data-bearing database; it is not a create-schema migration.

The tracked migrations add the Stripe Checkout Session idempotency key, typed product attributes, inventory reservations, product/order snapshot columns, payment ledger and cancellation fields, persisted support tickets, and migration-owned audit tables such as inventory movements and order status events. The audit migration also adopts the existing address, notification, and user-auth schema into the forward migration path without giving repositories runtime DDL responsibilities.

## Environment contract

Migration commands require a valid `DATABASE_URL`. The server runtime also reads `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, and `DB_SSL` for its MySQL pool. Authentication and checkout deployments must provide `JWT_SECRET_KEY`, `JWT_REFRESH_SECRET_KEY`, `CSRF_SECRET`, Firebase Admin credentials (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`), and Stripe credentials (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`). Use [`server/.env.example`](.env.example) as the checked-in placeholder template; never commit populated `.env` files.

## Commands

Run from `server/`:

```powershell
pnpm prisma:migrate:status
pnpm prisma:migrate:deploy
pnpm prisma:migrate:resolve -- --applied <migration-name>
```

`prisma:migrate` still maps to `prisma migrate dev` for local development only. Do **not** run it against the shared or production legacy database while the Prisma schema is partial. Production and shared environments use reviewed forward migrations with `prisma migrate deploy`.

Never run `prisma migrate reset` against a data-bearing database.

## Production rollout for the current Stripe migration

The repository change does not connect to production or mutate production data. Perform the following operator steps against the production MySQL database.

### 1. Backup first

Create and verify a database backup/snapshot before changing migration metadata or indexes. For a MySQL CLI backup, use the production host/user/database values from your secret manager or hosting dashboard; do not commit credentials.

Example shape:

```powershell
mysqldump -h <HOST> -P <PORT> -u <USER> -p --ssl-mode=REQUIRED --single-transaction --set-gtid-purged=OFF <DATABASE> > before-prisma-baseline.sql
```

### 2. Confirm the target database

```sql
SELECT DATABASE() AS database_name, @@hostname AS hostname, NOW() AS database_time;
```

### 3. Check whether the Stripe unique key already exists

```sql
SHOW INDEX
FROM orders
WHERE Key_name = 'uq_orders_stripe_checkout_session';
```

### 4. Check for duplicate Checkout Session IDs

Run this before adding the unique key:

```sql
SELECT
    stripe_checkout_session_id,
    COUNT(*) AS order_count
FROM orders
WHERE stripe_checkout_session_id IS NOT NULL
GROUP BY stripe_checkout_session_id
HAVING COUNT(*) > 1;
```

If this query returns rows, stop. Reconcile the duplicate orders before applying or resolving the Stripe migration.

### 5A. Normal path: unique key is absent

Set `DATABASE_URL` for the production database in the current shell/session, then record only the baseline as already applied:

```powershell
pnpm prisma:migrate:resolve -- --applied 0_init
pnpm prisma:migrate:status
```

The status should show `0_init` as applied and `20260824053250_enforce_stripe_checkout_idempotency` as pending.

Apply the pending migration:

```powershell
pnpm prisma:migrate:deploy
pnpm prisma:migrate:status
```

### 5B. Reconciliation path: unique key already exists

If the exact key already exists because the SQL was previously applied manually, do not run the `ALTER TABLE` again. Record both migrations as applied:

```powershell
pnpm prisma:migrate:resolve -- --applied 0_init
pnpm prisma:migrate:resolve -- --applied 20260824053250_enforce_stripe_checkout_idempotency
pnpm prisma:migrate:status
```

This reconciles Prisma migration history with the database without re-running the existing index change.

## Verify after rollout

Confirm the unique key:

```sql
SHOW INDEX
FROM orders
WHERE Key_name = 'uq_orders_stripe_checkout_session';
```

Expected properties:

- `Key_name = uq_orders_stripe_checkout_session`
- `Non_unique = 0`
- `Column_name = stripe_checkout_session_id`

Then verify the deployed API health endpoint and a normal Stripe checkout flow. A repeated `checkout.session.completed` event must not create a second order for the same Checkout Session.

## Future migrations

Put new deployable migrations under:

```text
src/database/prisma/migrations/<timestamp>_<description>/migration.sql
```

Use reviewed SQL and deploy it with:

```powershell
pnpm prisma:migrate:deploy
```

Do not add new pending migration files to `src/database/migrations/`; that directory is retained for legacy dump/bootstrap history.

Until the Prisma schema models the complete database, do not treat `prisma migrate dev` drift output as authority for dropping legacy tables. Expanding Prisma ownership of the full schema should be a separate reviewed change. Do not replace a migration with runtime table creation or schema probing.

## Local demo seed

The demo seed uses the legacy MySQL table shape because the Prisma schema
intentionally models only part of this database. It is transactional and
idempotent for rows owned by the deterministic demo accounts/products; it does
not reset or truncate the database.

Run it from `server/` against the local Docker database:

```powershell
pnpm docker:setup
```

`docker:setup` runs the seed and its Docker-environment verification. To
verify again later, run:

```powershell
pnpm docker:verify
```

All four demo accounts use the password `DemoPass123!`:

- `demo.admin@digital-e.local` (`Admin`)
- `demo.alice@digital-e.local` (`Customer`)
- `demo.bob@digital-e.local` (`Customer`)
- `demo.carol@digital-e.local` (`Customer`)

The graph links users to addresses, carts, orders, order items, reviews,
wishlists, notifications, sessions, and inventory movements. Products resolve
through their category and brand parents, every order has distinct product
items with matching totals, and every seeded catalog product has a unique,
verified HTTPS stock image URL understood by the storefront image helper. The
expanded catalog contains 28 products across 8 categories and 16 brands, and
each product is represented in demo order, review, and wishlist relationships.
`demo:verify` fails on count, image, or orphan-link mismatches.

The seed and verifier reject non-local `DB_HOST`/`DATABASE_URL` targets during
normal local operation. Do not bypass that guard manually for the configured
Aiven database.

## Manual production demo reset

The repository now contains a deliberately destructive, manual-only GitHub
Actions workflow at `.github/workflows/demo-seed.yml`. It is the only approved
remote path for rebuilding the selected database from the checked-in demo
baseline and must be dispatched from `main`. It does not run on pushes, pull
requests, Vercel deployments, or server startup.

Configure a protected GitHub `production` Environment with `DATABASE_URL`,
`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, and `DB_SSL` when
TLS is required. Verify a recoverable backup first, then dispatch the workflow
with a non-empty backup ID/timestamp and the exact confirmation
`RESET_DEMO_DATABASE`.

The workflow runs `pnpm demo:reset`, which drops the selected database's base
tables, reloads the committed legacy dump plus the historical Stripe SQL, and
clears the imported rows while retaining the legacy table structure. It then
records `0_init`, runs `prisma migrate deploy`, invokes
`pnpm prisma:seed` using `src/database/seeders/demoSeedData.js`, and finishes
with `pnpm demo:verify`. This is intentionally not implemented with
`prisma migrate reset`: the Prisma schema is partial and the raw-MySQL legacy
tables must be restored from the checked-in baseline first.

The remote path requires all of `DEMO_SEED_MODE=full-reset`,
`ALLOW_DESTRUCTIVE_DEMO_SEED=true`, and `DEMO_SEED_CONFIRMATION=RESET_DEMO_DATABASE`.
The local seed command remains protected by `assertLocalDatabaseTarget`.
