# CI/CD

Digital-E uses GitHub Actions for validation and Vercel for hosting. The
repository has one long-lived branch, `main`; feature and bugfix branches must
merge through a pull request.

## Workflow responsibilities

### `.github/workflows/ci.yml`

The client job runs on Ubuntu 24.04 with Node.js 24 and performs frozen pnpm
installation, TypeScript typecheck, lint, Vitest unit tests, and a production
build.

The server job runs against a disposable MySQL 8.4 service and performs the
same code-quality checks plus MySQL connectivity verification, legacy
schema/bootstrap loading, the pre-Prisma Stripe schema change, Prisma deploy
and status checks, MySQL-backed integration tests, and the server build.

The Prisma history is intentionally partial. `0_init` is a metadata-only
baseline because raw MySQL repositories still own legacy tables. Consequently,
CI loads the checked-in
`server/src/database/migrations/defaultdb_2026-06-01_142319.sql` dump and
`2026-07-07-add-stripe-payment-support.sql` before applying the committed
Prisma migrations. This is the reproducible CI equivalent of the documented
legacy production baseline; it is not a claim that `0_init` can create the
complete schema on an empty database.

### `.github/workflows/security.yml`

- CodeQL scans JavaScript and TypeScript on pull requests, pushes to `main`,
  and the weekly schedule.
- Dependency review runs on pull requests and blocks high-severity dependency
  changes.
- Actions are pinned to reviewed immutable commit SHAs. Dependabot continues
  to update the GitHub Actions ecosystem.

### Deployment

There is no custom Vercel deployment workflow in this repository yet. The
Vercel projects must be configured externally so production deployment follows
successful CI and security checks for `main`. If the Vercel/Git integration
cannot provide that gate, add a narrowly scoped deployment workflow with the
Vercel project IDs and production token stored in GitHub Environment secrets;
do not put those values in source control.

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
- Copilot setup uses a placeholder `DATABASE_URL` and does not read a MySQL
  secret.

Production credentials belong only in Vercel/GitHub environment secret stores.
Never commit `.env` files, database URLs, access tokens, or signing secrets.

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
pnpm --filter server docker:setup
```

If `server/.env` currently contains a remote Aiven or production target,
replace its database variables with the local values before starting the
server. The application runtime, Prisma CLI configuration, Prisma runtime
URL helper, and mock seed command reject remote database targets outside
production. The mock seed is local-only even when `NODE_ENV=production` is
set accidentally.

The local setup imports the checked-in legacy dump and historical Stripe SQL,
then runs `prisma migrate deploy` and the local mock seed. It does not use or
modify the production database. Production migrations use externally injected
deployment credentials only after backup, target verification, and release
approval.

## Local parity

Install from the workspace root with the committed lockfile:

```bash
pnpm install --frozen-lockfile
```

Run the application checks:

```bash
pnpm --filter client exec tsc --noEmit
pnpm --filter client lint
pnpm --filter client test -- --run
pnpm --filter client build

pnpm --filter server typecheck
pnpm --filter server lint
pnpm --filter server test -- --run
pnpm --filter server prisma:migrate:deploy
pnpm --filter server prisma:migrate:status
pnpm --filter server test:integration
pnpm --filter server build
```

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

## Main branch protection

Configure these rules in the GitHub repository settings for `main`:

- require a pull request before merging; zero approvals is acceptable for the
  solo-maintainer workflow;
- require `CI / client`, `CI / server`, and `Security / codeql`;
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
