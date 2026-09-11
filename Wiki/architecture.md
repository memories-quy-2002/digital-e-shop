# Architecture

Back to [[index]]. See also [[overview]] and the human guide in
[docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md).

## Repository layout

```text
digital-e-shop/
  client/                 React/Vite storefront and admin application
    src/
      app/                Bootstrap and providers
      components/         Shared common and layout UI
      context/            Auth, cart, toast, and shared client state
      features/           admin, auth, orders, products, support, users
      lib/                HTTP client and environment helpers
      pages/              Generic route-level pages
      routes/             Router and lazy route wiring
      services/           External client integrations such as Firebase
      styles/             Shared and feature SCSS
      types/              Shared client types
      utils/              Formatting and image helpers
  server/                 NestJS API on the Express adapter
    api/                  Vercel/serverless entrypoint shim
    src/
      <feature>/          Feature modules with controller/service/repository code
      guards/             AuthGuard, RolesGuard, OwnerParam metadata
      pipes/              ZodValidationPipe
      filters/             AllExceptionsFilter
      interceptors/        Request correlation and access logging
      middleware/          CSRF, rate-limit, and request-id middleware
      config/              Typed environment, CORS, and database configuration
      database/            Prisma schema/client, migrations, and seeders
      payments/            Provider boundary and payment ledger types
      shared/              Shared constants, interfaces, and utilities
      app.module.ts        Nest composition root
      main.ts              Cached Nest bootstrap
      server.ts            Local process bootstrap
    test/                  Read-only k6 scripts
  docs/                    Human guides, process templates, and prompts
  Wiki/                    Current project knowledge and decisions
```

`client/` and `server/` are independent pnpm package roots. The repository
root has no package manifest, workspace file, lockfile, or supported root
install command. Each package owns its dependencies and lockfile.

## Frontend boundaries

- Domain-owned screens and API wrappers live in
  `client/src/features/<domain>/`.
- Generic site pages live in `client/src/pages/`.
- Authenticated requests go through `client/src/lib/http.ts`; components do
  not hard-code API origins.
- `client/src/app/` owns providers and bootstrap. Contexts own auth, cart, and
  toast state. Shared UI belongs in `components/common` or `components/layout`.
- Responsive storefront, account, checkout, and admin behavior is implemented
  with Tailwind/Radix UI primitives plus the existing BEM-style SCSS.
- Explicit loading, empty, error, and success states are part of each route's
  contract.

## Backend boundaries

`server/src/main.ts` creates the Nest application with the Express adapter,
sets the global `api` prefix, enables raw-body support for Stripe signatures,
registers CORS/cookies/middleware, and calls `app.init()` before returning the
cached instance. `server/src/server.ts` starts the local process; `server/api/`
reuses the same bootstrap for serverless deployment.

Each feature folder follows Nest dependency injection:

```text
controller -> service -> repository -> MySQL
     |             |
  DTO/validator  cross-table business rules
```

Controllers parse requests and preserve route-local response shapes. Services
coordinate checkout, inventory, order timeline, notifications, payments, and
other multi-table operations. Repositories own SQL and persistence details.
Shared concerns are kept in guards, pipes, filters, interceptors, middleware,
config, database, payments, and shared utilities instead of being duplicated
inside controllers.

The global `/api` prefix means feature controllers use paths such as
`@Controller("products")`, which become `/api/products`. Do not put `api/` in
controller decorators. Auth and user controllers intentionally expose the
documented singular/plural aliases where the client contract requires them.

## HTTP contracts and security boundaries

- Successful responses retain feature-specific keys such as `products`,
  `orders`, `order`, `userData`, `notifications`, and `pagination`.
- The shared response layer adds success/request metadata while preserving
  legacy `msg` and `error` compatibility. Exceptions include a correlation
  request ID.
- `AuthGuard` validates the access-token cookie, active database session, and
  current user state. `RolesGuard` enforces role metadata and `OwnerParam`
  enforces resource ownership.
- CSRF uses a double-submit cookie for unsafe requests. Login, registration,
  and refresh are explicit exclusions because they bootstrap authentication;
  this exception must not be broadened.
- Zod schemas run through `ZodValidationPipe` before write-path business logic.
- Request IDs are generated or validated for every request and included in
  structured access/error logging. Secrets, cookies, tokens, and personal data
  must not be logged.
- Guest checkout retains CSRF, validation, rate limiting, server-side price and
  stock revalidation, and transactional reservation rules. The raw guest token
  is returned once, kept in active browser session storage, and stored in the
  database only as a SHA-256 hash. See [[guest-checkout]] and
  [[0004-guest-cart-and-checkout]].
