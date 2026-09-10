# Development guide

Use this guide to run Digital-E locally, understand package boundaries, and make changes that preserve current contracts.

## Runtime and package versions

- Node.js `24.20.0`, selected by `.node-version`
- pnpm `12.3.4`, declared by the client and server manifests
- Client package root: `client/`
- Server package root: `server/`

The repository root intentionally has no `package.json`, pnpm workspace, lockfile, or installed dependencies. Each package owns its own manifest, lockfile, workspace policy, scripts, and `node_modules` directory.

## Install dependencies

Run installs independently:

```powershell
pnpm --dir client install
pnpm --dir server install
```

Use `--frozen-lockfile` in CI or when you need to prove that the manifest and lockfile match.

## Configure local environment files

Copy the tracked templates:

```powershell
Copy-Item client/.env.example client/.env
Copy-Item server/.env.example server/.env
Copy-Item server/.env.docker.example server/.env.docker
```

For the normal local workflow, the client reads `client/.env` and the server
reads `server/.env`. Prisma CLI reads the same `server/.env`, so the application
and seed commands use one explicit database target. The loader also supports an
explicit `DIGITAL_E_ENV_FILE` or mode-specific overrides when a deployment needs
them.
Production validates database, JWT, refresh, CSRF, client-origin, and
server-origin variables before startup.

Customer, account-security, and marketing emails use Resend. Set
`RESEND_API_KEY` and a verified `RESEND_FROM_EMAIL` in `server/.env` for local
development. A blank
API key safely disables email delivery locally. Orders with a missing or invalid
server-side email are skipped without failing checkout. Authenticated order
confirmations, password-reset/security notices, email-change notices, and
marketing welcomes are skipped for unverified account addresses; verification
and email-change confirmation links remain deliverable so ownership can be
established. These messages remain non-blocking side effects after their
database state is committed. The
default `Digital-E <onboarding@resend.dev>` sender is for Resend testing only;
production must use a verified sender/domain. Raw reset, email-change,
unsubscribe, and guest-order access tokens are never logged; the guest access
token is intentionally not included in order email payloads.

Vietnam-first payments use PayOS payment links and whole-number VND catalog values. Keep `PAYOS_CLIENT_ID`,
`PAYOS_API_KEY`, and `PAYOS_CHECKSUM_KEY` server-side and set
`STORE_CURRENCY=VND` for the Vietnam-first default. Set
`PAYOS_USD_TO_VND_RATE` only when deliberately running an USD-backed catalog.
Use `PAYMENT_PROVIDER_MODE=mock` for the local PayOS simulator; it redirects to
`/mock-payos-checkout` and waits for an explicit simulated confirmation. Use
`live` only with real PayOS channel credentials and a configured
`/api/orders/webhooks/payos` URL. In live mode, only a verified webhook creates
the order; the browser return URL is not a payment confirmation. Run
`pnpm --dir server prisma:seed` after changing the demo seed so local products,
discount thresholds, and demo orders are materialized in VND. Stripe remains an
optional international rail and requires an intentional USD/catalog setup.

Authentication is provider-aware. Local development defaults to `AUTH_PROVIDER=local` and uses the server-stored bcrypt password hash. Set `AUTH_PROVIDER=firebase` to exercise the Firebase client/Admin path; production always resolves to Firebase. The client mirrors this with `VITE_AUTH_PROVIDER=firebase` when needed. New accounts can log in before verification, but authenticated checkout, Stripe checkout-session creation, and review creation remain blocked until the server-owned email link is confirmed. Verification links use `CLIENT_URL`, expire after 24 hours, and require the additive `email_verification_*` migration. Password reset and email change use the additive `20260910140000_account_security_and_marketing` migration. Resend delivery is optional locally; without an API key, account creation and marketing subscription still succeed and the account page can request delivery after configuration.

The client reads `VITE_API_BASE_URL`. Development uses `http://localhost:4000` when no override is supplied. Production builds require an explicit API base URL. Do not put `/api` in the client variable because request modules add that prefix.

## Prepare the local database

The supported local database is the Docker MySQL service at `127.0.0.1:3307` with database `digital_e_shop_local` and volume `digital_e_shop_local_mysql_data`.

Run the protected local setup:

```powershell
pnpm --dir server docker:setup
```

This command starts MySQL, imports the legacy SQL baseline and historical Stripe SQL, records the metadata-only Prisma `0_init` marker, deploys forward migrations, runs the deterministic demo seed, and verifies relational counts and orphan links.

Run individual operations when needed:

```powershell
pnpm --dir server docker:up
pnpm --dir server docker:import
pnpm --dir server docker:migrate
pnpm --dir server docker:seed
pnpm --dir server docker:verify
pnpm --dir server docker:down
```

`demo:reset` and the manual GitHub demo-reset workflow are destructive. Use them only with the documented confirmation and backup safeguards. Do not bypass database-target guards for a remote or production target.

## Run the applications

Use separate terminals:

```powershell
pnpm --dir server dev
pnpm --dir client dev
```

The server `predev` lifecycle generates Prisma Client and runs `prisma migrate deploy` before compiling. The client Vite cache lives in `client/.vite`. Production start and Vercel builds use the compiled server output and copied runtime assets.

Default local URLs:

- Client: `http://localhost:5173`
- Server: `http://localhost:4000`
- Health: `http://localhost:4000/api/health`
- Scalar API reference: `http://localhost:4000/docs`

## Frontend boundaries

- Put domain-owned pages, API calls, types, utilities, and tests under `client/src/features/<domain>/`
- Put generic route pages under `client/src/pages/`
- Reuse `client/src/lib/http.ts` for credentials, CSRF, base URLs, and request errors
- Reuse contexts for auth, cart, Toast, and shared state
- Keep loading, empty, error, success, responsive, and accessible states explicit
- Reuse Radix-based UI components and existing Tailwind or SCSS tokens before creating new primitives

## Backend boundaries

- Add a feature under `server/src/<feature>/` with a Nest module and feature-owned classes
- Keep controllers focused on request parsing and response formatting
- Put business rules and multi-table orchestration in services
- Keep parameterized SQL and Prisma access in repositories
- Validate writes with feature-local or shared Zod schemas
- Apply `AuthGuard`, `RolesGuard`, and `OwnerParam` before protected business logic
- Preserve route-local response shapes and compatibility aliases

## Database changes

MySQL remains the runtime source for most repositories. Prisma is partial and uses `server/src/database/prisma/migrations/` for new forward changes. The legacy files under `server/src/database/migrations/` are bootstrap history, not a second location for pending migrations.

Use these commands from the repository root:

```powershell
pnpm --dir server prisma:generate
pnpm --dir server prisma:validate
pnpm --dir server prisma:migrate
pnpm --dir server prisma:migrate:deploy
pnpm --dir server prisma:migrate:status
pnpm --dir server prisma:seed
```

Use `prisma:migrate` only for intentional local migration development. Use reviewed `prisma:migrate:deploy` for shared or production rollout after backup and target verification. Never use `prisma migrate reset` against a data-bearing database.

## Pull requests

Use small Conventional Commit changes. A pull request should explain behavior, changed files, schema or environment assumptions, verification results, screenshots for substantial UI work, and remaining risks. Update the [Wiki](../Wiki/index.md) when architecture, API contracts, schema, or core business rules change.
