# Contributing to Digital-E

This guide explains how to prepare a change, work within the current client and server boundaries, verify it, and submit a reviewable pull request.

## Before you start

Use Node.js `24.20.0` and pnpm `12.3.4`. The repository has one long-lived branch, `main`; do not push directly to it.

Create a focused branch from `main`, then install each package independently:

```powershell
git switch main
git pull --ff-only origin main
git switch -c feature/your-change

pnpm --dir client install
pnpm --dir server install
```

Use `bugfix/your-change` for a non-urgent fix and `hotfix/your-change` for an urgent production fix. Preserve unrelated working-tree changes and do not add a root package, workspace, or lockfile.

## Understand the boundaries

Client domain code belongs under `client/src/features/<domain>/`. Shared client infrastructure belongs under `client/src/lib`, `client/src/context`, `client/src/components`, or `client/src/utils`. Reuse `client/src/lib/http.ts` and existing feature API modules for HTTP calls.

Server features are Nest modules under `server/src/<feature>/`. Keep controllers focused on request parsing and response formatting, services responsible for business rules and cross-table coordination, and repositories responsible for SQL or Prisma persistence. Put request validation in feature validators or shared Zod schemas.

Preserve route-local response keys such as `msg`, `error`, `products`, `orders`, `order`, `pagination`, and `userData`. Preserve cookie sessions, CSRF behavior, route aliases, `AuthGuard`, `RolesGuard`, and ownership checks unless the change explicitly updates the contract.

## Local development

Copy the tracked environment templates and initialize the isolated database when a database-backed flow is needed:

```powershell
Copy-Item client/.env.example client/.env.local
Copy-Item server/.env.example server/.env
Copy-Item server/.env.docker.example server/.env.docker

pnpm --dir server docker:setup
```

Run the applications independently:

```powershell
pnpm --dir server dev
pnpm --dir client dev
```

The server lifecycle generates Prisma Client, applies pending forward migrations, compiles the application, and starts the watcher. Use `pnpm --dir server prisma:migrate` only when intentionally creating a local development migration. Use reviewed `prisma:migrate:deploy` for deployment. Never run `prisma migrate reset` against a data-bearing database.

## Branches and commits

Use a short branch name such as:

```text
feature/guest-order-history
bugfix/admin-order-export
hotfix/csrf-cookie-regression
```

Use Conventional Commit messages:

```text
feat(orders): add guest order lookup
fix(auth): reject suspended refresh sessions
docs: refresh local setup guide
test(client): cover checkout validation
chore(deps): update package dependencies
```

Common types are `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, and `ci`. Keep each commit focused and stage exact paths.

## Pull request checklist

Before opening a pull request:

- Explain the user or operator impact
- List changed files and any API, schema, environment, or migration assumptions
- Add or update focused tests where the behavior is logic-heavy
- Verify loading, empty, error, success, responsive, and accessibility states for UI changes
- Include screenshots for substantial visual changes
- Confirm that no secrets, `.env` files, cookies, tokens, generated bundles, or unrelated formatting are included
- Update `Wiki/` for architecture, API, schema, or core business-logic changes
- State verification results and any command that could not run

Run the checks relevant to the changed package:

```powershell
# Client
pnpm --dir client exec tsc -p tsconfig.json --noEmit
pnpm --dir client lint
pnpm --dir client test -- --run
pnpm --dir client build

# Server
pnpm --dir server typecheck
pnpm --dir server lint
pnpm --dir server test -- --run
pnpm --dir server build
```

Run `pnpm --dir server test:integration` only with a disposable MySQL database. Run read-only k6 scripts for read performance checks. Use a cloned database for write-heavy performance testing.

## Database and seed safety

Local development uses `digital_e_shop_local` at `127.0.0.1:3307`. Database target guards reject remote targets by default. The normal demo seed is transactional and idempotent for deterministic demo-owned rows; `demo:reset` is destructive and requires explicit safeguards.

When adding a schema change, update the Prisma schema, reviewed forward migration, repository, service, validator, types, seed or verifier behavior, and relevant documentation. The legacy MySQL dump remains the baseline for existing tables, while new schema changes belong under `server/src/database/prisma/migrations/`.

Do not run checkout, review creation, cart writes, promotion writes, notification mutations, product updates, or admin updates against production or shared data.

## Security expectations

- Never commit secrets, credentials, cookies, access tokens, private keys, database dumps, or `.env` files
- Validate every write payload before persistence
- Keep unsafe requests inside the existing CSRF flow
- Enforce role and ownership checks before business logic
- Use parameterized SQL and keep SQL inside repositories
- Do not log secrets, cookies, access tokens, passwords, or unnecessary personal data
- Report suspected credential exposure privately and rotate affected secrets

For reporting vulnerabilities, follow [SECURITY.md](./SECURITY.md). For collaboration behavior, follow [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).
