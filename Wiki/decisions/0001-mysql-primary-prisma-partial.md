# ADR 0001 — MySQL is primary persistence; Prisma is partial

Back to [[index]]. Status: **Accepted** (documenting existing state). Date: 2026-06-11.

## Context

The server has both raw MySQL access (`mysql`/`mysql2`) via feature repositories and a Prisma 6 setup (`@prisma/client`, schema at `server/src/database/prisma/schema.prisma`).

## Decision

MySQL through `server/src/modules/*/*.repository.ts` remains the dominant runtime persistence abstraction. Prisma is used only for a limited subset of repository reads. There is **no** committed Prisma migration history and **no** planned full migration.

## Consequences

- New persistence work should follow existing MySQL repository patterns unless a change deliberately introduces Prisma for that path.
- Schema changes must be reflected in **both** raw SQL queries and any touched Prisma schema, plus repositories, services, validators, and shared types.
- Treat checkout, inventory, order timeline, addresses, and notifications carefully — they coordinate multiple tables.

See [[architecture]] → Database.
