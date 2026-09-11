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

Firebase Email/Password verification is client-owned in production. After
Firebase creates the account, the client calls `sendEmailVerification`; Firebase
delivers the link and its default action handler completes verification. This
does not require a paid custom domain. Enable Email/Password sign-in and the
verification template in the Firebase console. Add
digital-e.vercel.app under Authentication > Settings > Authorized domains; this
is a free app-origin allowlist entry, not a paid email domain.

Firebase also owns production password-reset and email-change links. The server
does not configure a generic transactional email provider, so order confirmation
emails are currently disabled. Authenticated customers receive database-backed
order notifications in the app; guests use checkout success and protected
lookup. If an external order-email channel is added later, keep credentials
server-side and make delivery a non-blocking post-commit side effect. Firebase
action codes and guest-order access tokens are never logged.
Vietnam-first payments use PayOS payment links and whole-number VND catalog values. Keep `PAYOS_CLIENT_ID`,
`PAYOS_API_KEY`, and `PAYOS_CHECKSUM_KEY` server-side and set
`STORE_CURRENCY=VND` for the Vietnam-first default. Set
`PAYOS_USD_TO_VND_RATE` only when deliberately running an USD-backed catalog.
Use `PAYMENT_PROVIDER_MODE=mock` for the local PayOS simulator; it redirects to
`/mock-payos-checkout` and waits for an explicit simulated confirmation. Use
`live` only with real PayOS channel credentials and a configured
`/api/orders/webhooks/payos` URL. In live mode, only a verified webhook creates
the order; the browser return URL is not a payment confirmation. Run
`pnpm --dir server seed:demo` after changing the demo seed so local products,
discount thresholds, and demo orders are materialized in VND. Stripe remains an
optional international rail and requires an intentional USD/catalog setup.

Authentication is Firebase-only. The client signs users in with Firebase Email/Password and sends a Firebase ID token to the API; the server verifies that token with Firebase Admin before issuing its cookie-backed session. Firebase owns verification, password-reset, and email-change action links in every environment. After the user signs in again, the server reads Firebase's email_verified claim and updates email_verified_at, including synchronizing a verified email change by Firebase UID. Authenticated checkout, Stripe checkout-session creation, and review creation remain blocked until that claim is true. Legacy verification and password-reset columns remain nullable for schema compatibility but are no longer used by the runtime.

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
pnpm dlx --allow-build=protobufjs --allow-build=re2 --package=firebase-tools firebase emulators:start --only auth --project demo-digital-e-local
pnpm --dir server seed:demo                 # only when the local DB needs demo rows
pnpm --dir server firebase:seed:emulator
pnpm --dir server dev
pnpm --dir client dev
```

The guarded Firebase seeder updates only the four deterministic demo users and
refuses production, remote emulator hosts, or the production Firebase project.
Restart both apps after changing `.env` files. The local demo DB starts those
users with `email_verified_at = NULL`; completing an Emulator UI action link
and signing in again synchronizes the verified Firebase claim.

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

The server `predev` lifecycle only generates Prisma Client before compiling. It does not migrate or seed the database, so restarting the dev server is safe for existing local data. Run `pnpm --dir server prisma:migrate:deploy` explicitly when applying reviewed migrations, then run `pnpm --dir server seed:demo` and `pnpm --dir server demo:verify` when you deliberately want demo data. The client Vite cache lives in `client/.vite`. Production start and Vercel builds use the compiled server output and copied runtime assets.

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
pnpm --dir server seed:demo
pnpm --dir server demo:verify
```

Use `prisma:migrate` only for intentional local migration development. Use reviewed `prisma:migrate:deploy` for shared or production rollout after backup and target verification. Never use `prisma migrate reset` against a data-bearing database.

## Pull requests

Use small Conventional Commit changes. A pull request should explain behavior, changed files, schema or environment assumptions, verification results, screenshots for substantial UI work, and remaining risks. Update the [Wiki](../Wiki/index.md) when architecture, API contracts, schema, or core business rules change.
