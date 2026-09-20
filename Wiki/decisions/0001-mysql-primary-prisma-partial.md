# ADR 0001 - MySQL is primary persistence; Prisma is partial

Back to [[index]]. Status: **Accepted**. Date: 2026-06-11. Updated:
2026-09-20.

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

## Current inventory (2026-09-20)

The local legacy baseline currently contains 30 application tables, excluding
Prisma's own `_prisma_migrations` table. The checked-in Prisma projection now
models all 30 tables: identity/session, catalog lookup, catalog/cart,
commerce/payment, inventory, order timeline, reviews, support, after-sales,
customer addresses, customer notifications, and wishlist.

This remains a deliberate persistence boundary, not a full Prisma rewrite. Raw
MySQL repositories remain authoritative for runtime reads and writes, while
Prisma provides typed projections and selected read-only islands. The address
and notification projections do not invent `User` relations because their
legacy tables have no foreign keys; the wishlist projection preserves its
existing `User` and `Product` foreign keys. Any future model addition must
record exact columns, indexes, foreign keys, nullability, defaults, runtime
callers, and a reviewed migration-history strategy.

Prisma Client currently serves bounded read-only islands in product facets and
review reads. The catalog lookup projection now also exposes `Brand` and
`Category` relations for validated read-only use; it is not yet the product
repository's runtime authority. Critical multi-table writes and transaction
boundaries continue to use the shared `mysql2` transaction context. A Prisma
transaction client and the raw pool must not be mixed in one business
transaction.

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
- Do not run `prisma db pull` against the checked-in partial schema, `db push`,
  or `migrate reset` on a data-bearing database. Schema adoption proceeds in
  reviewed slices, with checkout and other cross-table writes left until the
  persistence boundary is genuinely unified.

See [[architecture]] -> Data and migration boundaries and
[server/README.prisma.md](../../server/README.prisma.md).
