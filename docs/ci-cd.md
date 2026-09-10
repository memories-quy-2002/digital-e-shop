# CI/CD

Digital-E uses GitHub Actions for validation and Vercel for hosting. The
repository has one long-lived branch, `main`; feature and bugfix branches must
merge through a pull request.

## Workflow responsibilities

### `.github/workflows/ci.yml`

The client job runs on Ubuntu 24.04 with Node.js 24.20.0 and pnpm 12.3.4. It
performs frozen pnpm installation, TypeScript typecheck, lint, Vitest unit
tests, a production build with an explicit `VITE_API_BASE_URL`, and an HTTP
smoke check against the Vite preview.

The server job runs against a disposable MySQL 8.4 service and performs the
same code-quality checks plus MySQL connectivity verification, legacy
schema/bootstrap loading, the pre-Prisma Stripe schema change, Prisma deploy
and status checks, MySQL-backed integration tests, a full demo reset/seed/
verification cycle on the disposable database, the server build, and an HTTP
smoke check against `/api/health`.

The Prisma history is intentionally partial. `0_init` is a metadata-only
baseline because raw MySQL repositories still own legacy tables. Consequently,
CI loads the checked-in
`server/src/database/migrations/defaultdb_2026-06-01_142319.sql` dump and
`2026-07-07-add-stripe-payment-support.sql` before applying the committed
Prisma migrations. CI records the metadata-only `0_init` migration as applied
after loading that legacy baseline, then applies the pending Prisma migration.
This is the reproducible CI equivalent of the documented legacy production
baseline; it is not a claim that `0_init` can create the complete schema on an
empty database.

### Production migration job

The same workflow exposes `CI / production-migrate` on a push to `main`. It
runs only after both disposable-environment jobs succeed, installs from
`server/pnpm-lock.yaml`, and executes `prisma:migrate:deploy` followed by a
final migration-status check. The job is protected by the `production`
GitHub Environment and uses the shared `production-database-operation`
concurrency group, so a manual demo reset cannot overlap it.

The `production` Environment must contain a `DATABASE_URL` secret. Configure
required reviewers on that Environment before allowing the job to mutate the
production database. The job does not resolve `0_init` automatically; the
legacy baseline must already be reconciled on the target, as it is for the
current production database.

### `.github/workflows/security.yml`

- Dependency review runs on pull requests and blocks high-severity dependency
  changes.
- CodeQL JavaScript/TypeScript scanning is enabled through GitHub repository
  default setup. It is intentionally not duplicated in this workflow because
  GitHub rejects advanced CodeQL uploads while default setup is enabled.
- Actions are pinned to reviewed immutable commit SHAs. Dependabot continues
  to update the GitHub Actions ecosystem.

### Deployment

There is no custom Vercel deployment workflow in this repository yet. The
Vercel projects must be configured externally so production deployment follows
successful CI and security checks for `main`. If the Vercel/Git integration
cannot provide that gate, add a narrowly scoped deployment workflow with the
Vercel project IDs and production token stored in GitHub Environment secrets;
do not put those values in source control.

The server project's `server/vercel.json` installs from the server project root
with `pnpm install --frozen-lockfile` and builds with `pnpm run build`. The
server's `pnpm-lock.yaml` and package-local `pnpm-workspace.yaml` own its
dependency resolution and approved build-script policy. The client has the
same independent package boundary under `client/`.

The client Vercel project must define `VITE_API_BASE_URL` in its environment.
This variable is intentionally required for production builds so previews do
not silently target the production API.

Vercel `READY` is not an application-health check. After every production
deployment, run both smoke checks:

```bash
curl --fail --silent --show-error https://digital-e.vercel.app/
curl --fail --silent --show-error https://<server-domain>/api/health
```

The backend domain is intentionally a placeholder until the deployed server
project is confirmed. Record the real domain in deployment settings or release
notes, never as a secret.

## Environment boundaries

CI uses disposable values only:

- MySQL is an isolated service created for the job;
- CI database credentials and JWT/CSRF values are test literals;
- normal pull-request jobs do not receive production credentials; and
- repository automation uses placeholder local values where a real database
  connection is unnecessary.

Production credentials belong only in Vercel/GitHub environment secret stores.
Never commit `.env` files, database URLs, access tokens, or signing secrets.
The production server also requires `DATABASE_URL`, `DB_HOST`, `DB_USER`,
`DB_NAME`, `JWT_SECRET_KEY`, `JWT_REFRESH_SECRET_KEY`, `CSRF_SECRET`,
`CLIENT_URL`, and `SERVER_URL` at runtime.

## Database target isolation

Local development must use the Docker MySQL service at `127.0.0.1:3307` with
the database name `digital_e_shop_local`. The tracked templates are:

- `server/.env.example` for ordinary local server commands;
- `server/.env.docker.example` copied to `server/.env.docker` for the Docker
  setup commands; and
- `digital_e_shop_local_mysql_data`, a dedicated local Docker volume.

From a fresh local checkout, copy the templates and initialize the local
schema with:

```powershell
Copy-Item server/.env.example server/.env
Copy-Item server/.env.docker.example server/.env.docker
pnpm --dir server docker:setup
```

If `server/.env` currently contains a remote Aiven or production target,
replace its database variables with the local values before starting the
server. If remote development is intentional, set
`ALLOW_REMOTE_DATABASE=true` explicitly; the application runtime, Prisma CLI
configuration, and Prisma runtime URL helper then allow that target. The mock
seed remains local-only even when `ALLOW_REMOTE_DATABASE=true` or
`NODE_ENV=production` is set accidentally. Prisma's schema-only `generate`
command is exempt because it does not connect to a database and runs during
dependency installation; database-connecting Prisma commands remain guarded
unless remote access is explicitly opted in.

