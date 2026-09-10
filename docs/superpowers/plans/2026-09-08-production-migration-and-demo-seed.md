# Production Prisma Migration and Manual Demo Reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Run reviewed Prisma migrations automatically after successful CI on every push to `main`, and provide a manually approved workflow that fully rebuilds the selected MySQL database from the checked-in legacy baseline before running the committed demo seed and verification.

**Architecture:** Keep the existing disposable-MySQL migration test in `.github/workflows/ci.yml`. Add a production migration job that runs only for a successful push to `main`, serializes database changes, and reads `DATABASE_URL` from a protected GitHub Environment. Add a separate `workflow_dispatch` job for destructive demo reset; it reloads the two checked-in legacy SQL files, resolves the metadata-only `0_init`, deploys forward migrations, runs `prisma:seed`, and verifies the relational demo graph.

**Tech Stack:** GitHub Actions, pnpm `12.3.4`, Node.js `24.20.0`, Prisma `7.10.0`, MySQL 8, `mysql2`, CommonJS seeders, Vitest.

## Global Constraints

- Use the independent `server/` package and `server/pnpm-lock.yaml`; do not introduce root package orchestration.
- Production credentials must come from the GitHub `production` Environment; no credentials or populated `.env` files may enter the repository.
- `prisma:migrate:deploy` is forward-only; never use `prisma migrate reset` or `prisma db push` against the production database.
- The demo reset must remain manual-only, require the exact confirmation `RESET_DEMO_DATABASE`, require a non-empty backup reference, and serialize against other production database operations.
- The normal local demo seed remains local-only; the explicit remote path must be impossible without the destructive mode and confirmation checks.
- Preserve unrelated dirty worktree changes and do not commit or push as part of implementation unless separately requested.

---

### Task 1: Add an explicit destructive demo target guard and full reset utility

**Files:**
- Modify: `server/src/config/database-target.js`
- Modify: `server/src/config/database-target.test.ts`
- Modify: `server/src/database/seeders/seedDemo.js`
- Modify: `server/src/database/seeders/verifyDemo.js`
- Create: `server/src/database/seeders/resetDemoDatabase.js`
- Create: `server/src/database/seeders/resetDemoDatabase.test.ts`
- Modify: `server/package.json`

**Interfaces:**
- `assertExplicitDemoSeedTarget({ dbHost, databaseUrl, mode, confirmation })` accepts a remote target only when `mode === "full-reset"` and `confirmation === "RESET_DEMO_DATABASE"`; otherwise it throws before opening a connection.
- `pnpm --dir server demo:reset` drops all base tables in the configured database and reloads `src/database/migrations/defaultdb_2026-06-01_142319.sql` plus `src/database/migrations/2026-07-07-add-stripe-payment-support.sql`.
- `DEMO_SEED_MODE=full-reset` makes `seedDemo.js` and `verifyDemo.js` use the explicit destructive guard; without it, their current local-only guard remains unchanged.

- [ ] **Step 1: Add guard tests first**

Add tests proving that the explicit destructive guard rejects a remote target without the exact mode/confirmation and accepts it only with both values. Keep the existing local-only assertions unchanged.

- [ ] **Step 2: Run the focused guard tests and confirm the new tests fail**

Run:

```powershell
pnpm --dir server test -- --run src/config/database-target.test.ts
```

Expected before implementation: the new import/assertion is missing or the new positive/negative cases fail.

- [ ] **Step 3: Implement the explicit guard**

Add a constant for `RESET_DEMO_DATABASE` and implement `assertExplicitDemoSeedTarget` without weakening `assertLocalDatabaseTarget`.

- [ ] **Step 4: Implement `resetDemoDatabase.js`**

The utility must:

1. call the explicit guard before connecting;
2. read the two checked-in SQL files relative to the script directory;
3. remove `SET @@GLOBAL.GTID_PURGED`, `SET @@SESSION.SQL_LOG_BIN = 0`, and the matching restore statement from the dump before execution;
4. list `BASE TABLE` entries from `SHOW FULL TABLES`, disable foreign-key checks, drop each table using escaped identifiers, and restore foreign-key checks in a `finally` block;
5. import the legacy dump and historical Stripe SQL with `multipleStatements: true`;
6. clear every imported baseline row while retaining the table structures;
7. close the MySQL connection/pool on both success and failure; and
8. export small pure helpers (`sanitizeDump`, `quoteIdentifier`) so they can be unit-tested without a database.

- [ ] **Step 5: Select the guard in the seed and verifier**

Use the explicit guard only when `process.env.DEMO_SEED_MODE === "full-reset"`; otherwise call `assertLocalDatabaseTarget` exactly as today. This allows the workflow to reuse the committed `DEMO_SEED_PLAN` through `prisma:seed` and then reuse `demo:verify` without opening a new unrestricted remote path.

- [ ] **Step 6: Add the package script**

Add this script beside the existing demo scripts:

```json
"demo:reset": "node src/database/seeders/resetDemoDatabase.js"
```

- [ ] **Step 7: Run focused verification**

Run:

```powershell
pnpm --dir server test -- --run src/config/database-target.test.ts src/database/seeders/demoSeedData.test.ts src/database/seeders/resetDemoDatabase.test.ts
pnpm --dir server typecheck
```

Expected: exit code `0`; no database is contacted by these checks.

---

### Task 2: Add production migration and manual demo reset workflows

**Files:**
- Modify: `.github/workflows/ci.yml`
- Create: `.github/workflows/demo-seed.yml`

**Interfaces:**
- `CI / production-migrate` runs only on `push` to `main`, after `CI / client` and `CI / server` succeed.
- `Demo seed / reset-and-seed` runs only through `workflow_dispatch` and uses the protected `production` Environment.
- Required production Environment secrets: `DATABASE_URL`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, and optional `DB_SSL`.

- [ ] **Step 1: Add the production migration job after the existing CI jobs**

Use Node `24.20.0`, pnpm `12.3.4`, `server/pnpm-lock.yaml`, `NODE_ENV=production`, and `DATABASE_URL=${{ secrets.DATABASE_URL }}`. Run `prisma:migrate:deploy` followed by `prisma:migrate:status`; a pre-deploy status check is intentionally omitted because pending migrations are expected on a new main commit. Add `needs: [client, server]`, the `production` Environment, and job concurrency with `cancel-in-progress: false` so two main pushes cannot migrate concurrently.

- [ ] **Step 2: Add the manual workflow trigger**

Define `workflow_dispatch` inputs:

```yaml
inputs:
  confirmation:
    description: Type RESET_DEMO_DATABASE to authorize the destructive reset
    required: true
    type: string
  backup_reference:
    description: A backup ID or timestamp verified before this run
    required: true
    type: string
```

The job must fail before any database command if the confirmation is not exact or the backup reference is blank.

- [ ] **Step 3: Implement the manual reset sequence**

The workflow must set `DEMO_SEED_MODE=full-reset`, pass the confirmation and production database variables, then run in this order:

```text
pnpm install --frozen-lockfile
pnpm demo:reset
pnpm prisma:migrate:resolve --applied 0_init
pnpm prisma:migrate:deploy
pnpm prisma:seed
pnpm demo:verify
```

Print only the backup reference and non-secret target metadata; never echo `DATABASE_URL` or passwords. Use `environment: production` and non-canceling concurrency.

- [ ] **Step 4: Validate workflow syntax and inspect the diff**

Run the available YAML/action lint command if installed; otherwise parse the workflow files with a safe YAML parser and inspect the resulting diff. Confirm the production job is not reachable from `pull_request` and the destructive workflow has no `push` trigger.

- [ ] **Step 5: Exercise the same reset sequence in disposable CI**

Add the full reset, baseline resolve, forward migration, seed, and verifier sequence to the disposable MySQL server job. This validates the manual production sequence without exposing production credentials.

---

### Task 3: Document operator setup and safety boundaries

**Files:**
- Modify: `docs/ci-cd.md`
- Modify: `server/README.prisma.md`
- Modify: `Wiki/index.md`
- Modify: `Wiki/log.md`

**Interfaces:**
- Documentation names the exact GitHub Environment, secret names, required reviewer/backup procedure, manual workflow inputs, and the committed demo seed source (`server/src/database/seeders/demoSeedData.js`).
- Documentation states that the automatic main push job migrates only after CI succeeds and that demo reset never runs automatically.

- [ ] **Step 1: Document GitHub Environment configuration**

Add the exact Environment/secret setup and branch-protection check name `CI / production-migrate`.

- [ ] **Step 2: Document manual demo reset**

Explain the destructive scope, required backup reference, exact confirmation string, execution order, verification output, and the fact that the workflow reloads committed baseline SQL before invoking the demo seed.

- [ ] **Step 3: Update the Wiki index date and append one log entry**

Keep the Wiki concise and link to the CI/CD guide using a working relative link or Obsidian wikilink.

---

### Task 4: Verify the complete change without touching production

**Files:**
- Inspect: all changed files

- [ ] **Step 1: Run focused server tests**

```powershell
pnpm --dir server test -- --run src/config/database-target.test.ts src/database/seeders/demoSeedData.test.ts src/database/seeders/resetDemoDatabase.test.ts
```

- [ ] **Step 2: Run server typecheck, lint, and build**

```powershell
pnpm --dir server typecheck
pnpm --dir server lint
pnpm --dir server build
```

- [ ] **Step 3: Check YAML and security invariants**

Confirm no workflow prints secrets, no production job runs on pull requests, no demo seed runs on `push`, and no `prisma migrate reset`/`prisma db push` is introduced.

- [ ] **Step 4: Review Git state**

Run:

```powershell
git diff --check
git status --short --branch
```

Stage nothing and preserve all pre-existing user changes.
