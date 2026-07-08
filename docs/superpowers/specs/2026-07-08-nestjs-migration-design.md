# NestJS Migration — Design

Date: 2026-07-08
Status: Approved (spec), pending Step 0 spike data before implementation begins

## Purpose

Migrate `server/` from hand-rolled Express 5 to NestJS. Motivation: enforced DI/module structure, built-in ecosystem features (guards/interceptors/pipes, OpenAPI generation), and team/hiring familiarity with a more opinionated framework. Not driven by a specific production pain point.

## Current state (baseline)

- Express 5 composition root: [server/src/app.ts](../../../server/src/app.ts)
- Deployed as a Vercel serverless function via [server/api/index.ts](../../../server/api/index.ts), which exports the Express `app` directly for `@vercel/node` to pick up.
- 13 feature modules under `server/src/modules/*` (`routes → controller → service → repository`), sizes:
  - orders 13, auth 9, cart 8, inventory 8, addresses/notifications/products/promotions/reviews/users/wishlist 7 each, analytics/blob 5.
- Cross-cutting composition in `app.ts`:
  - Manual CORS header middleware **and** the `cors()` package both applied (intentionally redundant — not to be "cleaned up").
  - `csrf-csrf` `doubleCsrf()` double-submit-cookie CSRF, with `/users/login`, `/users/register`, `/users/refresh` (both `/api/`-prefixed and bare) excluded.
  - Stripe webhook route registered with `express.raw()` **before** `express.json()`/CSRF, because signature verification needs the raw body and the handler always terminates the request itself.
  - `authLimiter` (`express-rate-limit`) applied to login/register paths, both prefixed and bare.
  - Dual route mounting: `/api/users` and `/api/user` both get `authRoutes + usersRoutes + addressesRoutes + notificationsRoutes`; `/api/products/admin` mounts `inventoryRoutes`.
  - Scalar-generated OpenAPI docs registration.
  - CSRF-specific error handler, then a generic `errorHandler`.
- Validation: Zod (`<feature>.validator.ts`), not class-validator.
- Auth: Passport + Google OAuth 2.0, custom JWT (access + refresh secrets), `requireAuth` / `requireAdmin` / `requireOwnerOrAdmin` middleware.
- Data access: primarily raw MySQL in `*.repository.ts`, Prisma partially adopted — **not** a target of this migration; stays as-is.
- Testing: Vitest suite exists for cart and inventory logic (CI-gated) — the only real regression safety net today.
- Constraints from [AGENTS.md](../../../AGENTS.md): preserve API response shapes (`msg`/`error`/route-specific keys), preserve CSRF/CORS/rate-limit behavior, preserve route aliases, preserve `requireAuth`/`requireAdmin`/`requireOwnerOrAdmin` semantics, do not "clean up" contracts unasked.

## Scope

In scope:
- Full rewrite of `server/src` to NestJS module/controller/provider structure, one long-lived branch, merged when parity is verified (big-bang, not strangler-fig — team wants a coherent end-state DI structure, not an incremental proxy layer).
- Preserving every existing API contract, auth/CSRF/CORS behavior, and route alias exactly.
- A gating spike (Step 0) to validate Vercel serverless cold-start cost before the rest of the work is scoped in detail.

Out of scope:
- Finishing the Prisma migration (raw MySQL repositories stay raw MySQL, wrapped as Nest providers, not converted to a Nest ORM/Prisma module).
- Switching validation from Zod to class-validator (Zod is kept, wrapped in a custom Nest `ZodValidationPipe`).
- Any API contract or response-shape change.
- Frontend changes (client is unaffected; it talks to the same routes).

## Step 0 — Cold-start spike (gates the rest of the plan)

Build a minimal Nest app (`AppModule` + one health controller), wire it into `server/api/index.ts` via `@vercel/node` with the Nest app instance cached across invocations (module-level singleton, not recreated per request). Deploy to a Vercel preview URL and measure:
- Cold invocation latency vs. current bare-Express `/api/health` baseline.
- Warm invocation latency vs. baseline.
- Bundle size impact.

Decision gate:
- If cold-start overhead is acceptable, proceed with serverless deployment (`@vercel/node` + cached Nest instance) for the full migration.
- If not acceptable, stop and revisit hosting (e.g. a long-running container/VM target) **before** continuing — this changes the shape of the entrypoint and bootstrap work, so it must be decided first.

