# Development guide

Use this guide to run Digital-E locally, understand package boundaries, and make changes that preserve current contracts.

## Runtime and package versions

- Node.js `24.22.1`, selected by `.node-version`
- pnpm `12.4.2`, declared by the client and server manifests
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
Production startup validates the configured database, JWT, CSRF, PayOS, and
origin variables. Firebase Admin credentials are checked separately. Set
`DB_PASSWORD` as well: the MySQL pool uses it, but the current startup
missing-key check does not include it.

### Production deployment variables

Configure these values in the Production environment for the matching Vercel
project. The client values are available at build time; server values are
available to the API runtime.

| Application | Required variables | Handling |
| --- | --- | --- |
| Client build | `VITE_API_BASE_URL`; `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID` | These `VITE_*` values are embedded in browser assets. Firebase web config and its API key are public; restrict the API key to the Firebase APIs and app origins you use. The production project ID is fixed to `graduation-project-5bbfb`. |
| Server database | `DATABASE_URL`, `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Keep the URL and password in server-side deployment settings. Set `DB_PORT` when the database does not use the default port. Set `DB_SSL=true` and provide `DB_SSL_CA_PATH` when the managed database requires a custom CA. |
| Server sessions | `JWT_SECRET_KEY`, `JWT_REFRESH_SECRET_KEY`, `CSRF_SECRET` | Use separate, high-entropy server-side secrets. |
| Server Firebase Admin | `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | Use the production Firebase project. Keep the service-account private key server-side; production must not use the Firebase Auth Emulator. |
| Server payments | `PAYMENT_PROVIDER_MODE=live`, `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY` | Keep PayOS credentials server-side. Production rejects mock mode. |
| Server origins | `CLIENT_URL`, `SERVER_URL` | Set the deployed client and API origins used by CORS and callback generation. |

The client also accepts optional `VITE_FIREBASE_MEASUREMENT_ID`. Do not set
`VITE_FIREBASE_AUTH_EMULATOR_URL` or `FIREBASE_AUTH_EMULATOR_HOST` in
production. `BLOB_READ_WRITE_TOKEN` is needed for Blob-backed image upload
operations. `REDIS_URL` enables shared rate-limit counters across server
instances; without it, counters are process-local. `PAYOS_BASE_URL` defaults to
PayOS's production endpoint; `PAYOS_PARTNER_CODE` is optional. Set
`OTEL_ENABLED` and `OTEL_EXPORTER_OTLP_ENDPOINT` only when using a collector;
`OTEL_EXPORTER_OTLP_HEADERS` is needed only when that collector requires
authentication. Do not use local emulator, seed-count, or database-debug
settings in production.

