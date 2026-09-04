# Prisma Migrate Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Digital-E Shop a tracked Prisma migration history and a safe production `migrate deploy` workflow without making Prisma own legacy tables that are still managed through raw SQL repositories.

**Architecture:** Keep the existing partial Prisma schema unchanged. Use Prisma Migrate as the migration runner/history for new production changes: a metadata-only `0_init` baseline is marked applied on the existing database, then a normal pending Prisma migration adds the Stripe checkout-session unique key. Legacy dump/SQL files remain historical bootstrap evidence and are not replayed by Prisma.

**Tech Stack:** Prisma 7, MySQL 8/Aiven, pnpm 11, GitHub Actions.

**Spec:** Conversation-approved design from 2026-08-24; no separate spec file.

## Global Constraints

- Do not connect to or mutate the production database from this implementation PR.
- Do not run or recommend `prisma migrate reset` on the data-bearing database.
- Do not baseline the full legacy dump because `schema.prisma` intentionally models only part of the database.
- Keep the pending Stripe migration SQL identical to the reviewed hotfix SQL.
- Keep deployment operator steps explicit: backup, duplicate check, baseline resolve, status, deploy, verify.
- Follow Conventional Commits and pnpm-only repository rules.

---

### Task 1: Add Prisma migration history

**Files:**
- Create: `server/src/database/prisma/migrations/migration_lock.toml`
- Create: `server/src/database/prisma/migrations/0_init/migration.sql`
- Create: `server/src/database/prisma/migrations/20260824053250_enforce_stripe_checkout_idempotency/migration.sql`
- Delete: `server/src/database/migrations/2026-08-24-enforce-stripe-checkout-idempotency.sql`

**Interfaces:**
- Consumes: current MySQL schema and the already-reviewed Stripe unique-key SQL.
- Produces: Prisma migration history that `prisma migrate resolve`, `status`, and `deploy` can consume.

- [ ] **Step 1:** Add `migration_lock.toml` with `provider = "mysql"`.
- [ ] **Step 2:** Add a comment-only `0_init/migration.sql` that documents it as a metadata baseline for the existing legacy database and explicitly states it must be marked applied, not executed against production.
- [ ] **Step 3:** Move the Stripe unique-key `ALTER TABLE` into the timestamped Prisma migration directory unchanged.
- [ ] **Step 4:** Remove the duplicate standalone pending SQL file so there is one source of truth.
- [ ] **Step 5:** Commit with `chore(db): add Prisma migration history`.

### Task 2: Add migration commands and operator documentation

**Files:**
- Modify: `server/package.json`
- Create: `server/README.prisma.md`
- Create: `server/src/database/migrations/README.md`

**Interfaces:**
- Consumes: migration history from Task 1.
- Produces: explicit developer/operator commands for `resolve`, `status`, and `deploy`.

- [ ] **Step 1:** Keep the existing `prisma:migrate` development command but make the config explicit; add `prisma:migrate:deploy` and `prisma:migrate:status` scripts using `prisma.config.ts`.
- [ ] **Step 2:** Document that `migrate dev` must not be run against shared/production legacy databases while the Prisma schema is partial.
- [ ] **Step 3:** Document production rollout: backup, verify the unique index is absent, query for duplicate `stripe_checkout_session_id`, `migrate resolve --applied 0_init`, `migrate status`, `migrate deploy`, then verify the unique index and API health.
- [ ] **Step 4:** Document that the old `server/src/database/migrations` directory is legacy bootstrap/history only; future deployable migrations belong under `src/database/prisma/migrations`.
- [ ] **Step 5:** Commit with `docs(db): document Prisma migration rollout`.

### Task 3: Verify and open the PR

**Files:**
- Verify all files changed above.

**Interfaces:**
- Consumes: Tasks 1-2.
- Produces: a reviewable PR into `main` with CI evidence.

- [ ] **Step 1:** Verify `server/package.json` remains valid JSON and scripts use the repository's existing Prisma config path.
- [ ] **Step 2:** Verify the pending migration contains exactly one `ALTER TABLE orders ADD UNIQUE KEY uq_orders_stripe_checkout_session (stripe_checkout_session_id);` statement.
- [ ] **Step 3:** Verify the old standalone pending SQL file is removed and the two older legacy SQL artifacts remain untouched.
- [ ] **Step 4:** Open a PR titled `chore(db): adopt Prisma migrate deploy workflow`.
- [ ] **Step 5:** Wait for GitHub Actions client/server checks and inspect failures before claiming completion.
