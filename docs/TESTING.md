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

The default server Vitest configuration includes `src/**/*.{test,spec}.ts` and excludes integration files. The suite covers guards, validators, controllers, services, repositories, checkout reservations, guest order tokens, seed invariants, response contracts, and security boundaries.

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

## HTTP smoke checks

CI starts the built client preview and compiled server long enough to verify:

```text
GET http://127.0.0.1:4173/
GET http://127.0.0.1:4000/api/health
```

These checks prove that the artifacts start and respond. They do not replace browser verification or authenticated flow checks.

## Read-only k6 tests

The scripts under `server/test/` send `GET` requests only:

```powershell
pnpm --dir server perf:readonly
pnpm --dir server perf:catalog
pnpm --dir server perf:admin-readonly
pnpm --dir server perf:customer-readonly
pnpm --dir server perf:auth-readonly
```

Admin and customer scenarios need a session cookie and, where configured by the script, a user ID:

```powershell
$env:COOKIE="session=...; accessToken=..."
$env:USER_ID="your_user_id"
pnpm --dir server perf:customer-readonly
```

Review `checks`, `http_req_failed`, `http_req_duration`, and `p(95)`. A low response time with failed checks can indicate an authorization failure, wrong response shape, missing data, or a route error.

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