Mark server credentials as Sensitive in Vercel and scope them to Production.
Scope the client build values to Production too, but treat them as public
configuration. Vercel applies changed environment values to new deployments,
so redeploy after changing them. Vercel requires an existing variable to be
removed and re-added to change it to Sensitive. Never put server credentials in
a `VITE_*` variable or commit them to an `.env` file. See the [Vercel environment variable guide](https://vercel.com/docs/environment-variables/managing-environment-variables),
[Vercel sensitive variables](https://vercel.com/docs/environment-variables/sensitive-environment-variables),
[Vite environment variables](https://vite.dev/guide/env-and-mode), and
[Firebase API key guidance](https://firebase.google.com/docs/projects/api-keys).

Firebase Email/Password verification is client-owned. After Firebase creates
the account, the client calls `sendEmailVerification` with
`/account?verification=complete` as its continue URL; Firebase's action handler
completes verification before returning the customer to Account. The page
refreshes the Firebase identity and synchronizes the verified claim through the
authenticated `/api/users/me/email-verification/sync` endpoint without changing
the current session cookies. If the browser has no Firebase session, Account
asks the customer to sign in and preserves the return path. This does not
require a paid custom domain. Enable Email/Password sign-in and the verification
template in the Firebase console. Add
digital-e.vercel.app under Authentication > Settings > Authorized domains; this
is a free app-origin allowlist entry, not a paid email domain.

Firebase also owns production password-reset and email-change links. New accounts,
confirmed payments, and order lifecycle updates use the separate transactional-email
subsystem, which is disabled by default and supports Resend or a local sandbox.
Set EMAIL_PROVIDER_MODE=resend with a verified sender to deliver these messages.
Delivery runs as a durable post-commit task; provider acceptance is distinct from
inbox delivery.
Authenticated customers also receive database-backed order notifications in
the app; guests use checkout success and protected lookup. Firebase action
codes and guest-order access tokens are never logged or emailed.

### Local retail P0 sandbox

The P0 browser flow and sandbox CLI must target a disposable local MySQL clone.
Internal delivery does not use a carrier sandbox. Use
`EMAIL_PROVIDER_MODE=sandbox`, `PAYMENT_PROVIDER_MODE=mock`, and
`EMAIL_SANDBOX_FIXTURE=accepted`; these modes do not call Resend or PayOS. The
sandbox command checks a loopback API,
explicit local database allowlist, Firebase Auth Emulator, and provider modes
before it runs. See [retail P0 acceptance](./backlog/README.md) and
[testing](./TESTING.md#retail-p0-sandbox).

For local checkout work, `pnpm --dir server seed:delivery:local` seeds an
idempotent demo pickup point and sample VND delivery fees only into the loopback
`digital_e_shop_local` database. It refuses to overwrite existing settings.
The public OSRM demo is for reasonable non-commercial testing only and has no
uptime guarantee; configure a suitable routing provider and tile service for
production. The local seed command requires the OSRM and HTTPS tile endpoints
to be present in the server allowlists first.
Checkout address lookup uses Photon in local development. `GEOCODING_ENDPOINT`
can point to an HTTPS Photon-compatible service; it is disabled by default
outside development. The lookup sends only street address and city, and the
customer confirms a suggested result before its coordinates are saved.

Resend credentials are server-only and use `RESEND_API_KEY`,
`RESEND_WEBHOOK_SECRET`, and
`TRANSACTIONAL_EMAIL_FROM`. Configure these only after provider staging
verification, webhook registration, and an external scheduler have been
reviewed. Internal delivery uses the allowlisted routing and tile settings
managed by an admin; historical GHN shipment and address records are read-only.
The API runner endpoint is authenticated by the server-only
`OPERATIONS_RUNNER_SECRET`; no hosted scheduler is activated by this change.
Vietnam-first payments use PayOS payment links and whole-number VND catalog
values, plus cash on delivery. Keep `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, and
`PAYOS_CHECKSUM_KEY` server-side. New runtime records use VND without an FX
configuration. Production startup requires `PAYMENT_PROVIDER_MODE=live` and
PayOS credentials. Use `PAYMENT_PROVIDER_MODE=mock` only for the local PayOS
simulator;
it redirects to `/mock-payos-checkout` and waits for an explicit simulated
confirmation. The mock confirmation endpoint is disabled in production. Use
`live` with real PayOS channel credentials and a configured
`/api/orders/webhooks/payos` URL. In live mode, only SDK-verified webhook data
creates the order; the browser return URL is not a payment confirmation.
The guarded admin reconciliation workspace can run at most 100 candidates per
request, retry PayOS records, confirm COD collection, and inspect webhook
history. Run `pnpm --dir server seed:demo` after changing the demo seed so the
local catalog, discount thresholds, and demo orders are materialized in VND.
The current seed contains 120 products across eight categories and sixteen
brands. All four seeded accounts (three customers and one admin) have at least
25 completed/canceled orders, and every product has an image, a completed
customer purchase, a customer review, and a wishlist link.

PayOS checkout persists an owner-scoped attempt before requesting a payment
link. In mock mode the local simulator can confirm that attempt without moving
money; the browser return only resumes the backend status view. Configure the
public `/api/orders/webhooks/payos` endpoint for signed provider events and keep
the operations runner available so durable reconciliation tasks can run. The
customer status routes are listed in `docs/API.md`; status polling is bounded
and cancellation applies only while payment is not verified.

Unresolved paid PayOS attempts appear in the admin payment reconciliation page.
Retry creates an order only for an exact verified receipt with no order,
cancellation request, refund, or closed resolution; the service rechecks
inventory and reservation invariants. Offline refunds are records of transfers
already completed by an operator. They require an uploaded private evidence
file, a unique transfer reference, an idempotency UUID, and a reason; the API
does not initiate a bank or PayOS refund. A retry/refund exception is not proof
that real PayOS sandbox acceptance has passed: that acceptance still requires
provider credentials and a configured test channel.

Authentication is Firebase-only. The client signs users in with Firebase Email/Password and sends a Firebase ID token to the API; the server verifies that token with Firebase Admin before issuing its cookie-backed session. Firebase owns verification, password-reset, and email-change action links in every environment. After a verification link returns to Account, the client refreshes the Firebase ID token and calls the authenticated verification-sync endpoint; the API binds the verified Firebase identity to the cookie session and updates `email_verified_at` without replacing the session. A verified email change is synchronized by Firebase UID at the next login. Authenticated checkout, PayOS checkout-session creation, and review creation remain blocked until that claim is true. Legacy verification and password-reset columns remain nullable for schema compatibility but are no longer used by the runtime.

### Local Firebase Auth Emulator profile

The Auth Emulator is opt-in and local-only. It uses Firebase project ID
`demo-digital-e-local`, Auth on `127.0.0.1:9099`, and Emulator UI on
`http://127.0.0.1:4001`; it does not send real email. Uncomment the Firebase
variables in `client/.env.example` and set the matching server values in
`server/.env`:

```env
# client/.env
VITE_FIREBASE_PROJECT_ID=demo-digital-e-local
VITE_FIREBASE_API_KEY=demo-api-key
VITE_FIREBASE_AUTH_DOMAIN=demo-digital-e-local.firebaseapp.com
VITE_FIREBASE_STORAGE_BUCKET=demo-digital-e-local.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=000000000000
VITE_FIREBASE_APP_ID=1:000000000000:web:demo-digital-e-local
VITE_FIREBASE_AUTH_EMULATOR_URL=http://127.0.0.1:9099

# server/.env
FIREBASE_PROJECT_ID=demo-digital-e-local
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
```

Use this startup order in separate terminals:

```powershell
pnpm --dir server docker:up
pnpm --dir server firebase:emulator
pnpm --dir server seed:demo                 # only when the local DB needs demo rows
pnpm --dir server firebase:seed:emulator
pnpm --dir server dev
pnpm --dir client dev
```

The local demo login password is `DemoPass123!`. Seeded customer emails are
`demo.alice@digital-e.local`, `demo.bob@digital-e.local`, and
`demo.carol@digital-e.local`; the admin email is `demo.admin@digital-e.local`.
The Firebase Auth Emulator seeder provisions matching accounts for local sign-in.

The firebase:emulator script persists the local Auth state in the ignored
.firebase/emulator-data directory, so restarting the emulator preserves user
UIDs. The guarded Firebase seeder updates only the four deterministic demo users and
refuses production, remote emulator hosts, or the production Firebase project.
Restart both apps after changing `.env` files. The database and Auth Emulator
seed the demo accounts as email-verified so they can use seeded order history
and continue through checkout and review flows. Use temporary accounts when
testing email-verification onboarding.

Environment ownership is intentionally separated:

| Profile | Client/API and database | Firebase namespace and delivery |
| --- | --- | --- |
| Local Firebase | `localhost` and local MySQL | `demo-digital-e-local` Auth Emulator; no real email |
| Optional preview | Separate preview client/API and database | Separate `digital-e-dev` project if real inbox testing is needed |
| Production | Vercel client/API and production database | `graduation-project-5bbfb`; production Firebase email |

Never reuse production Firebase or production database variables in a local or
preview profile. Service-account credentials belong only in untracked local
files or managed deployment secrets.

The client reads `VITE_API_BASE_URL`. Development uses `http://localhost:4000` when no override is supplied. Production builds require an explicit API base URL. Do not put `/api` in the client variable because request modules add that prefix.

## Prepare the local database

The supported local database is the Docker MySQL service at `127.0.0.1:3307` with database `digital_e_shop_local` and volume `digital_e_shop_local_mysql_data`.

Docker Compose v2 must be available as `docker compose` in the current terminal
(on Windows, use Docker Desktop integration). Commands work from any checkout
path and read `server/.env.docker`; copy `server/.env.docker.example` there first.
They reject remote database targets and preserve configured local credentials.
`docker:up` waits for MySQL health before returning.

Run the protected local setup:

```powershell
pnpm --dir server docker:setup
```

This command starts MySQL, imports the legacy SQL baseline and the historical payment schema compatibility SQL, records the metadata-only Prisma `0_init` marker, deploys forward migrations, runs the deterministic demo seed, and verifies relational counts and orphan links. The historical SQL is a migration prerequisite, not an active payment-provider integration.

Run individual operations when needed:

```powershell
pnpm --dir server docker:up
pnpm --dir server docker:import
pnpm --dir server docker:migrate
pnpm --dir server docker:seed
pnpm --dir server docker:verify
pnpm --dir server docker:down
```

`demo:reset` and the manual GitHub demo-reset workflow are destructive. Use them only with the documented confirmation and backup safeguards. The production workflow validates existing Firebase demo identities before resetting MySQL; configure `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY` in the protected GitHub `production` Environment. Do not bypass database-target guards for a remote or production target.

## Run the applications

Use separate terminals:

```powershell
pnpm --dir server dev
pnpm --dir client dev
```

The server `predev` lifecycle only generates Prisma Client before compiling. It does not migrate or seed the database, so restarting the dev server is safe for existing local data. Procurement and stock-count endpoints require the forward migrations `20261017100000_inventory_stock_revision`, `20261017101000_suppliers_and_purchase_orders`, `20261017102000_purchase_receipts`, and `20261017103000_stock_counts`. After verifying that the selected target is your disposable local database, apply the reviewed migrations with `pnpm --dir server prisma:migrate:deploy`; this command is separate from `dev`. Run `pnpm --dir server prisma:migrate:deploy` explicitly when applying reviewed migrations, then run `pnpm --dir server seed:demo` and `pnpm --dir server demo:verify` when you deliberately want demo data. The client Vite cache lives in `client/.vite`. Production start and Vercel builds use the compiled server output and copied runtime assets.

Default local URLs:

- Client: `http://localhost:5173`
- Server: `http://localhost:4000`
- Health: `http://localhost:4000/api/health`
- Scalar API reference: `http://localhost:4000/docs`

## Analyze frontend bundles

Run the production build with the Vite bundle visualizer:

```powershell
pnpm --dir client analyze
```

The report is written to `client/node_modules/.cache/digital-e-bundle-analysis.html` and includes gzip and Brotli sizes. Every client production build also checks the route and chunk baselines in `client/bundle-size-baseline.json`; the build fails if a measurement grows by more than the configured allowance. Route totals follow Vite's static import graph, with the deferred Admin charts included in the full Dashboard route total.

The aggregate `allProductionJavaScriptGzipBytes` budget baseline is intentionally set to 1,183,570 bytes, twice its previous measured baseline of 591,785 bytes, to reserve capacity for future lazy-loaded features. With the 10% growth allowance, the aggregate ceiling is 1,301,927 bytes (about 1.30 MB). This is budget headroom, not the current measured bundle size; route and chunk baselines remain unchanged to keep customer entry routes and individual chunks guarded.

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
pnpm --dir server seed:demo
pnpm --dir server demo:verify
```

Use `prisma:migrate` only for intentional local migration development. Use reviewed `prisma:migrate:deploy` for shared or production rollout after backup and target verification. Never use `prisma migrate reset` against a data-bearing database.

## Pull requests

Use small Conventional Commit changes. A pull request should explain behavior, changed files, schema or environment assumptions, verification results, screenshots for substantial UI work, and remaining risks. Update the [Wiki](../Wiki/index.md) when architecture, API contracts, schema, or core business rules change.
