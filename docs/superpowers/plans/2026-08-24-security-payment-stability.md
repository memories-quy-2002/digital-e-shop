# Security and Payment Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore production safety after the NestJS migration and dependency bump by fixing authorization regressions, checkout amount integrity, webhook idempotency, order ownership, route/OAuth compatibility, transaction timeout behavior, CORS handling, and CI compatibility.

**Architecture:** Keep the current NestJS/module boundaries and avoid broad refactors. Authorization stays declarative with `RolesGuard` metadata, ownership is enforced at the repository query boundary, checkout prices/discounts are recomputed server-side from authoritative data, and Stripe duplicate delivery is made safe with both application checks and a database uniqueness invariant. CI is restored to the repository's declared Node runtime and a TypeScript/toolchain combination known to work before the incompatible dependency update.

**Tech Stack:** Node.js 24, TypeScript 6, NestJS 11, Vitest, MySQL, Prisma schema metadata, Stripe Checkout, Passport Google OAuth, pnpm, GitHub Actions.

**Spec:** Existing behavior and security contracts in `AGENTS.md`, pre-NestJS route behavior before PR #219, Stripe checkout design docs, and current production code.

## Global Constraints

- Never push directly to `main`; all work stays on `hotfix/security-payment-stability` and goes through a PR.
- Use pnpm only and keep `pnpm-lock.yaml` frozen-install compatible.
- Use Conventional Commit messages.
- Preserve existing successful API response shapes unless security requires narrowing access.
- Admin-only endpoints must have explicit role metadata; customer endpoints must validate ownership.
- Client-supplied cart totals, prices, and discount amounts are not authoritative.
- Stripe webhook processing must tolerate duplicate and concurrent delivery.
- Do not introduce new dependencies unless required.

---

### Task 1: Restore a trustworthy CI baseline

**Files:**
- Modify: `client/package.json`
- Modify: `server/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: repository package manifests and the known-good dependency state immediately before PR #220.
- Produces: a frozen-install-compatible TypeScript 6 toolchain and CI running Node 24.

- [ ] **Step 1: Restore the three dependency files to their exact pre-PR-#220 blobs.**

Use commit `f85c32ee592f9116164a43d532d91492093d2632` as the source so TypeScript returns to `^6.0.3` together with its matching lockfile and eslint tooling.

- [ ] **Step 2: Update both GitHub Actions jobs from Node 22 to Node 24.**

Expected YAML fragment:

```yaml
- uses: actions/setup-node@v6
  with:
    node-version: 24
    cache: 'pnpm'
