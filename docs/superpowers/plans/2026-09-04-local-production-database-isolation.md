# Local and Production Database Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure Digital-E local development, CI, and production use explicitly separated MySQL database targets, with local and non-production processes refusing remote database targets.

**Architecture:** Keep production database credentials in Vercel/GitHub environment stores and make the checked-in local examples point only to the Docker MySQL service. Add one small shared database-target guard used by the runtime config, Prisma CLI config, Prisma runtime URL helper, and mock seed entrypoint; local Docker setup will import the legacy schema, historical Stripe SQL, and then apply tracked Prisma migrations to a clearly named local database.

**Tech Stack:** Node.js 24, TypeScript/CommonJS server runtime, MySQL 8.0 Docker Compose, Prisma 7 migration config, Vitest, pnpm, Markdown Wiki.

**Spec:** User-approved database isolation requirement from the 2026-09-04 Digital-E CI/CD hardening work, informed by `E:\Code\Food-recipes\src\backend` local Compose and guarded production workflow patterns.

## Global Constraints

- Never commit `.env`, `.env.local`, `.env.docker`, database credentials, tokens, or production URLs.
- Local and test processes must use `localhost`, `127.0.0.1`, or `::1` database hosts.
- Production database URLs may be remote only when `NODE_ENV=production` and are supplied externally.
- Preserve the existing MySQL schema, legacy dump, Prisma baseline semantics, auth, CSRF, and API contracts.
- Use the existing pnpm workspace and avoid new dependencies.
- Keep `main` untouched; changes remain on the current PR branch.

---

### Task 1: Add a tested database-target guard

**Files:**
- Create: `server/src/config/database-target.js`
- Create: `server/src/config/database-target.test.ts`

**Interfaces:**
- Produces `assertSafeDatabaseTarget({ nodeEnv, dbHost, databaseUrl })` for runtime and Prisma configuration.
- Produces `assertLocalDatabaseTarget({ dbHost, databaseUrl })` for mock seed commands.

- [x] **Step 1: Write the failing tests**

Cover these exact behaviors: local development is allowed, a remote development host is rejected, a remote `DATABASE_URL` is rejected even when `DB_HOST` is local, production may use a remote URL, and the local-only seed guard rejects missing or remote targets.

- [x] **Step 2: Run the focused test and confirm the module is missing**

Run from `server`: `node_modules\\.bin\\vitest.cmd run src/config/database-target.test.ts`.

Expected: FAIL because `database-target.js` does not exist yet.

- [x] **Step 3: Implement the minimal shared guard**

Recognize only `localhost`, `127.0.0.1`, and `::1` as local hosts. Parse the host from `DATABASE_URL`; reject unparseable configured URLs and any remote host for non-production targets without including credentials in the error.

- [x] **Step 4: Run the focused test and confirm it passes**

Run the same Vitest command. Expected: all database-target tests pass.

- [x] **Step 5: Commit**

```powershell
git add -- server/src/config/database-target.js server/src/config/database-target.test.ts
git diff --cached --check
git commit -m "fix(security): guard non-production database targets"
```

### Task 2: Enforce the guard at every database entrypoint

**Files:**
- Modify: `server/src/config/env.config.ts`
- Modify: `server/prisma.config.ts`
- Modify: `server/src/database/prisma/requireDatabaseUrl.ts`
- Modify: `server/src/database/seeders/seedMockOrdersReviews.js`
- Modify: `server/src/database/prisma/requireDatabaseUrl.test.ts`

**Interfaces:**
- Consumes the guards from Task 1.
- Makes application startup, Prisma CLI operations, Prisma runtime connections, and mock seeding fail before any remote non-production connection is attempted.

- [x] **Step 1: Add regression coverage for `requireDatabaseUrl`**

Use a valid local URL for the existing success case and add a test that a remote URL throws while `NODE_ENV=test`. Restore `DATABASE_URL`, `DB_HOST`, and `NODE_ENV` in `afterEach`.

- [x] **Step 2: Run the focused tests and confirm the new behavior fails before implementation**

Run from `server`: `node_modules\\.bin\\vitest.cmd run src/database/prisma/requireDatabaseUrl.test.ts`.

