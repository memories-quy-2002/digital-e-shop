# Legacy database SQL

This directory stores bootstrap history for the existing MySQL schema. It is not the location for new pending Prisma migrations.

- `defaultdb_2026-06-01_142319.sql` is the legacy MySQL dump used by local Docker and CI bootstrap
- `2026-07-07-add-stripe-payment-support.sql` is the historical Stripe schema change that predates Prisma Migrate

New deployable changes belong under:

```text
server/src/database/prisma/migrations/<timestamp>_<description>/migration.sql
```

The bootstrap sequence loads these legacy files, records the metadata-only `0_init` migration, applies forward Prisma migrations, and then runs the seed or verification command. See [server/README.prisma.md](../../../README.prisma.md) and [docs/ci-cd.md](../../../../docs/ci-cd.md) for the complete workflow.

Run migration commands from `server/`:

```powershell
pnpm prisma:migrate:status
pnpm prisma:migrate:deploy
```

Do not add new SQL migration files here. Keeping two pending-migration sources would make deployment order ambiguous.
