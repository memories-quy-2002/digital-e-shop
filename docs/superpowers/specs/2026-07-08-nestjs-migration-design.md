# NestJS Migration — Design

Date: 2026-07-08
Status: Phases 1–7 complete, plus a Phase 8 structural collapse. All 13 feature modules migrated to NestJS, Express app removed, Vercel serverless entry point swapped to Nest bootstrap, and all business logic (services/repositories/DTOs/validators/types) physically moved out of the old `modules/*` tree into `server/src/*` directly — `server/src/nest/` and `server/src/modules/` no longer exist; Nest *is* the server source tree now, not a subfolder wrapping it.

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

### Step 0 Results (measured 2026-07-08)

Full data: [spike/nestjs-coldstart/RESULTS.md](../../../spike/nestjs-coldstart/RESULTS.md).

- Nest cold-proxy: 0.755s vs. Express baseline cold-proxy 0.702s (delta: +0.053s) — **both samples contaminated by prior verification requests in the same task run; not a genuine idle-then-cold measurement.**
- Nest warm request: 0.588s avg vs. Express baseline warm 0.398s avg (delta: +0.191s) — the more trustworthy signal from this run, though still a single small-sample comparison with network RTT variance included and no confidence interval.
- Bundle size: Nest spike `dist/` 13K vs. Express server `dist/` 721K — scope-mismatched (one-route spike vs. full production app), not a valid framework-overhead comparison.

**Recommendation:** Inconclusive from the data alone — the spike did not capture a genuine cold-start number (both "cold" samples were pre-warmed within the same task run), only a warm-request delta (~191ms slower for Nest). See full discussion above.

### Decision (2026-07-08)

User reviewed the inconclusive data and explicitly chose to proceed without re-measuring: accept the ~191ms warm-request penalty as a known, tolerable cost, and keep the current Vercel serverless deployment model (`@vercel/node` + cached Nest instance across invocations) for the full migration. A true idle-then-cold measurement was **not** performed — the actual cold-start cost remains unverified. This is a conscious risk acceptance, not a resolved unknown: if production cold-start latency turns out worse than the warm-request signal suggested, revisit the hosting model at that point rather than assuming the spike ruled it out.

This closes the Step 0 gate. The rest of this spec (Target architecture, Migration order) may now proceed on the assumption that serverless + cached Nest instance is the deployment target.

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
3. **Low-interdependency modules** (structural template for the rest): `wishlist`, `addresses`, `notifications`, `reviews`. — **Done** (2026-07-08): all four migrated under `server/src/nest/`, wired into `AppModule`, Vitest coverage added per module (38 passing tests total). Route aliases (`/api/users` + `/api/user`) implemented via Nest array-path `@Controller([...])`; not yet mounted in `app.ts`/served — cutover happens at Step 7.
4. **Core commerce modules**: `products`, `inventory`, `promotions` (inventory/promotions interact with products). — **Done** (2026-07-08): all three migrated under `server/src/nest/`, wired into `AppModule`. Products (11 routes, multer file upload via `FileInterceptor`, `StreamableFile` for static serve, admin guards), Inventory (1 route exposed, summary route remains in products), Promotions (4 endpoints, admin-only).
5. **Highest-risk modules, most scrutiny**: `cart`, `orders` (checkout, Stripe webhook, order timeline, multi-table coordination), `users` (auth-adjacent, ownership checks). — **Done** (2026-07-08): Cart (5 endpoints, `OwnerParam` auth, rate limit 100), Orders (9 endpoints, Stripe webhook via dedicated `StripeWebhookModule` with `express.raw()`, rate limit 100; `orders.stripeWebhook.controller.ts` NOT migrated to Nest due to `express.raw()` incompatibility — remains in Express), Users (5 endpoints, dual path `@Controller(['users', 'user'])`, rate limit 100).
6. **`analytics`, `blob`** — lower risk, scheduled wherever convenient. — **Done** (2026-07-08): Analytics (1 admin endpoint, rate limit 100), Blob (2 endpoints, multer via `FileInterceptor`, rate limit 50).
7. **Cutover**: swap `server/api/index.ts` to the Nest bootstrap; remove old Express `app.ts` and route files. — **Done** (2026-07-08): `api/index.ts` now exports Nest bootstrap with `rawBody: true` for Stripe webhook support. `server/src/server.ts` updated to use Nest bootstrap for local dev. `server/src/app.ts` and all 12 Express `*.routes.ts` files deleted. Stripe webhook migrated as Nest `StripeWebhookController` with `express.raw()` route-level middleware (`StripeWebhookModule`). CSRF middleware ported as Nest middleware (`csrf.middleware.ts`) with same exclusions. Google OAuth routes (`/auth/google`, `/auth/google/callback`) **not migrated** — `@nestjs/passport` is not installed; this is a known gap requiring a follow-up Nest Passport integration task if Google OAuth is needed. All other routes handled by Nest controllers. OpenAPI JSON and Scalar docs registered on the Express adapter in `main.ts`.
8. **Structural collapse** (not in the original plan; done at explicit user request after Step 7): the Nest wrapper classes built in Steps 3–7 still `require()`d their real logic from the old `server/src/modules/<feature>/*.service.ts` / `*.repository.ts` files — the Express layer was gone, but the business logic and raw MySQL queries had never actually moved. This step physically moved all of it: every `<feature>.service.ts`, `.repository.ts`, `.dto.ts`, `.validator.ts`, `.types.ts` now lives in `server/src/<feature>/`, and every Nest service/repository owns real constructor-injected logic instead of delegating to a `require()`'d singleton. `AuthGuard`/`RolesGuard` now depend on real DI-provided `NestAuthService`/`UsersRepository` (exposed globally via `@Global()` on `AuthModule`/`UsersModule`, mirroring the existing `NestConfigModule` pattern) instead of module-level singleton imports. Once `modules/` was empty, `server/src/nest/*` was flattened up to be `server/src/*` directly (`server/src/nest/app.module.ts` → `server/src/app.module.ts`, `server/src/nest/wishlist/` → `server/src/wishlist/`, etc.), and `server/api/index.ts`/`server/src/server.ts` repointed from `#src/nest/main` to `#src/main`. `server/src/nest/` and `server/src/modules/` no longer exist. Verified clean after the move: `typecheck`, `build`, `lint`, and the full Vitest suite (71/71 passing across 17 files).

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

## Known gaps (post-migration)

- **Google OAuth** — Passport Google OAuth routes (`GET /auth/google`, `GET /auth/google/callback`) are not served by any Nest controller. `@nestjs/passport` is not installed. To restore Google OAuth login, install `@nestjs/passport` and `@nestjs/passport-google-oauth20`, then create a `PassportModule` with the Google strategy ported from `auth.passport.ts`.
- **Local dev** — `server/src/server.ts` now uses Nest bootstrap. Run `pnpm --filter server dev` (uses `server/src/main.ts`).
