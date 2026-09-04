# Architecture

Back to [[index]]. See also [[overview]] and the deeper human guide in [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md).

## Folder structure

```text
digital-e-shop/
  client/                 React 19 + Vite storefront and admin UI
    src/
      api/                Thin exports into the shared HTTP client layer
      app/                App bootstrap and providers
      assets/             Static images
      components/         common/ and layout/ shared components (incl. admin/)
      context/            Auth, cart, toast, shared client state
      features/           Domain modules: admin, auth, orders, products, users
      lib/                HTTP/env helpers and shared infrastructure
      pages/              Route-level pages not owned by a feature
      routes/             Router and lazy route wiring
      services/           External integrations (e.g. Firebase)
      utils/              Formatting and helpers
  server/                 NestJS API (migrated from Express 5, see [[0002-nestjs-migration]])
    api/                  Serverless/Vercel entrypoint (exports the Nest bootstrap)
    src/
      <feature>/          One folder per feature: addresses, analytics, auth, blob,
                          cart, health, inventory, notifications, orders, products,
                          promotions, reviews, stripe, users, wishlist — each holds
                          its own controller/service/repository/dto/validator/types
                          + __tests__/
      guards/             AuthGuard, RolesGuard (@OwnerParam/@Roles)
      pipes/              ZodValidationPipe
      filters/            AllExceptionsFilter
      interceptors/       RequestLoggerInterceptor
      middleware/         csrf.middleware, rate-limit.middleware, request-id.middleware
      config/             Typed env, CORS, database config, NestConfigModule/Service
      core/               Base classes, app errors (legacy helpers, still referenced)
      database/           Prisma client/schema, migrations, seeders
      shared/             Shared constants, interfaces, HTTP response helpers, validation helpers, utilities
      utils/              Narrow backend utilities
      app.module.ts        Nest root module — imports every feature module
      main.ts              Nest bootstrap (cached app instance for serverless)
      server.ts            Local process entrypoint, calls main.ts's bootstrap
    test/                 Read-only k6 scripts
  docs/                   Human guides + bmad/ + ai-prompts/
  Wiki/                   This knowledge base
```

## Boundaries

### Frontend
- Domain-owned screens live in `client/src/features/<domain>/pages`; generic site pages in `client/src/pages`.
- Feature API wrappers in `client/src/features/<domain>/api.ts`; authenticated calls go through `client/src/lib/http.ts` — never hard-code backend URLs in components.
- Functional components only; explicit loading/empty/error/success states; BEM-structured SCSS; responsive across storefront, account, and admin.

