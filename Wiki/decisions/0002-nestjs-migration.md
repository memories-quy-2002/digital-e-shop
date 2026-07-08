# ADR 0002 — Migrate server from Express to NestJS

Back to [[index]]. Status: **Accepted, implemented**. Date: 2026-07-08.

## Context

`server/` was hand-rolled Express 5 with a `routes → controller → service → repository` convention per feature under `server/src/modules/*`. The team wanted enforced DI/module structure, built-in ecosystem features (guards/interceptors/pipes, OpenAPI generation), and NestJS familiarity for hiring — not a specific production pain point. Full design in [docs/superpowers/specs/2026-07-08-nestjs-migration-design.md](../docs/superpowers/specs/2026-07-08-nestjs-migration-design.md).

## Decision

Full big-bang rewrite to NestJS (not strangler-fig/incremental-proxy), on one long-lived branch, gated by a Step 0 cold-start spike (see [spike/nestjs-coldstart/RESULTS.md](../spike/nestjs-coldstart/RESULTS.md) — inconclusive data, but the team explicitly accepted the ~191ms warm-request penalty and proceeded without re-measuring true cold start).

Migration ran in two structural passes:

1. **Phases 1–7** (module-by-module cutover): each feature got a Nest `@Controller`/`@Injectable()` wrapper that initially still `require()`d its logic from the old Express `modules/<feature>/*.service.ts` — a thin shim reusing the existing Zod validators, guards replacing `requireAuth`/`requireAdmin`/`requireOwnerOrAdmin`, and an `AllExceptionsFilter` preserving legacy per-route response shapes. Ended with `server/api/index.ts`/`server/src/server.ts` cut over to the Nest bootstrap and the old `app.ts` + all `*.routes.ts` deleted.
2. **Phase 8 — structural collapse** (done at explicit user request after Phase 7): the Phase 1–7 wrappers were still delegating to real logic living in `server/src/modules/*` — the Express *routing* layer was gone, but business logic and raw MySQL queries hadn't actually moved. This phase physically relocated every `.service.ts`/`.repository.ts`/`.dto.ts`/`.validator.ts`/`.types.ts` into `server/src/<feature>/`, converted every service/repository to real constructor-injected classes (no more `require()` delegation), and then flattened `server/src/nest/*` up to be `server/src/*` directly. `server/src/nest/` and `server/src/modules/` no longer exist — Nest **is** the server source tree now, not a subfolder layered on top of it.

## Consequences

- New backend work follows Nest conventions directly: `@Module`/`@Controller`/`@Injectable()` per feature under `server/src/<feature>/`, guards for auth (`AuthGuard`/`RolesGuard` from `server/src/guards/`), `ZodValidationPipe` for validation (Zod kept, not class-validator), `AllExceptionsFilter` for legacy-shaped error responses.
- `AuthGuard`/`RolesGuard` depend on real DI-provided `NestAuthService`/`UsersRepository`; both are exported globally via `@Global()` on `AuthModule`/`UsersModule` (same pattern as `NestConfigModule`) so every feature module can use the guards without an explicit import.
- Persistence is unaffected: MySQL-via-repository remains primary, Prisma remains partial (see [[0001-mysql-primary-prisma-partial]]) — this migration was explicitly scoped to not touch that.
- **Known gap**: Google OAuth (`/auth/google`, `/auth/google/callback`) is not migrated — `@nestjs/passport` isn't installed. Follow-up task needed if Google login must be restored.
- **Unverified risk carried forward**: true idle-then-cold serverless latency was never measured (Step 0's data was contaminated); if production cold-start turns out worse than the warm-request signal suggested, revisit the Vercel serverless hosting model.
- Verification after both phases: `typecheck`, `build`, `lint`, and the full Vitest suite (71/71 passing across 17 files) all clean.

See [[architecture]] → Backend, and the full spec/phase log in [docs/superpowers/specs/2026-07-08-nestjs-migration-design.md](../docs/superpowers/specs/2026-07-08-nestjs-migration-design.md).
