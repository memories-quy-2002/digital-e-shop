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
      payments/           Provider boundary, USD/VND quote rules, and payment ledger types
      support/            Customer-owned and admin-managed support ticket workflow
      admin-alerts/       Bounded database-backed operational alert queries
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

`client/` and `server/` are independent pnpm package roots. Each owns its
`package.json`, lockfile, package-local pnpm policy, and `node_modules`; the
repository root is a non-package container with no package manifest, workspace
file, lockfile, or installed dependencies. There is no supported root install,
filter, start, or dev command. The E2E/Playwright project was removed, so CI
now validates only the two application packages and server-side integration
tests.

The shared runtime is pinned to Node.js `24.20.0` in `.node-version` and pnpm
`12.3.4` in both package manifests and CI setup. Production client builds
require `VITE_API_BASE_URL`; production CORS derives from the configured client
origin and does not add localhost by default. CI uses HTTP smoke checks for the
client preview and `/api/health` instead of browser E2E.

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
- Google OAuth was intentionally removed because it was not part of the current NestJS runtime. Authentication uses local development login or Firebase ID-token verification in production.
- The admin inventory-movements route is covered by an authorization regression and currently matches the client contract at `GET /api/products/admin/inventory-movements`; older notes that described a `/api/inventory-movements` mismatch are stale.

### Database
- Primary access through `server/src/<feature>/<feature>.repository.ts` (MySQL, `@Injectable()` Nest providers). Prisma schema at `server/src/database/prisma/schema.prisma` is partially adopted. See [[0001-mysql-primary-prisma-partial]].
- **Prisma 7**: uses the rust-free `prisma-client` generator (`moduleFormat = "cjs"`, `runtime = "nodejs"`) emitting to `server/src/generated/prisma` (gitignored, rebuilt on install/build). The datasource URL lives in `server/prisma.config.ts` — not the schema — and the runtime connects via the `@prisma/adapter-mariadb` driver adapter (MySQL-compatible) constructed in `server/src/database/prisma/client.ts`.
- **DB connection is env-driven** (`DB_HOST/PORT/USER/PASSWORD/NAME` in `server/src/config/database.config.ts`). Managed MySQL (Aiven) requires TLS: set `DB_SSL=true` to load the CA at `server/src/database/ca.pem` (override via `DB_SSL_CA_PATH`) and connect over verified SSL; leave `DB_SSL` unset for plaintext local/Docker. Docker is test-only, driven by its own env and the `docker:*` scripts.
- SQL baseline dump under `server/src/database/migrations/`; new schema ownership is explicit in forward Prisma migrations under `server/src/database/prisma/migrations/`. Runtime repositories never create tables, alter schema, or discover columns. Inventory movements, order status events, sessions, reservations, product attributes, addresses, and notifications must exist before the corresponding feature is used.
- Product identity is SKU/MPN-based. Typed text/number product attributes are stored separately, validated at the product boundary, and copied into order-item snapshots together with product, pricing, warranty, image, brand, and category data so order history remains immutable.
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
- The server project's `server/vercel.json` installs and builds from the server
  package root using `server/pnpm-lock.yaml`; its package-local pnpm policy owns
  approved build scripts and dependency overrides.
- `server/package.json` runs Prisma Client generation followed by
  `prisma migrate deploy` from both `predev` and `prestart`. Startup therefore
  stops before opening localhost if generation or a checked-in migration fails.
- Prisma's schema-only `generate` command is allowed during dependency
  installation because it does not connect to a database; migration and other
  database-connecting commands remain subject to the target guard.
- Production Vercel deployment and branch protection are external controls.
  They must require the CI/security checks for `main`, and production releases
  must run frontend and backend smoke checks after deployment. See
  [docs/ci-cd.md](../docs/ci-cd.md).

## Important observations

- Auth is provider-bound by environment: non-production defaults to local MySQL email/password login against the stored bcrypt hash, while production always uses server-verified Firebase ID tokens. Both paths issue the same cookie-based JWT session (access + refresh); public registration remains Firebase-backed. Refresh reloads the current active database user before signing a new access token, and a non-remembered login clears any stale refresh cookie. CSRF protection remains on unsafe requests, while login/register/refresh are intentionally excluded — do not broaden.
- Refresh sessions are database-backed, hashed, rotating, and revocable. Access tokens carry the session identifier and are accepted only while the session and user remain active; logout, expiry, revocation, or suspension blocks renewal.
- Checkout reserves inventory before payment completion. Stripe finalization consumes a reservation once, is protected by the unique Checkout Session constraint, and promotion redemption quotas are updated transactionally.
- Orders retain USD as the canonical amount. `order_payments` stores provider settlement currency, amount, FX snapshot, idempotency key, and refund state; PayOS quotes are integer VND values derived from the stored USD base amount. Local symbolic provider mode does not call external payment APIs.
- Pending cancellation is a guarded transition. It locks the order, refunds a paid Stripe payment through the provider boundary before finalization, restores inventory once using `inventory_restored_at`, and emits the cancellation timeline/notification after commit. Done and Canceled orders are terminal.
- Reviews use the same `orders.status = 1` completed-purchase predicate for write eligibility and public verified-purchase badges. Support tickets are persisted and ownership-scoped rather than represented by a client-only toast.
- Promotion performance and admin alerts are queried from operational tables; the admin client consumes bounded alert responses instead of reconstructing alerts from broad datasets.
- Inventory stock changes, inventory movements, order timeline/audit events, and product attribute writes are transaction-owned. Notifications are emitted after commit so failed transactions do not publish success side effects.
- Sensitive route rate limits use an atomic Redis fixed-window store when `NODE_ENV=production` and `REDIS_URL` is configured. Local development and production without Redis use the existing process-local memory store; multi-instance production deployments should provide `REDIS_URL` for shared enforcement.
- The backend mixes feature-based architecture with some compatibility-era wrapper patterns.
- Logging is Pino-based on the server with request correlation IDs; avoid noisy hot-path logs and never log secrets/PII.

## Risks / unknowns

- Route payloads remain feature-specific, but shared success/error metadata is standardized; callers still consume the legacy top-level fields for compatibility.
- Client and server have independent lockfiles; dependency updates must be
  performed from the owning package directory.
- Prisma migration history is now committed, but it intentionally starts with
  a metadata-only `0_init` marker because the schema is still partial. The
  reproducible CI database therefore combines the legacy dump, the historical
  Stripe SQL change, and the tracked Prisma migrations.
- `server/.env.example` documents the environment contract. Production must provide database, JWT/refresh, CSRF, Firebase Admin, URL, Stripe, and (for shared multi-instance rate limiting) `REDIS_URL` values through deployment secrets; no secret belongs in the repository.
- Performance-sensitive paths to treat carefully: product listing/search/facets, cart validation/checkout, admin analytics, order history and notification reads.

> Update this page (and [[log]] + the date in [[index]]) whenever you change architecture, boundaries, the data model, or the CI/CD contract.
