# Prisma migration workflow

Digital-E Shop now uses Prisma Migrate to **track and deploy new database migrations** while the existing MySQL database remains partially legacy-managed.

This is intentionally narrower than the Food Recipes setup: `src/database/prisma/schema.prisma` does not model every Digital-E table. Repositories still use raw SQL for legacy tables such as customer addresses/notifications and catalog metadata. Because of that, Prisma Migrate is the migration history/runner for new reviewed SQL, but it is not yet the sole owner of the complete database schema.

## Files

```text
src/database/prisma/
├── schema.prisma
└── migrations/
    ├── migration_lock.toml
    ├── 0_init/
    │   └── migration.sql
    └── 20260824053250_enforce_stripe_checkout_idempotency/
        └── migration.sql
```

`0_init` is a metadata-only baseline marker. It must be recorded as applied on the existing data-bearing database; it is not a create-schema migration.

The first pending migration adds the unique key required to prevent duplicate orders for the same Stripe Checkout Session.

## Commands

Run from `server/`:

```powershell
pnpm prisma:migrate:status
pnpm prisma:migrate:deploy
pnpm prisma:migrate:resolve -- --applied <migration-name>
```

`prisma:migrate` still maps to `prisma migrate dev` for local development only. Do **not** run it against the shared or production legacy database while the Prisma schema is partial.

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

Until the Prisma schema models the complete database, do not treat `prisma migrate dev` drift output as authority for dropping legacy tables. Expanding Prisma ownership of the full schema should be a separate reviewed change.