- Firebase-only signup converges on the server-owned cookie session. Firebase owns verification delivery and action-code handling; the server synchronizes the verified Firebase claim before the VerifiedEmailGuard boundary around checkout and review writes. See [[authentication-and-email-verification]].
- Local Firebase testing is isolated at both SDK boundaries: the Vite client
  connects to `http://127.0.0.1:9099` only when the explicit emulator profile is
  selected, and Firebase Admin uses `127.0.0.1:9099` without loading a service
  account. `firebase.json` owns Auth port `9099` and Emulator UI port `4001`;
  the guarded seeder never targets the production project.
- Account security is Firebase-owned in every environment: Firebase sends verification, password-reset, and email-change action links. The server has no MySQL password-authentication or server-owned reset/email-change token flow.
- Customer order state changes create database-backed in-app notifications. No external order-email provider is configured, so order success is independent of email delivery.
- Marketing subscription and unsubscribe runtime routes were removed. The historical table and migration remain only for database compatibility.

## Data and migration boundaries

MySQL through feature repositories is the dominant runtime persistence layer.
Prisma 7 is intentionally partial: its schema and generated client support
selected repository access and the forward migration history, but the whole
application has not been converted to Prisma.

- Legacy SQL baseline files are under `server/src/database/migrations/`.
- Forward schema ownership is represented by committed Prisma migrations under
  `server/src/database/prisma/migrations/`.
- The `0_init` migration records the existing baseline; it is metadata-only in
  the reproducible CI/local bootstrap because the legacy SQL dump creates the
  tables first.
- New schema changes must update raw SQL/repositories and any touched Prisma
  schema, services, validators, types, and migration in one reviewable change.
- Order items snapshot product identity, price, warranty, image, brand,
  category, and typed attributes so historical orders remain stable.
- Checkout, inventory reservations/movements, order timeline, addresses,
  notifications, sessions, and promotion redemption writes are transactionally
  coordinated. Never validate a schema change only against an empty database.

## Checkout, payment, and operations

- Guest carts are browser-local; preview and checkout are authoritative for
  current catalog data, stock, promotions, and totals.
- Authenticated and guest orders share the order lifecycle: Pending, Done, and
  Canceled. Pending cancellation restores inventory once and records timeline,
  movement, and notification side effects.
- VND is the default catalog and new-order currency for the Vietnam-first
  rollout. The payment ledger stores base/provider amount and currency, FX
  snapshot, idempotency information, and refund state. PayOS receives VND
  amounts unchanged; explicit USD-backed catalogs may still use the configured
  USD-to-VND rate. Local mock provider modes do not call external APIs.
- Customer reviews require a completed order containing the reviewed product.
  Support tickets are database-backed and ownership-scoped. Admin analytics
  and operational alerts query bounded operational data rather than rebuilding
  alerts from broad datasets.
- Customer order confirmation email is currently disabled. Authenticated order
  state changes create in-app notifications after the checkout transaction or
  payment reservation finalization commits; guests use checkout success and
  protected lookup. A future email provider must remain a non-transactional
  post-commit side effect and must never receive the raw guest access token.

## CI/CD and runtime

- Client and server CI jobs install with frozen package-local lockfiles and run
  typecheck, lint, test, and build checks.
- The server CI job starts disposable MySQL, loads the legacy dump and
  historical compatibility SQL, records the `0_init` baseline, deploys/checks
  Prisma migrations, and runs the opt-in integration suite.
- Security workflow coverage includes dependency review; CodeQL is owned by
  GitHub repository default setup. Workflow actions are pinned to reviewed
  commit SHAs.
- Vercel deployment builds each package from its own root. Production database
  migration and manual demo reset are protected workflows with environment
  approval and backup requirements.
- Local Docker uses `digital_e_shop_local` on `127.0.0.1:3307`; runtime,
  Prisma, and demo-seed guards reject remote targets by default.

## Risks and unknowns

- Route payloads are not globally uniform; changing a response key can break
  both the client and API consumers.
- Prisma and raw MySQL must remain aligned while Prisma adoption is partial.
- Shared multi-instance rate limiting requires `REDIS_URL`; otherwise the
  process-local fallback is not a cross-instance security boundary.
- Production Firebase, Stripe, Blob, database, CORS, and Redis settings are
  deployment concerns and must come from environment secrets.
- Product listing/search/facets, cart validation/checkout, analytics, order
  history, and notification reads are performance-sensitive paths.

> Update this page, [[overview]], [[log]], and the date in [[index]] whenever
> architecture, boundaries, the data model, or the CI/CD contract changes.