```

- [ ] **Step 3: Open a draft PR and run the unchanged project verification.**

Expected CI commands:

```bash
pnpm install --frozen-lockfile
pnpm --filter client exec tsc --noEmit
pnpm --filter client lint
pnpm --filter client test -- --run
pnpm --filter client build
pnpm --filter server typecheck
pnpm --filter server lint
pnpm --filter server test -- --run
pnpm --filter server build
```

- [ ] **Step 4: Commit configuration changes.**

```text
revert(deps): roll back incompatible dependency update
ci: align Node version with package engines
```

### Task 2: Restore admin authorization and inventory route compatibility

**Files:**
- Modify: `server/src/orders/orders.controller.ts`
- Modify: `server/src/promotions/promotions.controller.ts`
- Modify: `server/src/inventory/inventory.controller.ts`
- Create/Modify tests under the corresponding `__tests__` directories.

**Interfaces:**
- Consumes: `Roles("Admin")`, `RolesGuard`, current controller route metadata.
- Produces: explicit admin-only metadata and backward-compatible inventory route aliases.

- [ ] **Step 1: Write failing metadata/guard regression tests.**

Tests must prove that the following are admin-only: `GET /orders`, `GET /orders/item`, `POST /orders/status/:oid`, all promotion routes, and inventory movement routes. They must also prove the legacy admin inventory path remains mapped.

- [ ] **Step 2: Run the focused tests and verify they fail because role metadata/route compatibility is missing.**

```bash
pnpm --filter server test -- --run src/orders/__tests__ src/promotions/__tests__ src/inventory/__tests__
```

- [ ] **Step 3: Add minimal controller metadata.**

Use the existing project pattern:

```ts
@Roles("Admin")
```

For inventory, expose both the migrated and legacy paths without duplicating business logic:

```ts
@Controller(["inventory-movements", "products/admin/inventory-movements"])
@UseGuards(AuthGuard, RolesGuard)
@Roles("Admin")
```

- [ ] **Step 4: Re-run focused tests and verify green.**

- [ ] **Step 5: Commit.**

```text
fix(auth): restore admin route authorization
```

### Task 3: Enforce order ownership for detail and Stripe-session lookup

**Files:**
- Modify: `server/src/orders/orders.controller.ts`
- Modify: `server/src/orders/orders.service.ts`
- Modify: `server/src/orders/orders.repository.ts`
- Modify: `server/src/orders/__tests__/orders.controller.test.ts`
- Add focused repository/service tests if needed.

**Interfaces:**
- Consumes: authenticated `req.user.id` and `req.user.role` supplied by `AuthGuard`.
- Produces: scoped order reads where customers can only read their own rows while Admin can read any order.

- [ ] **Step 1: Write failing tests for customer cross-account access and admin access.**

Expected behavior:

```text
Customer A + Order owned by Customer B -> 404/forbidden result without PII
Customer A + own Order -> success
Admin + any Order -> success
```

- [ ] **Step 2: Verify RED.**

- [ ] **Step 3: Scope SQL at the repository boundary.**

Customer query shape:

```sql
... WHERE o.id = ? AND o.user_id = ?
```

Admin query shape remains:

```sql
... WHERE o.id = ?
```

Apply equivalent ownership scope to `stripe_checkout_session_id` lookup used by authenticated clients.

- [ ] **Step 4: Pass requester identity/role from controller through service to repository.**

- [ ] **Step 5: Verify GREEN and commit.**

```text
fix(orders): enforce order ownership
```

### Task 4: Make discounts server-authoritative

**Files:**
- Modify: `server/src/orders/orders.validator.ts`
- Modify: `server/src/orders/orders.service.ts`
- Modify: `server/src/orders/orders.stripe.service.ts`
- Modify: `server/src/orders/orders.controller.ts`
- Modify: `server/src/orders/__tests__/orders.stripe.service.test.ts`
- Modify/add server order service tests.
- Modify: `client/src/context/CartContext.tsx`
- Modify checkout component(s) that pass the applied coupon into purchase/session creation.
- Add focused client tests for coupon state if practical.

**Interfaces:**
- Consumes: `discountCode` from the client, authoritative cart total from cart validation, active promotion records from `OrdersRepository.applyDiscount`.
- Produces: a two-decimal server-computed discount amount used for both cash/bank orders and Stripe charge creation.

- [ ] **Step 1: Write a failing Stripe regression test showing a client cannot set an arbitrary discount amount.**

The Stripe `unit_amount` must be derived from authoritative total and a server-loaded promotion, never request `discount`.

- [ ] **Step 2: Write a failing non-card purchase regression test for the same invariant.**

- [ ] **Step 3: Verify RED.**

- [ ] **Step 4: Add `discountCode` to checkout input and client cart state.**

The client may display a calculated preview, but request payloads send the code rather than a trusted numeric discount.

- [ ] **Step 5: Add a service helper that resolves the promotion and computes discount from authoritative total.**

Rules:
- empty code -> `0`
- promotion must be active/existing according to repository query
- authoritative total must satisfy `min_order_value`
- percentage must be within `0..100`
- currency amount is rounded to two decimal places

- [ ] **Step 6: Use the computed value in order persistence and Stripe `unit_amount`.**

- [ ] **Step 7: Verify focused server/client tests and commit.**

```text
fix(payment): calculate discounts server-side
```

### Task 5: Make Stripe webhook order creation idempotent under concurrency

**Files:**
- Modify: `server/src/orders/orders.stripe.service.ts`
- Modify: `server/src/orders/orders.repository.ts` / service wrapper as needed.
- Modify: `server/src/database/prisma/schema.prisma`
- Create: additive SQL migration under `server/src/database/migrations/`.
- Modify: `server/src/orders/__tests__/orders.stripe.service.test.ts`

**Interfaces:**
- Consumes: Stripe Checkout Session ID.
- Produces: at most one order for a Stripe Checkout Session even when webhook deliveries overlap.

- [ ] **Step 1: Write a failing duplicate/race regression test.**

Test application behavior for an existing order and for a duplicate-key race.

- [ ] **Step 2: Verify RED.**

- [ ] **Step 3: Add a unique database invariant for `orders.stripe_checkout_session_id`.**

The column stays nullable; MySQL permits multiple `NULL` values in a unique index while enforcing uniqueness for actual Stripe IDs.

- [ ] **Step 4: Check for an existing order by Stripe session before creating one.**

- [ ] **Step 5: Treat only the session-ID duplicate-key race as idempotent success; rethrow unrelated DB errors.**

- [ ] **Step 6: Mark the pending checkout consumed after either first successful creation or confirmed duplicate.**

- [ ] **Step 7: Verify focused tests and commit.**

```text
fix(payment): make Stripe webhook processing idempotent
```

### Task 6: Remove the non-cancelling transaction timeout race

**Files:**
- Modify: `server/src/orders/orders.service.ts`
- Add/modify focused order service tests where feasible.

**Interfaces:**
- Consumes: existing per-query MySQL timeout and transaction rollback path.
- Produces: caller result that cannot time out independently while the same transaction continues toward commit.

- [ ] **Step 1: Add a regression test or isolated timing test proving the service does not use an independent non-cancelling deadline.**

- [ ] **Step 2: Verify RED against current `Promise.race` behavior.**

- [ ] **Step 3: Remove the outer `Promise.race` timeout and retain driver query timeouts plus rollback/release semantics.**

- [ ] **Step 4: Verify GREEN and commit.**

```text
fix(orders): remove non-cancelling transaction timeout
```

### Task 7: Restore Google OAuth endpoints

**Files:**
- Create: `server/src/auth/auth.passport.ts`
- Modify: `server/src/auth/auth.controller.ts`
- Add: `server/src/auth/__tests__/auth.google.test.ts` or equivalent focused controller tests.

**Interfaces:**
- Consumes: existing `passport`, `passport-google-oauth20`, Google env values, and `NestAuthService.loginWithSocialProfile`.
- Produces: `GET /api/users/auth/google` and `GET /api/users/auth/google/callback`, preserving previous redirect/error semantics.

- [ ] **Step 1: Write failing route/controller tests for Google provider unavailable and callback completion.**

- [ ] **Step 2: Verify RED because routes are absent.**

- [ ] **Step 3: Restore the Google Passport strategy from the pre-migration implementation using current module paths.**

- [ ] **Step 4: Add Nest controller endpoints that invoke Passport middleware and existing social-login service logic.**

- [ ] **Step 5: Verify GREEN and commit.**

```text
fix(auth): restore Google OAuth routes
```

### Task 8: Use one CORS policy

**Files:**
- Modify: `server/src/main.ts`
- Modify/add CORS-focused test or helper test.

**Interfaces:**
- Consumes: `allowedOrigins` / current CORS config.
- Produces: one CORS middleware path that correctly handles allowed preview/staging origins and preflight requests.

- [ ] **Step 1: Write a failing regression test for a non-default allowed origin OPTIONS request.**

- [ ] **Step 2: Verify RED against the manual early OPTIONS response.**

- [ ] **Step 3: Remove the manual CORS headers/early OPTIONS handler and keep one configured CORS implementation.**

- [ ] **Step 4: Verify GREEN and commit.**

```text
fix(cors): use a single CORS policy
```

### Task 9: Full verification and PR handoff

**Files:**
- No product changes unless verification exposes a regression.

**Interfaces:**
- Consumes: all preceding commits.
- Produces: reviewable PR with fresh CI evidence.

- [ ] **Step 1: Run all CI checks on the final PR head.**

- [ ] **Step 2: Confirm no failed GitHub Actions jobs and inspect Vercel checks.**

- [ ] **Step 3: Compare `main...hotfix/security-payment-stability` and review the complete diff for accidental API/schema churn.**

- [ ] **Step 4: Mark the PR ready for review only after fresh verification is green.**

- [ ] **Step 5: Do not merge; repository rules require review/CI and the user did not explicitly request merging to `main`.**