Expected: the new remote-target test fails because `requireDatabaseUrl` does not invoke the guard yet.

- [x] **Step 3: Wire the guard into runtime and CLI paths**

Load the server `.env` convention before local commands, invoke `assertSafeDatabaseTarget` after constructing the exported environment object, invoke it from `prisma.config.ts` when a real URL is configured, invoke it from `requireDatabaseUrl`, and invoke `assertLocalDatabaseTarget` before the mock seed creates its MySQL pool. The mock seed must load `server/.env`, not a nonexistent `server/src/database/.env` path.

- [x] **Step 4: Run focused tests and the safe local-target smoke check**

Run the two focused Vitest files with explicit local test variables. Run the mock seed with an intentionally remote URL and verify it exits with the local-target error before attempting a MySQL connection; do not use the real ignored `.env` for this check.

- [x] **Step 5: Commit**

```powershell
git add -- server/src/config/env.config.ts server/prisma.config.ts server/src/database/prisma/requireDatabaseUrl.ts server/src/database/seeders/seedMockOrdersReviews.js server/src/database/prisma/requireDatabaseUrl.test.ts
git diff --cached --check
git commit -m "fix(security): enforce database target isolation"
```

### Task 3: Make local Docker schema and commands explicit

**Files:**
- Modify: `server/docker-compose.yml`
- Modify: `server/package.json`
- Modify: `server/.env.example`
- Create: `server/.env.docker.example`

**Interfaces:**
- Produces a local MySQL database named `digital_e_shop_local` on `127.0.0.1:3307` with a dedicated Docker volume.
- Makes Docker import load the legacy schema and historical Stripe schema, then runs Prisma migrations and local mock seed explicitly against the local target.

- [x] **Step 1: Add local-only environment examples**

Use `127.0.0.1`, port `3307`, database `digital_e_shop_local`, and disposable local credentials. State that production values belong only to Vercel/GitHub environment stores.

- [x] **Step 2: Update Docker and seed/migration commands**

Change the Compose default database and volume name, replace hard-coded `defaultdb` references with `digital_e_shop_local`, import both checked-in legacy SQL files, add an explicit local `docker:migrate` command, and make `docker:setup` stop on the first failed step.

- [x] **Step 3: Verify configuration statically**

Run the package JSON parser, inspect the Compose file, and search tracked files for `defaultdb` references in executable Docker setup commands. Expected: local setup commands target `digital_e_shop_local`; historical dump filenames may still contain `defaultdb`.

- [x] **Step 4: Commit**

```powershell
git add -- server/docker-compose.yml server/package.json server/.env.example server/.env.docker.example
git diff --cached --check
git commit -m "chore(db): isolate local mysql database"
```

### Task 4: Document the environment boundary and verify the branch

**Files:**
- Modify: `docs/ci-cd.md`
- Modify: `Wiki/architecture.md`
- Modify: `Wiki/overview.md`
- Modify: `Wiki/index.md`
- Modify: `Wiki/log.md`

**Interfaces:**
- Documents local Docker, CI, and production database ownership, migration order, the fail-fast guard, and the required manual replacement of any existing ignored remote `.env`.

- [x] **Step 1: Update the runbook and Wiki**

Document that `server/.env` is local-only, `.env.docker.example` is the Docker contract, CI uses `digital_e_shop_ci`, and production credentials are injected externally. Record the migration order and the required local setup command.

- [x] **Step 2: Run final verification**

Run the focused guard tests, server typecheck, server lint, server unit tests with explicit local test variables, server build, and `git diff --check`. Do not run integration tests until a disposable local Docker database is confirmed; never point them at the existing ignored remote `.env`.

- [x] **Step 3: Commit and update the existing PR**

```powershell
git add -- docs/ci-cd.md Wiki/architecture.md Wiki/overview.md Wiki/index.md Wiki/log.md docs/superpowers/plans/2026-09-04-local-production-database-isolation.md
git diff --cached --check
git commit -m "docs(db): document local and production isolation"
git push
```

Update PR #237 with the new database isolation behavior and verification results.