The local setup imports the checked-in legacy dump and historical Stripe SQL,
records the metadata-only `0_init` migration as applied, then runs
`prisma migrate deploy` and the local mock seed. It does not use or modify the
production database. Production migrations use externally injected deployment
credentials only after backup, target verification, and release approval.

## Local parity

Install each package from its own directory and lockfile:

```bash
pnpm --dir client install --frozen-lockfile
pnpm --dir server install --frozen-lockfile
```

Run the application checks:

```bash
pnpm --dir client exec tsc --noEmit
pnpm --dir client lint
pnpm --dir client test -- --run
pnpm --dir client build

pnpm --dir server typecheck
pnpm --dir server lint
pnpm --dir server test -- --run
pnpm --dir server prisma:migrate:resolve --applied 0_init
pnpm --dir server prisma:migrate:deploy
pnpm --dir server prisma:migrate:status
pnpm --dir server test:integration
pnpm --dir server build
```

`pnpm --dir server dev` and `pnpm --dir server start` first run Prisma Client
generation and `prisma migrate deploy`; startup stops if either step fails. Use
`pnpm --dir server prisma:migrate` only to create an intentional development
migration. There is no root `pnpm start`, `pnpm dev`, or `pnpm install` command.

CI does not run browser E2E. It starts the built server and Vite preview only
long enough to verify the HTTP health/page responses, then terminates both
processes.

`test:integration` requires a disposable MySQL database and the server
connection variables (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`,
`DB_NAME`, and `DATABASE_URL`). It is excluded from the normal unit-test
configuration so local unit tests and ordinary CI do not silently depend on a
database. Run it only against `digital_e_shop_local` or another disposable
local/CI database, never against a production or shared remote target.

## Production migration safety

Before applying a production migration:

1. Back up the database and verify the backup.
2. Confirm the target host and database.
3. Check for duplicate Stripe Checkout Session IDs and an existing unique key.
4. Resolve the legacy `0_init` baseline only after confirming the target.
5. Run `pnpm prisma:migrate:status`, then `pnpm prisma:migrate:deploy`, then
   status again.
6. Verify the resulting index and run the API health/checkout smoke checks.

Never use `prisma db push` or `prisma migrate reset` against a data-bearing
database. See [server/README.prisma.md](../server/README.prisma.md) for the
operator commands and reconciliation path.

## Manual demo reset workflow

`.github/workflows/demo-seed.yml` is intentionally manual-only and must be
dispatched from `main`. It is not connected to `push`, pull-request, Vercel
deployment, or server startup. Run it only after verifying a recoverable backup
and configuring the protected
GitHub `production` Environment with these secrets:

- `DATABASE_URL`
- `DB_HOST`
- `DB_PORT`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`
- `DB_SSL` when the database requires TLS

The workflow dispatch form requires both:

- `confirmation`: exactly `RESET_DEMO_DATABASE`;
- `backup_reference`: a non-empty backup ID or timestamp verified by the
  operator.

After Environment approval, the workflow performs this destructive sequence:

1. drops all base tables in the selected database;
2. reloads the committed legacy dump and Stripe baseline from
   `server/src/database/migrations/`, then clears their rows while retaining
   the legacy table structure;
3. records the metadata-only `0_init` migration;
4. applies every reviewed Prisma forward migration;
5. runs `pnpm prisma:seed`, whose data comes from
   `server/src/database/seeders/demoSeedData.js`; and
6. runs `pnpm demo:verify` and a final Prisma migration-status check.

The workflow does not use `prisma migrate reset`, because the Prisma schema is
partial and cannot recreate the legacy tables required by the raw-MySQL
repositories. The reset utility is reachable remotely only with the explicit
full-reset mode, the exact confirmation, and the destructive opt-in variables
set by this workflow. The normal local demo seed remains protected by the
local-target guard.

## Main branch protection

Configure these rules in the GitHub repository settings for `main`:

- require a pull request before merging; zero approvals is acceptable for the
  solo-maintainer workflow;
- require `CI / client`, `CI / server`, and the CodeQL check exposed by
  repository default setup;
- keep `CI / production-migrate` visible as the post-merge production database
  gate; it requires the protected `production` Environment approval;
- require `Security / dependency-review` if GitHub exposes the skipped-on-push
  dependency job as a stable pull-request check;
- require the branch to be up to date when compatible with the merge workflow;
- block force pushes; and
- block branch deletion.

Verify the policy with a deliberately failing pull request. Repository settings
are external state and cannot be verified from this source checkout.

## Release checklist

- [ ] Pull-request CI is green.
- [ ] Security checks are green.
- [ ] Prisma migration review is complete.
- [ ] Pull request is merged to `main`.
- [ ] Main-branch CI and security checks are green.
- [ ] `CI / production-migrate` is approved and green for the main commit.
- [ ] Production deployment is released only after those checks pass.
- [ ] Frontend smoke check passes.
- [ ] Backend `/api/health` check passes.
- [ ] Login and checkout show no new production errors.

## Rollback

If deployment smoke checks fail:

1. Mark the release unsuccessful.
2. Do not blindly apply another database migration.
3. Roll back or re-promote the last known-good Vercel deployment where safe.
4. Open a hotfix pull request.
5. Re-run CI and smoke validation before releasing again.
