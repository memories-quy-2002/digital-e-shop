# Architecture

Digital-E is a full-stack commerce system split into an independent React client and an independent NestJS server. The server uses the Express adapter, MySQL remains the primary runtime database, and Prisma owns only the forward-migration and partial model layer.

## Repository layout

```text
digital-e-shop/
  client/                 React 19, Vite 8, TypeScript, Tailwind, Radix UI, SCSS
    src/
      app/                Bootstrap and providers
      components/         Shared layout and UI components
      context/            Auth, cart, toast, and shared state
      features/           Admin, auth, orders, products, support, and users
      lib/                HTTP client, environment, and shared utilities
      pages/              Generic route-level pages
      routes/             React Router definitions and lazy route wiring
      styles/             Tailwind entrypoint and SCSS feature styles
  server/                 NestJS API on Express
    api/                  Vercel function entrypoint
    src/
      <feature>/          Module, controller, service, repository, DTO, validator
      config/             Environment, database, CORS, and payment configuration
      core/               Shared response, error, and middleware infrastructure
      database/           Legacy SQL, Prisma schema, migrations, and seeders
      guards/             Authentication, role, and ownership guards
      middleware/         CSRF, rate limiting, request IDs, and request logging
      shared/             Cross-feature types, helpers, and Redis limiter
  docs/                   Maintained guides and historical plans/specs
  Wiki/                   Durable project knowledge
```

The repository root has no package manifest, root workspace, or root lockfile. Install dependencies and run scripts from `client/` or `server/` through `pnpm --dir`.

## Frontend boundaries

The client starts at `client/src/main.tsx`, mounts providers from `client/src/app/providers.tsx`, and resolves pages through `client/src/routes/router.tsx`. Feature-owned pages, API wrappers, types, and tests live under `client/src/features/<domain>/`. Generic pages remain under `client/src/pages/`.

Use `client/src/lib/http.ts` for API requests. It owns the configured API base URL, credentials, CSRF token handling, and response interception. Reuse feature API modules instead of hard-coding URLs in pages. Contexts own cross-route state such as authentication, cart source, and transient Toasts.

The UI uses Tailwind CSS with Radix-based project primitives and existing SCSS feature styles. Keep storefront, checkout, account, and admin states explicit for loading, empty, error, success, keyboard focus, and narrow viewports.

## Backend boundaries

`server/src/main.ts` creates and initializes the Nest application, sets the global `api` prefix, configures CORS and cookies, registers request IDs, exposes OpenAPI and Scalar documentation, and returns the cached application for local and Vercel entrypoints. `server/src/app.module.ts` imports the feature modules.

Each feature follows the current Nest structure:

```text
HTTP request
  -> Nest controller
  -> guards and Zod validation pipes
  -> service
  -> repository
  -> MySQL or the partial Prisma layer
  -> route-local response
```

Controllers parse input and format the established response shape. Services coordinate cross-table behavior such as checkout, reservations, payment finalization, order timelines, notifications, and support tickets. Repositories own parameterized SQL, transactions, and schema-specific persistence. Do not create tables, alter schema, or probe information schema from runtime repositories.

## Data and migration boundaries

MySQL tables remain the dominant runtime persistence surface. Prisma models only part of the database, and the metadata-only `0_init` migration records the existing legacy baseline rather than creating the complete schema. New deployable schema changes belong in `server/src/database/prisma/migrations/` and run through `prisma migrate deploy`.

The legacy SQL files under `server/src/database/migrations/` are bootstrap history. CI and local Docker setup load that baseline before recording `0_init`, applying forward Prisma migrations, and running the demo seed. Never treat `prisma migrate reset` as a safe operation for a data-bearing database.

Important domain boundaries include:

- Product identity uses SKU and optional manufacturer part number, with typed attributes for structured filters
- Checkout reserves inventory before payment completion and consumes a reservation once during finalization
- Order items retain product and pricing snapshots so catalog edits do not rewrite order history
- Inventory movements and order timeline events are written with the owning business transaction
- Notifications are emitted after commit
- New orders use the configured store currency (VND by default for the
  Vietnam-first rollout); provider settlement values and the FX snapshot remain
  in the payment ledger. Historical orders retain their stored currency.
- Guest carts store product IDs and quantities on the client, while preview and checkout recalculate prices, stock, discounts, and totals on the server

## Authentication and authorization

Authentication is Firebase-only in every environment. The server verifies Firebase ID tokens before issuing its cookie-backed JWT session. Refresh sessions are stored as hashes, rotated, and checked against the active database user.

`AuthGuard` validates the access token, session identifier, active session, and current user status. `RolesGuard` enforces roles, while `OwnerParam` allows an owner or an admin to access an identity-scoped resource. Zod validation runs before write services. Unsafe methods use the double-submit CSRF middleware; login, registration, and refresh retain their explicit exclusions.

The client signs users in and manages verification, password-reset, and email-change action links through Firebase. The server verifies the Firebase Admin SDK ID token before registration/login, then issues the server cookie session. On the next Firebase login, the server reads the verified ID-token claim and synchronizes `email_verified_at`. Public user responses expose only the derived `email_verified` boolean. `VerifiedEmailGuard` reloads the live user row and protects authenticated checkout, Stripe checkout-session creation, and review creation without changing the broad `AuthGuard` session policy.

Password reset and email change are client-side Firebase flows. The server does not create or consume MySQL password-reset or email-change tokens. After a verified Firebase email change, the next Firebase login synchronizes the email by UID. Marketing subscription and unsubscribe runtime services/routes have been removed.

The legacy verification columns are additive and nullable so existing active accounts remain compatible with the migration history. Firebase owns verification state in every environment; the old token/hash/expiry columns are no longer used to issue or consume links. Existing rows with an undefined verification timestamp remain grandfathered by the public-user compatibility rule.

Password-reset and email-change fields are additive and nullable for database compatibility. The historical migration also contains the `marketing_subscriptions` table for compatibility with existing databases, but no current runtime module or route uses it. The current runtime does not create or consume new email-delivery tokens.

Guest order access uses a raw token only at creation and lookup. The database stores a SHA-256 hash, and a lookup requires both the order or checkout identifier and the raw token. Admin responses never expose guest token material.

## Runtime and deployment

The client and server deploy independently to Vercel. `client/vercel.json` serves the single-page application through the Vite build output. `server/vercel.json` installs from the server package root, builds the compiled Nest application, and rewrites requests to `server/api/index.ts`.

Local server startup runs Prisma generation and `prisma migrate deploy` before compilation and the watcher. CI validates both packages, loads a disposable MySQL baseline, runs unit and integration suites, exercises the demo reset on disposable data, builds the Vercel server entrypoint, and checks the client preview and `/api/health`.
