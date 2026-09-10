# ADR 0002 - Migrate the server from Express to NestJS

Back to [[index]]. Status: **Accepted, implemented**. Decision date:
2026-07-08. Current-state refresh: 2026-09-10.

## Context

The original `server/` runtime was hand-rolled Express 5 with a
`routes -> controller -> service -> repository` convention under
`server/src/modules/`. The project chose NestJS to make dependency injection,
module boundaries, guards, pipes, interceptors, and OpenAPI integration part of
the server structure. The original design and phase history remain in
[the migration specification](../../docs/superpowers/specs/2026-07-08-nestjs-migration-design.md).

## Decision

The server uses NestJS on the Express adapter. The migration was completed in
two broad passes:

1. Feature routes were moved behind Nest controllers while preserving the
   existing API response contracts and security behavior.
2. The temporary wrappers and old module tree were removed. Current feature
   code lives directly under `server/src/<feature>/` as Nest modules,
   controllers, services, repositories, DTOs, validators, and types.

`server/src/app.module.ts` is the composition root. `server/src/main.ts`
creates and caches the Nest application for local and serverless entrypoints;
`server/src/server.ts` starts the local process and `server/api/` reuses the
same bootstrap.

## Current consequences

- New backend work follows `@Module`, `@Controller`, and `@Injectable()`
  conventions inside `server/src/<feature>/`.
- `AuthGuard`, `RolesGuard`, `OwnerParam`, and `ZodValidationPipe` replace the
  old Express middleware/validation placement at the Nest boundary.
- `AllExceptionsFilter`, request-id interception, and Pino logging preserve
  compatibility response fields while adding shared metadata and correlation.
- `main.ts` supplies the global `/api` prefix. Controllers must not hard-code
  `api/` in their decorator paths.
- Stripe webhook handling depends on Nest raw-body support for signature
  verification, and bootstrap must call `app.init()` before routes are used.
- Persistence is intentionally unaffected by this decision: MySQL repositories
  remain primary and Prisma remains partial. See [[0001-mysql-primary-prisma-partial]].
- Google OAuth was removed from the active runtime on 2026-09-08; it is not a
  current integration boundary.

## Verification

Run the current package-local checks rather than relying on the historical
migration report:

```powershell
pnpm --dir server typecheck
pnpm --dir server test -- --run
pnpm --dir server build
pnpm --dir server lint
```

See [[architecture]] -> Backend and [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).