### Backend
- **NestJS end-state** (migrated from Express 5, see [docs/superpowers/specs/2026-07-08-nestjs-migration-design.md](../docs/superpowers/specs/2026-07-08-nestjs-migration-design.md) and [[0002-nestjs-migration]]): each feature is a Nest module (`@Module`) with a `@Controller`, one or more `@Injectable()` services, and `@Injectable()` repositories owning raw MySQL access — no more `require()`-wrapped Express layer. `server/src/app.module.ts` imports all 15 feature/infra modules; `server/src/main.ts` bootstraps a cached Nest instance (module-level singleton) for both local dev (`server.ts`) and the Vercel serverless entrypoint (`api/index.ts`). `bootstrap()` **must call `app.init()`** before returning — Nest only binds `@Controller` routes onto the underlying Express instance during its init lifecycle; skipping it (as the migration initially did) left every Nest route 404ing while manually-added Express routes kept working.
- **Dev runtime must compile with real `tsc`, not `tsx`/esbuild.** `tsx` (esbuild) does not implement TypeScript's `emitDecoratorMetadata`, which NestJS's DI container reads (`Reflect.getMetadata('design:paramtypes', ...)`) to resolve constructor-injected providers. Running the app through `tsx` silently injects `undefined` for every constructor-injected service/repository/guard (verified via `Reflect.getMetadata` returning `undefined` under `tsx` vs. a populated array under `tsc`) — requests reach the controller/guard but crash with `TypeError: Cannot read properties of undefined`. `server/package.json`'s `dev` script now runs `tsc --watch` (via `tsconfig.build.json`) piped to `node --watch` over the compiled `dist/` output (same compiler `build`/`start` already use), rather than `tsx` directly on `.ts` sources.
- Controllers stay thin (parse/format, throw `HttpException` with `{ msg }` bodies matching the old Express shapes). Services own cross-table orchestration (checkout, inventory, timeline, notifications). Repositories own SQL/persistence.
- HTTP responses now receive shared `success`/`requestId` metadata while retaining route-specific top-level fields and legacy `msg`/string `error` compatibility. `AllExceptionsFilter` and the legacy error handler emit the same error envelope with `success: false`, `code`, `error`, `msg`, optional `details`, and `requestId`.
- Every request receives a validated or generated `X-Request-Id`. The Nest request interceptor and legacy request logger include that ID, method, URL, status, and duration in structured Pino access logs; exception logs include the same correlation ID.
- `AuthGuard`/`RolesGuard` (with `@OwnerParam`/`@Roles`) replace the old `requireAuth`/`requireAdmin`/`requireOwnerOrAdmin` Express middleware with equivalent semantics, applied via `@UseGuards(...)`. `AuthGuard` depends on `NestAuthService` and `UsersRepository`, both exported globally via `@Global()` on `AuthModule`/`UsersModule` (same pattern as `NestConfigModule`) so any feature module can use the guard without explicitly importing auth.
- `@Roles` and `@OwnerParam` use Nest `SetMetadata`, so method-level metadata is attached to the handler object consumed by `RolesGuard`; `server/src/guards/authorization-regressions.spec.ts` protects the admin-only route contract.
- Validation via Zod in feature validators, applied through a custom `ZodValidationPipe`; shared request/domain types in `server/src/shared/interfaces`.
- CSRF (`csrf-csrf` double-submit-cookie) is Nest middleware (`middleware/csrf.middleware.ts`) applied globally via `MiddlewareConsumer.forRoutes("*")` with the same login/register/refresh exclusions as before. Stripe webhook signature verification reads `req.rawBody` (populated by the `rawBody: true` bootstrap option), not `req.body` — Nest's global body parser always runs first and would otherwise have already parsed the payload to JSON.
- Route aliases (`/api/user` + `/api/users`) implemented via Nest array-path controllers (`@Controller(['users', 'user'])`); note there is no *bare* (`/users` without `/api`) mount — the client only ever calls `/api/*`.
- **Global `/api` prefix**: `main.ts` calls `app.setGlobalPrefix("api")` before `app.init()`. All feature controllers use bare paths (`@Controller("products")`, `@Controller("cart")`, etc.) and rely on the global prefix to become `/api/products`, `/api/cart`, etc. — matching every client call in `client/src/**/api.ts`. The 3 controllers that need a fixed external path independent of the prefix convention (`HealthController`, `NestAuthController`, `StripeWebhookController`) must NOT hardcode `api/` themselves, or the prefix doubles to `/api/api/...`; `CsrfExclude` paths in `AuthModule`'s `MiddlewareConsumer.exclude(...)` are matched *after* the global prefix is applied, so they're written without the `api/` segment too. **When migrating/adding a controller, never hardcode `api/` in `@Controller(...)` — the global prefix supplies it.** (Migration bug found 2026-07-08: only 3 of 15 controllers had gained the `api/` prefix during the Nest migration; the other 12 — including `products`, `cart`, `orders`, `wishlist` — had no `/api` mount at all, so every client request 404'd until `setGlobalPrefix` was added.)
- **Known gap**: Google OAuth (`/auth/google`, `/auth/google/callback`) is not migrated — `@nestjs/passport` isn't installed. See the migration spec's "Known gaps" section.
- The admin inventory-movements route is covered by an authorization regression and currently matches the client contract at `GET /api/products/admin/inventory-movements`; older notes that described a `/api/inventory-movements` mismatch are stale.

### Database
- Primary access through `server/src/<feature>/<feature>.repository.ts` (MySQL, `@Injectable()` Nest providers). Prisma schema at `server/src/database/prisma/schema.prisma` is partially adopted. See [[0001-mysql-primary-prisma-partial]].
- **Prisma 7**: uses the rust-free `prisma-client` generator (`moduleFormat = "cjs"`, `runtime = "nodejs"`) emitting to `server/src/generated/prisma` (gitignored, rebuilt on install/build). The datasource URL lives in `server/prisma.config.ts` — not the schema — and the runtime connects via the `@prisma/adapter-mariadb` driver adapter (MySQL-compatible) constructed in `server/src/database/prisma/client.ts`.
- **DB connection is env-driven** (`DB_HOST/PORT/USER/PASSWORD/NAME` in `server/src/config/database.config.ts`). Managed MySQL (Aiven) requires TLS: set `DB_SSL=true` to load the CA at `server/src/database/ca.pem` (override via `DB_SSL_CA_PATH`) and connect over verified SSL; leave `DB_SSL` unset for plaintext local/Docker. Docker is test-only, driven by its own env and the `docker:*` scripts.
- SQL baseline dump under `server/src/database/migrations/`. Some tables (inventory movement, notifications, address book, order timeline) are created defensively on first use.
- Keep table/column names aligned with the existing dump/schema. Prefer additive, reviewable changes; update all affected layers (repository, service, validator, types, Prisma) together.
- **Build assets**: non-`.ts` runtime files (`docs/openapi.json`, `database/ca.pem`) are not emitted by `tsc`; `server/scripts/copy-assets.mjs` (wired into `build`/`vercel-build`) copies them into `dist/` so `pnpm start` resolves them.

### CI/CD

- `.github/workflows/ci.yml` keeps client and server checks separate. The
  server job starts disposable MySQL 8.4, loads the checked-in legacy dump and
  pre-Prisma Stripe SQL, records the metadata-only `0_init` baseline, runs
  `prisma migrate deploy` and `status`, then runs the database integration
  suite before building.
- GitHub repository default setup owns CodeQL JavaScript/TypeScript analysis.
  `.github/workflows/security.yml` separately runs pinned pull-request
  dependency review; duplicating an advanced CodeQL upload would conflict with
  the repository-level default setup. All workflow actions are pinned to
  reviewed commit SHAs; Dependabot remains responsible for refreshes.
- Local development uses the isolated Docker MySQL database
  `digital_e_shop_local` on `127.0.0.1:3307` and the dedicated
  `digital_e_shop_local_mysql_data` volume. Runtime, Prisma, and mock-seed
  entrypoints reject remote targets outside production; production credentials
  are injected by the deployment environment.
- The server project's `server/vercel.json` pins Vercel's install step to the workspace
  package manager with `corepack pnpm@11.5.3 install --frozen-lockfile`. This is
  required because the older `digital-e-server` project otherwise infers pnpm 9
  from lockfile version `9.0` and rejects the workspace override configuration.
- The root `package.json` also mirrors the security overrides in its legacy
  `pnpm` field for Vercel's native serverless API builder, which may perform a
  second pnpm 9 install. pnpm 11 ignores that field; `pnpm-workspace.yaml` is
  still canonical, and both phases resolve the same pinned versions.
- Prisma's schema-only `generate` command is allowed during dependency
  installation because it does not connect to a database; migration and other
  database-connecting commands remain subject to the target guard.
- Production Vercel deployment and branch protection are external controls.
  They must require the CI/security checks for `main`, and production releases
  must run frontend and backend smoke checks after deployment. See
  [docs/ci-cd.md](../docs/ci-cd.md).

## Important observations

- Auth is cookie-based JWT (access + refresh) with CSRF protection on unsafe requests; login/register/refresh are intentionally excluded from CSRF — do not broaden.
- The backend mixes feature-based architecture with some compatibility-era wrapper patterns.
- Logging is Pino-based on the server with request correlation IDs; avoid noisy hot-path logs and never log secrets/PII.

## Risks / unknowns

- Route payloads remain feature-specific, but shared success/error metadata is standardized; callers still consume the legacy top-level fields for compatibility.
- Root lockfile coexists with nested `client/`/`server/` lockfiles, which can drift.
- Prisma migration history is now committed, but it intentionally starts with
  a metadata-only `0_init` marker because the schema is still partial. The
  reproducible CI database therefore combines the legacy dump, the historical
  Stripe SQL change, and the tracked Prisma migrations.
- No committed `.env.example`; environment contract is inferred.
- Performance-sensitive paths to treat carefully: product listing/search/facets, cart validation/checkout, admin analytics, order history and notification reads.

> Update this page (and [[log]] + the date in [[index]]) whenever you change architecture, boundaries, the data model, or the CI/CD contract.