No fixed numeric threshold was set in advance; report raw cold/warm numbers and flag if they look concerning relative to the current baseline, then get explicit sign-off before proceeding past Step 0.

## Target architecture

### Module structure mapping

| Current | Nest equivalent |
|---|---|
| `<feature>.routes.ts` | `@Controller(...)` decorator on the controller class |
| `<feature>.controller.ts` | Nest controller, methods as `@Get()/@Post()/@Put()/@Delete()` handlers |
| `<feature>.service.ts` | `@Injectable()` provider, constructor-injected |
| `<feature>.repository.ts` | `@Injectable()` provider; stays hand-rolled MySQL |
| `<feature>.validator.ts` (Zod) | Kept as Zod; wrapped in a custom `ZodValidationPipe` applied per-route/DTO |
| `requireAuth` / `requireAdmin` / `requireOwnerOrAdmin` | Nest Guards (`CanActivate`), same authorization logic, applied via `@UseGuards(...)` |
| `errorHandler` | Nest exception filter (`@Catch()`), preserving existing per-route-family response shapes — not normalized |
| `requestLogger` | Nest interceptor or raw middleware via `MiddlewareConsumer`, same non-production-only behavior |
| Passport strategies | Ported ~1:1 via `@nestjs/passport` |
| `csrf-csrf` `doubleCsrf` | Wrapped as Nest middleware via `MiddlewareConsumer.apply(...).exclude(...)` for the same login/register/refresh paths; not replaced with a different CSRF approach |
| Route aliases (`/api/x` + bare `/x`, `/api/user` + `/api/users`) | Nest array-path controllers (`@Controller(['users', 'user'])`) |
| Stripe webhook raw body | Nest `rawBody: true` app option; dedicated route reads `req.rawBody`, registered so raw body capture still happens before global JSON parsing applies to other routes |

### Migration order

1. **Scaffolding**: `AppModule`, `ConfigModule` wrapping existing `env.config`, global pipes/filters/guards shell, health check route. This is where Step 0's validated bootstrap becomes real.
2. **Auth foundation**: Passport strategies, JWT guards, CSRF middleware, rate-limit middleware. Everything else depends on this being correct first.
3. **Low-interdependency modules** (structural template for the rest): `wishlist`, `addresses`, `notifications`, `reviews`.
4. **Core commerce modules**: `products`, `inventory`, `promotions` (inventory/promotions interact with products).
5. **Highest-risk modules, most scrutiny**: `cart`, `orders` (checkout, Stripe webhook, order timeline, multi-table coordination), `users` (auth-adjacent, ownership checks).
6. **`analytics`, `blob`** — lower risk, scheduled wherever convenient.
7. **Cutover**: swap `server/api/index.ts` to the Nest bootstrap; remove old Express `app.ts` and route files.

### Testing / parity verification

- Existing Vitest suite for cart/inventory must keep passing through and after migration of those modules — this is the primary regression net for the two highest-risk modules.
- For every migrated module: same request → same response shape, same status codes, same auth/CSRF/ownership behavior as pre-migration Express, checked manually against the contract where no automated test exists.
- Full verification command set from AGENTS.md (`typecheck`, `build`, `lint`, `test`) run per module and again at final cutover.

## Named risks

- **Serverless cold start** — gated by Step 0; largest architectural unknown.
- **CSRF double-submit-cookie behavior** under Nest's middleware ordering — must match current cookie/session-identifier logic exactly.
- **Stripe webhook raw-body path** — a misordered global pipe silently breaks signature verification; needs explicit testing, not just typecheck.
- **Double CORS handling** (manual header middleware + `cors()` package) — preserved as-is even though redundant; not "cleaned up."
- **Prisma/raw-MySQL coexistence** — migration must not become a vehicle for also finishing the Prisma migration; that stays a separate, explicitly out-of-scope decision.

## Rollout

Single long-lived branch (e.g. `feature/nestjs-migration`), big-bang migration of the whole server, merged into `main` via PR once parity is verified end-to-end. Not a strangler-fig/incremental-proxy approach — the team wants a coherent final DI structure rather than a transitional hybrid state.
