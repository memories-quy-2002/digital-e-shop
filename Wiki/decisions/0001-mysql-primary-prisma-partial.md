# ADR 0001 - MySQL is primary persistence; Prisma is partial

Back to [[index]]. Status: **Accepted**. Date: 2026-06-11. Updated:
2026-09-10.

## Context

The server has two persistence mechanisms. Feature repositories use raw MySQL
(`mysql`/`mysql2`) for most runtime reads and writes. Prisma 7 provides the
schema, generated client, forward migration history, and a limited subset of
repository access.

The server later moved from Express to NestJS, so repositories now live under
`server/src/<feature>/` as `@Injectable()` providers. That structural change did
not change the persistence decision.

## Decision

MySQL through feature repositories remains the dominant runtime persistence
abstraction. Prisma remains intentionally partial and is not a full persistence
rewrite.

Prisma migrations are now committed under
`server/src/database/prisma/migrations/`. The metadata-only `0_init` migration
records the existing legacy baseline; it does not replace the checked-in SQL
dump used to create the initial CI/local database. Later migrations are forward
changes that must be deployed after the legacy baseline.

## Consequences

- New persistence work should follow existing MySQL repository patterns unless
  a change deliberately introduces Prisma for that path.
- Schema changes must keep raw SQL, repositories, services, validators, shared
  types, and any touched Prisma schema/migration aligned.
- CI and local bootstrap combine the legacy SQL baseline with forward Prisma
  migrations; an empty Prisma-only database is not the supported baseline.
- Checkout, inventory, order timeline, addresses, notifications, sessions, and
  promotion redemption require special care because they coordinate multiple
  tables and transaction boundaries.
- Runtime entrypoints and demo seeders retain database-target guards. Do not
  point local reset/seed workflows at production or an unapproved remote.

See [[architecture]] -> Data and migration boundaries and
[server/README.prisma.md](../../server/README.prisma.md).
