# Digital-E Demo Seed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an idempotent, relationally coherent Digital-E demo seed for the legacy MySQL schema, wire it through Prisma 7 commands, and verify the seeded graph without mutating a remote database accidentally.

**Architecture:** Keep MySQL as the seed’s persistence layer because the runtime schema is broader than the partial Prisma schema. Store the fixed demo graph in a pure CommonJS data module, write rows in foreign-key order inside one transaction, and expose a separate verifier that reports exact demo counts plus orphan/mismatch checks. Prisma’s `prisma db seed` command will invoke the existing MySQL seed writer through `prisma.config.ts`.

**Tech Stack:** Node.js, CommonJS, mysql2/promise, bcryptjs, Prisma 7 CLI/config, Vitest.

## Global Constraints

- Use pnpm commands and preserve the existing pnpm lockfile setup.
- Keep demo seeding local-only by default; do not bypass `assertLocalDatabaseTarget` for the configured remote Aiven database.
- Preserve unrelated client worktree changes and the existing `seed:mock` behavior.
- Make `docker:setup` finish with the new demo graph while retaining the old mock path as `docker:seed:mock`.
- Add a Docker-environment verifier so `docker:setup` does not accidentally verify the remote `.env` target.
- Use the current legacy table names and route-local role/status conventions (`Customer`, `Admin`, order statuses `0`, `1`, `2`).
- Do not reset or truncate the database; delete and recreate only rows owned by the deterministic demo users/products.

---

### Task 1: Define and test the relational demo graph

**Files:**
- Create: `server/src/database/seeders/demoSeedData.js`
- Test: `server/src/database/seeders/demoSeedData.test.ts`

**Interfaces:**
- Produces `DEMO_SEED_PLAN`, a deterministic graph definition with users, catalog references, products, carts, orders, reviews, wishlists, addresses, notifications, sessions, discounts, and order status events.
- Produces `validateDemoSeedPlan(plan)`, which returns a summary or throws when a graph reference, unique key, or order-item relationship is invalid.

- [x] **Step 1: Write the failing graph-validation test**

  Import `./demoSeedData` and assert that the plan validates, user emails/usernames are unique, every order has a known demo user and unique known products, every catalog item has an image and relational links, and the summary contains four users and twenty-eight products.

- [x] **Step 2: Run the focused test and confirm the pre-implementation path fails**

  Run from the repository root:

  ```powershell
  server\\node_modules\\.bin\\vitest.cmd run server/src/database/seeders/demoSeedData.test.ts --pool=threads
  ```

  In this Windows workspace the initial run hit Vitest's known `spawn EPERM` launcher restriction; the thread-based rerun was used for the real assertion.

- [x] **Step 3: Add the deterministic graph and validator**

  Define fixed demo user keys/IDs, unique lookup names for categories/brands/products, carts and orders that reference those keys, and validator checks for all references and composite uniqueness constraints.

- [x] **Step 4: Re-run the focused test and confirm it passes**

  Run the same Vitest command and expect one passing test with no database connection required.

### Task 2: Implement the transactional MySQL seed and verifier

**Files:**
- Create: `server/src/database/seeders/seedDemo.js`
- Create: `server/src/database/seeders/verifyDemo.js`

**Interfaces:**
- `seedDemo.js` loads `server/.env`, rejects non-local targets with `assertLocalDatabaseTarget`, creates/updates parent rows before dependents, and commits one transaction.
- `verifyDemo.js` loads the same environment and exits non-zero unless the expected demo counts, linked rows, order totals, and zero orphan references are present.

- [x] **Step 1: Implement local-target protection, pooled queries, and transaction helpers**

  Use `mysql2/promise`, `pool.getConnection()`, `START TRANSACTION`, `COMMIT`, and `ROLLBACK`; keep all values parameterized and use fixed table/column names.

- [x] **Step 2: Implement idempotent cleanup of demo-owned dependents**

  Remove demo child rows before demo orders/carts/users, retaining unrelated rows and all shared catalog parent rows.

- [x] **Step 3: Implement parent-first inserts and linked child inserts**

  Upsert users, resolve category/brand IDs by name, upsert demo products, then insert addresses, carts/items, orders/items, status events, inventory movements, reviews, wishlists, notifications, sessions, and discounts with returned IDs.

- [x] **Step 4: Implement relationship/count verification**

  Verify exact demo-owned counts, every demo order has items, item products/users/orders resolve, every product has an image and order/review/wishlist links, products resolve to categories/brands, order totals equal item totals, and all demo foreign-key probes return zero orphan rows.

### Task 3: Wire Prisma-style commands and document the workflow

**Files:**
- Modify: `server/prisma.config.ts`
- Modify: `server/package.json`
- Create: `server/docker/seed-demo-db.js`
- Create: `server/docker/verify-demo-db.js`
- Modify: `server/README.prisma.md`
- Modify: `Wiki/overview.md`
- Modify: `Wiki/index.md`
- Modify: `Wiki/log.md`

**Interfaces:**
- `pnpm prisma:seed` invokes the MySQL demo seed through `prisma db seed --config prisma.config.ts`.
- `pnpm demo:verify` runs the relational verifier.
- Existing `seed:mock`, migration commands, and unrelated scripts remain available.
- `docker:setup` ends with the relational demo seed; the old generated mock path remains explicitly available as `docker:seed:mock`.
- `docker:setup` runs `docker:verify` using `.env.docker`, while `demo:verify` remains available for a normal local `.env`.

- [ ] **Step 1: Configure Prisma 7’s `migrations.seed` command**

  Point it at `node src/database/seeders/seedDemo.js` while retaining the schema, datasource URL, and database-target guard.

- [x] **Step 2: Add Food-recipes-aligned commands**

  Add `prisma:format`, `prisma:pull`, `prisma:validate`, `prisma:seed`, `prisma:studio`, and `demo:verify`; preserve the project-specific MySQL commands and package manager version.

- [x] **Step 3: Document local setup, demo credentials, and verification**

  Record that `.env.docker`/the local Docker database is required for the normal seed path, list the demo login password without secrets, and state that remote seeding is intentionally rejected.

- [x] **Step 4: Run static validation and inspect the scoped diff**

  Run:

  ```powershell
  server\\node_modules\\.bin\\vitest.cmd run server/src/database/seeders/demoSeedData.test.ts --pool=threads
  pnpm --filter server prisma:validate
  pnpm --filter server typecheck
  pnpm --filter server lint
  git diff --check
  ```

  If Docker is available, run `pnpm --filter server docker:setup`, then `pnpm --filter server prisma:seed` and `pnpm --filter server demo:verify`. If Docker is unavailable, report that the actual database mutation remains unverified and do not claim the database was seeded.

  In this execution Docker Desktop was unavailable and ports 3306/3307 were closed; the localhost seed attempt therefore ended with `ECONNREFUSED` without changing database state.
