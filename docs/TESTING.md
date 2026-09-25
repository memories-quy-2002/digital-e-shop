# Testing guide

Digital-E uses package-local TypeScript, lint, Vitest, build, MySQL integration, HTTP smoke, and read-only k6 checks. Choose checks from the surface you changed and report any unavailable environment explicitly.

## Client checks

Run from the repository root:

```powershell
pnpm --dir client exec tsc -p tsconfig.json --noEmit
pnpm --dir client lint
pnpm --dir client test -- --run
pnpm --dir client build
```

Client tests use Vitest with a `jsdom` environment and Testing Library. Place focused tests next to the feature or component they cover. Test route guards, API request contracts, loading and error states, checkout validation, cart source transitions, and responsive interaction behavior when those surfaces change.

## Server checks

Run the package-local checks:

```powershell
pnpm --dir server typecheck
pnpm --dir server lint
pnpm --dir server test -- --run
pnpm --dir server build
```

The default server Vitest configuration includes `src/**/*.{test,spec}.ts` and excludes integration files. The suite covers guards, validators, controllers, services, repositories, checkout reservations, guest order tokens, Firebase auth boundaries, seed invariants, response contracts, and security boundaries.

## MySQL integration checks

Integration tests use `vitest.integration.config.ts` and require a disposable MySQL database with `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, and `DATABASE_URL` configured:

```powershell
pnpm --dir server test:integration
```

Use the isolated Docker database or a CI database. Do not point integration tests at a shared or production target. The CI server job loads the legacy SQL baseline, records the metadata-only `0_init` migration, deploys forward migrations, runs the integration suite, and exercises the demo reset on disposable data.

## Database and migration checks

Use these checks when changing schema, repositories, seeders, or multi-table flows:

```powershell
pnpm --dir server prisma:validate
pnpm --dir server prisma:migrate:status
pnpm --dir server demo:verify
```

Checkout, inventory, payment, order timeline, notification, support, guest lookup, and promotion changes need focused tests for ownership, validation, transaction boundaries, idempotency, and failure behavior.

Authentication changes should cover Firebase ID-token payloads, Firebase signup delivery and account-page resend behavior, the absence of server-owned verification endpoints, synchronization from a verified Firebase ID-token claim, public-user redaction, unverified-session login, and `VerifiedEmailGuard` behavior. The disposable MySQL database is still required for repository and guard checks; the legacy email-verification columns are compatibility state, not a prerequisite for Firebase email delivery.

## Firebase Auth Emulator acceptance flow

Use the local Firebase profile when testing registration, verification,
password reset, or email change without sending mail:

The firebase:emulator script imports local Auth state from the ignored
.firebase/emulator-data directory and exports it again when the emulator exits,
so restarting the emulator does not recreate user UIDs.

```powershell
pnpm --dir server firebase:emulator
pnpm --dir server firebase:seed:emulator
```

Open `http://127.0.0.1:4001`. Use the `Authentication` tab to inspect users and
the `Logs` tab to copy verification, reset, and email-change action links. The
Emulator UI replaces the inbox; no real email is delivered. Password-reset action links
from the emulator contain the placeholder `newPassword=NEW_PASSWORD_HERE`;
replace it with a URL-encoded disposable password before opening the link. The
emulator completes the reset in its own action handler, while production links
continue to the client `/reset-password` action-code page. With both apps
running on localhost:

1. Register a disposable account and confirm it is unverified in the Emulator UI and the account state.
2. Open its verification link from the Emulator UI, return to localhost, sign in again, and confirm the API user becomes verified.
3. Request password reset, open the reset link, set a new password, and confirm login with the new password.
4. Request an email change, open the Firebase action link, sign in again, and confirm the Firebase email and API user email match.

Use only disposable emulator accounts. Do not use production credentials or
run the seeder with `NODE_ENV=production`. For real-inbox preview testing,
create a separate Firebase project and separate database; never point localhost
at the production Firebase project.

## HTTP smoke checks

CI starts the built client preview and compiled server long enough to verify:

```text
GET http://127.0.0.1:4173/
GET http://127.0.0.1:4000/api/health
```

These checks prove that the artifacts start and respond. They do not replace browser verification or authenticated flow checks.

## Read-only k6 tests

The scripts under `server/test/` send `GET` requests only. The shared Node
launcher reads `server/.env.k6`, so profile commands and configuration work
across Windows, macOS, Linux, and CI without shell-specific environment syntax.
Create the ignored local config once, then run a profile:

```text
pnpm --dir server perf:setup
pnpm --dir server perf:smoke
pnpm --dir server perf:readonly
pnpm --dir server perf:catalog
pnpm --dir server perf:admin-readonly
pnpm --dir server perf:customer-readonly
pnpm --dir server perf:auth-readonly
```

Set `BASE_URL`, `PRODUCT_ID`, and smoke settings in `server/.env.k6`. Authenticated
profiles need a disposable test account; set `COOKIE` and, where required,
`USER_ID` in that ignored file or in your CI secret/environment configuration.
Install the k6 executable and put it on `PATH`, or set `K6_BIN` to its full path
in `server/.env.k6`. See [README-k6](../server/test/README-k6.md) for details.

Review `checks`, `http_req_failed`, `http_req_duration`, and `p(95)`. A low response time with failed checks can indicate an authorization failure, wrong response shape, missing data, or a route error.

The smoke profile covers health, catalog listing/search/facets, product detail,
and comparison when seeded data includes two products in one category. It defaults
to one virtual user for 20 seconds, limits the run to five virtual users, and
checks request errors, p95 latency, and response assertions. It refuses remote
targets unless `ALLOW_REMOTE_TEST_TARGET=true`; use that override only with an
approved test deployment.

## Write safety

Do not run these operations against production or shared data during performance testing:

- Checkout or order creation
- Cart writes
- Review creation
- Address creation or updates
- Notification mutations
- Product updates or deletion
- Promotion creation or updates
- Admin status or inventory updates

Use a cloned test database for write-heavy performance work. Keep local demo reset and production migration operations behind their explicit safeguards.
