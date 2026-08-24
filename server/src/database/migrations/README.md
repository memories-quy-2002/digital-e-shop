# Legacy database SQL

This directory is retained for legacy bootstrap/history only.

- `defaultdb_2026-06-01_142319.sql` is the historical MySQL dump used by the existing local Docker import workflow.
- `2026-07-07-add-stripe-payment-support.sql` records the earlier Stripe schema change that predates Prisma migration history.

New deployable database changes must be added under:

```text
server/src/database/prisma/migrations/<timestamp>_<description>/migration.sql
```

Apply production/staging migrations from `server/` with:

```powershell
pnpm prisma:migrate:deploy
```

Do not add new pending migration SQL files to this legacy directory, otherwise the repository would have two migration sources of truth.
