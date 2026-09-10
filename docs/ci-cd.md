# CI/CD and database operations

Digital-E uses GitHub Actions for validation and Vercel for hosting. The repository has one long-lived branch, `main`, and pull requests are the review boundary for changes to it.

## Continuous integration workflow

`.github/workflows/ci.yml` runs on pushes to `main` and pull requests targeting `main`.

### Client job

The client job runs on Ubuntu 24.04 with Node.js `24.20.0` and pnpm `12.3.4`. It installs from `client/pnpm-lock.yaml`, then runs:

- TypeScript typecheck
- ESLint
- Vitest
- Production build with `VITE_API_BASE_URL`
- HTTP smoke check against the Vite preview

### Server job

The server job starts a disposable MySQL 8.4 service. It installs from `server/pnpm-lock.yaml`, verifies connectivity, loads the checked-in legacy SQL baseline and historical Stripe SQL, records the metadata-only Prisma `0_init` baseline, and deploys forward migrations.

It then runs server typecheck, lint, unit tests, MySQL integration tests, a disposable demo reset and seed verification, the compiled server build, the Vercel function build, and an HTTP smoke check against `/api/health`.

The Prisma history is intentionally partial. `0_init` records an existing data-bearing legacy schema; it does not create the complete database on an empty server. CI reproduces the real baseline by loading SQL first and applying Prisma migrations afterward.

### Production migration job

The `production-migrate` job runs only after the client and server jobs succeed on a push to `main`. It uses the protected GitHub `production` Environment, the `production-database-operation` concurrency group, and the injected `DATABASE_URL` secret. It runs `prisma:migrate:deploy` followed by `prisma:migrate:status`.

Configure required reviewers on the `production` Environment. The job does not resolve `0_init` automatically, so the existing production database must already have its legacy baseline reconciled.

## Security workflow

`.github/workflows/security.yml` runs dependency review on pull requests to `main` and fails on high-severity dependency changes. GitHub repository default setup owns CodeQL JavaScript and TypeScript analysis, so this repository does not add a duplicate advanced CodeQL upload.

Workflow actions are pinned to reviewed commit SHAs. Dependabot keeps the client, server, and GitHub Actions ecosystems updated through separate package-local pull requests.

## Deployment boundaries

The repository does not contain a custom Vercel deployment workflow. Vercel projects must be configured externally to deploy only from the intended branch after required checks pass. Keep project IDs and deployment tokens in platform or GitHub Environment secrets.

The client project uses `client/vercel.json` and must define `VITE_API_BASE_URL` in the deployment environment. The server project uses `server/vercel.json`, installs with `pnpm install --frozen-lockfile`, builds with `pnpm run build`, and rewrites requests to `server/api/index.ts`.

Vercel deployment status does not prove application health. After a production deployment, check the storefront and the deployed server's `/api/health` endpoint with the actual configured server domain.

## Environment isolation

CI uses disposable credentials and a disposable MySQL database. Pull request jobs do not receive production credentials. Production secrets belong only in Vercel or protected GitHub Environment stores.

Local development uses:

- `server/.env.example` for ordinary local server commands
- `server/.env.docker.example`, copied to `server/.env.docker`, for Docker helpers
- `client/.env.example` for the Vite API base URL
- MySQL at `127.0.0.1:3307`, database `digital_e_shop_local`
- Docker volume `digital_e_shop_local_mysql_data`

Set `ALLOW_REMOTE_DATABASE=true` only when remote development is intentional and approved. The normal demo seed remains local-only. Prisma generation is schema-only and may run during installation; migration and runtime connections remain target-guarded.

## Local parity checks

Install package dependencies with their own lockfiles:

```powershell
pnpm --dir client install --frozen-lockfile
pnpm --dir server install --frozen-lockfile
```

Run the relevant checks:

```powershell
pnpm --dir client exec tsc -p tsconfig.json --noEmit
pnpm --dir client lint
pnpm --dir client test -- --run
pnpm --dir client build

pnpm --dir server prisma:validate
pnpm --dir server typecheck
pnpm --dir server lint
pnpm --dir server test -- --run
pnpm --dir server build
pnpm --dir server test:integration
```

`test:integration` requires the isolated MySQL database. Do not run it against production or shared remote data. There is no root `pnpm install`, `pnpm dev`, or `pnpm start` command.

## Production migration safety

Before a production migration:

1. Create and verify a recoverable database backup
2. Confirm the target host and database
3. Check for duplicate Stripe Checkout Session IDs and an existing unique key when the migration affects that boundary
4. Confirm the legacy `0_init` baseline is reconciled
5. Run `prisma:migrate:status`, then `prisma:migrate:deploy`, then status again
6. Verify the API health endpoint and a normal checkout or payment webhook flow

Never use `prisma db push` or `prisma migrate reset` against a data-bearing database. See [server/README.prisma.md](../server/README.prisma.md) for the operator procedure.

## Manual demo reset

`.github/workflows/demo-seed.yml` is manual-only. It must be dispatched from `main`, uses the protected `production` Environment, and shares the production database concurrency group with the migration job.

The workflow requires:

- A non-empty verified backup reference
- The exact confirmation `RESET_DEMO_DATABASE`
- `DATABASE_URL`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, and optional `DB_SSL` in the protected Environment

After approval, it drops the selected database's base tables, reloads the committed legacy baseline and historical Stripe SQL, records `0_init`, deploys forward Prisma migrations, runs `prisma:seed`, verifies the demo graph, and checks final migration status. Treat this as destructive production work, not as an application startup step.
