# Security and CI Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore authorization and checkout integrity, repair CI after the dependency upgrade, and remove confirmed regressions without broad architectural changes.

**Architecture:** Keep the current NestJS module/controller/service/repository structure. Authorization remains metadata-driven through `RolesGuard`; order ownership is enforced at the API/service boundary; checkout prices and discounts are server-authoritative; Stripe idempotency is backed by a database uniqueness guarantee. Configuration fixes are intentionally minimal.

**Tech Stack:** NestJS 11, TypeScript, Vitest, MySQL/Prisma, Stripe, React/Vite, GitHub Actions.

**Spec:** Findings from PR review of #218, #219, and #220.

## Global Constraints

- Preserve current API response contracts unless fixing a confirmed broken route.
- Do not add dependencies unless required.
- Use Conventional Commits.
- Never push directly to `main`; all changes stay on `hotfix/security-and-ci-remediation` and go through PR review.
- Test-first for behavioral fixes; configuration-only fixes are verified by typecheck/lint/build CI.

---

### Task 1: Restore admin authorization metadata

**Files:**
- Modify: `server/src/orders/orders.controller.ts`
- Modify: `server/src/promotions/promotions.controller.ts`
- Modify: `server/src/inventory/inventory.controller.ts`
- Test: targeted controller/metadata tests under the existing server test convention.

- [ ] Add failing tests proving customer requests cannot reach admin-only order, promotion, and inventory handlers.
- [ ] Verify tests fail because required role metadata is absent.
- [ ] Add `@Roles("admin")` only to endpoints that were admin-only before the NestJS migration.
- [ ] Verify targeted tests pass.
- [ ] Commit as `fix(auth): restore admin authorization metadata`.

### Task 2: Restore inventory route compatibility

**Files:**
- Modify: `server/src/inventory/inventory.controller.ts` or module routing configuration.
- Test: route contract test.

- [ ] Add a failing test for `/api/products/admin/inventory-movements`.
- [ ] Restore the historical route without creating a second implementation.
- [ ] Verify route and authorization tests pass.
- [ ] Commit as `fix(api): restore inventory movements route`.

### Task 3: Make checkout discount server-authoritative

**Files:**
- Modify: `server/src/orders/orders.validator.ts`
- Modify: `server/src/orders/orders.stripe.service.ts`
- Modify relevant promotion service/repository only as needed.
- Test: checkout service tests.

- [ ] Add a failing test showing a client-supplied numeric discount cannot lower Stripe amount.
- [ ] Replace trusted numeric discount input with server-side promotion calculation using existing promotion data/rules.
- [ ] Persist only the computed discount.
- [ ] Verify normal and malicious checkout cases pass.
- [ ] Commit as `fix(payment): calculate discounts server-side`.

### Task 4: Make Stripe webhook processing idempotent under concurrency

**Files:**
- Modify order persistence/migration files.
- Modify Stripe completion flow as needed.
- Test: concurrent duplicate completion test.

- [ ] Add a failing concurrency test showing two completion deliveries can create duplicate orders.
- [ ] Add a unique DB guarantee for `stripe_checkout_session_id` and map duplicate insert to already-processed success.
- [ ] Keep pending checkout consumption consistent with order creation.
- [ ] Verify duplicate concurrent deliveries create one order.
- [ ] Commit as `fix(payment): enforce webhook idempotency`.

### Task 5: Enforce order ownership

**Files:**
- Modify: `server/src/orders/orders.controller.ts`
- Modify: `server/src/orders/orders.repository.ts` / service as appropriate.
- Test: customer A cannot read customer B order/session.

- [ ] Add failing ownership tests.
- [ ] Scope customer queries by authenticated user ID while preserving admin access.
- [ ] Verify owner succeeds and unrelated customer receives not-found/forbidden according to existing contract.
- [ ] Commit as `fix(orders): enforce order ownership`.

### Task 6: Restore Google OAuth or remove broken client affordance

**Files:**
- Inspect existing auth migration and client social auth code first.
- Prefer restoring existing pre-migration Google OAuth behavior if compatible with current dependencies.

- [ ] Add route-level failing test for `/api/users/auth/google` when OAuth configuration is present.
- [ ] Port the pre-migration Passport Google flow into the NestJS auth module without changing callback contract.
- [ ] Verify callback and client redirect paths align.
- [ ] Commit as `fix(auth): restore Google OAuth`.

### Task 7: Remove non-cancelling order transaction timeout race

**Files:**
- Modify: `server/src/orders/orders.service.ts`
- Test: transaction timeout behavior.

- [ ] Add a failing test reproducing `Promise.race` returning timeout while operation continues.
- [ ] Remove the outer non-cancelling timeout race and rely on database/query timeout/rollback semantics already available.
- [ ] Verify timeout cannot report failure while later committing successfully.
- [ ] Commit as `fix(orders): remove transaction timeout race`.

### Task 8: Repair dependency/CI breakage

**Files:**
- Modify package manifests/lockfile as needed.
- Modify: `.github/workflows/ci.yml`

- [ ] Revert TypeScript 7 to the latest compatible TypeScript 6 line rather than performing a broad TS7 migration in this hotfix.
- [ ] Align GitHub Actions Node with the repository `24.x` engine.
- [ ] Run server/client typecheck, lint, test, and build in CI.
- [ ] Commit as `fix(deps): restore compatible TypeScript toolchain` and `ci: align Node version with project engines`.

### Task 9: Consolidate CORS policy

**Files:**
- Modify: `server/src/main.ts`
- Test: allowed-origin and disallowed-origin preflight behavior if harness permits.

- [ ] Add a failing preflight test for a configured non-default allowed origin.
- [ ] Remove the manual CORS header/OPTIONS short-circuit and keep one `cors()` policy.
- [ ] Verify configured origins receive correct preflight headers and disallowed origins are rejected.
- [ ] Commit as `fix(cors): use a single cors policy`.

### Task 10: Full verification and PR

- [ ] Verify server typecheck, lint, test, build.
- [ ] Verify client typecheck, lint, test, build.
- [ ] Inspect final diff for unrelated churn and secrets.
- [ ] Open PR into `main` with risk summary, test evidence, and migration notes.
