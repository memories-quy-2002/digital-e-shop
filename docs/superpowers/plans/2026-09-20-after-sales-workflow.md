# After-sales Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement customer and guest return/warranty requests, admin review, auditable refund confirmation, and the corresponding storefront/admin UI.

**Architecture:** Add a dedicated `after-sales` NestJS module backed by MySQL repositories and an additive Prisma migration. Keep support tickets as general support, keep guest access token-based, and make the service the authority for eligibility, quantities, transitions, and refund amounts. Add focused client feature code that consumes the new contracts without changing existing order or payment response shapes.

**Tech Stack:** NestJS 11, Express 5, TypeScript, Zod, MySQL/mysql2 repositories, Prisma 7 schema/migrations, React 19, React Router 7, Axios, Vitest, Testing Library, SCSS.

**Spec:** `docs/superpowers/specs/2026-09-20-after-sales-workflow-design.md`

**Status:** Complete — 2026-09-20. Tasks 1–9 are implemented and verified in
PR #252. The final runtime includes customer, guest, and admin workflows,
server-derived eligibility/quantities/refunds, client screens, migrations,
OpenAPI, and Wiki documentation.

## Global Constraints

- Use Node.js `24.20.0` and pnpm `12.3.4`; do not add npm/yarn lockfiles.
- Keep MySQL feature repositories as the primary runtime persistence boundary; Prisma remains schema/migration alignment only.
- Preserve `AuthGuard`, `RolesGuard`, customer ownership, guest token hashing, CSRF behavior, rate limiting, and route-local response contracts.
- Never trust client order status, warranty duration, quantity availability, or refund amount.
- Never log raw guest tokens, cookies, payment secrets, or unnecessary personal data.
- All SQL values must be parameterized and every unsafe request must retain CSRF protection.
- Add pagination to customer, guest, and admin list queries; cap limits at 100.
- Use TDD for every production behavior: write a failing focused test, observe RED, implement the smallest change, observe GREEN, then run the owning package suite.
- Update `docs/API.md`, the affected Wiki pages, `Wiki/index.md` last-updated metadata, and `Wiki/log.md` after the API/business behavior is complete.

## Review Focus

- A customer cannot read or mutate another customer’s request, even when guessing a request ID; test in Task 4.
- A guest token cannot read another order’s request and no raw token appears in a response; test in Task 4.
- A return submitted exactly at the seven-day boundary follows the documented UTC rule; test in Task 2.
- Repeated refund confirmation cannot double-refund or change the recorded amount/reference; test in Task 5.
- An admin list cannot silently load an unbounded request queue; test pagination in Task 3 and Task 8.

---

### Task 1: Add the additive after-sales schema

**Files:**
- Create: `server/src/database/prisma/migrations/20260920100000_after_sales_workflow/migration.sql`
- Modify: `server/src/database/prisma/schema.prisma:Order, OrderItem, User, OrderPayment relations`
- Create: `server/src/after-sales/__tests__/after-sales.schema.integration.test.ts`

**Interfaces:**
- Consumes: existing `orders`, `order_items`, `users`, and `order_payments` tables.
- Produces: `after_sales_requests`, `after_sales_items`, `after_sales_events`, their indexes/foreign keys, and matching Prisma models.

- [ ] **Step 1: Write the failing disposable-MySQL schema test**

  Add a test that queries `information_schema.tables` and `information_schema.columns` after migrations and asserts that all three tables, request status/kind columns, the request idempotency key, item uniqueness, and event indexes exist.

- [ ] **Step 2: Run the test to verify it fails**

  Run: `pnpm --dir server test:integration -- after-sales.schema.integration.test.ts`

  Expected: FAIL because the new tables do not exist.

- [ ] **Step 3: Write the migration and Prisma models**

  Add additive `CREATE TABLE` statements with:

  - nullable `user_id` and `guest_order_token_hash`, with a unique hash index;
  - `kind` and `status` varchar columns constrained by application validation;
  - decimal refund fields with currency;
  - request idempotency uniqueness;
  - foreign keys to orders, nullable users, order items, and request rows;
  - indexes for owner/order/status/kind/created time and event chronology;
  - `ON DELETE RESTRICT` for order/request history and `ON DELETE SET NULL` for actor users where compatible with the existing schema.

  Add the corresponding Prisma models and relations without changing unrelated models or generated output by hand.

- [ ] **Step 4: Run the schema test to verify it passes**

  Run: `pnpm --dir server prisma:validate`; then run the disposable MySQL integration command from `docs/TESTING.md` with `after-sales.schema.integration.test.ts`.

  Expected: migration status is clean and the schema assertions pass.

- [ ] **Step 5: Commit**

  ```powershell
  git add server/src/database/prisma server/src/after-sales/__tests__/after-sales.schema.integration.test.ts
  git commit -m "feat(after-sales): add workflow persistence"
  ```

### Task 2: Implement after-sales domain policy and validators

**Files:**
- Create: `server/src/after-sales/after-sales.types.ts`
- Create: `server/src/after-sales/after-sales.validator.ts`
- Create: `server/src/after-sales/after-sales.policy.ts`
- Create: `server/src/after-sales/__tests__/after-sales.policy.test.ts`
- Create: `server/src/after-sales/__tests__/after-sales.validator.test.ts`

**Interfaces:**
- Consumes: order status `1` delivered, `delivered_at`, order item warranty snapshots, and request status constants from the spec.
- Produces: `AfterSalesKind`, `AfterSalesStatus`, `AfterSalesRequestInput`, `AfterSalesListQuery`, `AfterSalesStatusTransition`, `RefundConfirmationInput`, `evaluateEligibility()`, `assertTransition()`, and Zod schemas.

- [ ] **Step 1: Write failing policy tests**

  Cover delivered customer orders, canceled orders, missing `delivered_at`, return at 6 days, return at exactly 7 days, return after 7 days, warranty inside/outside the snapshot month, zero/null warranty, quantity overage, and illegal status transitions.

  Example assertion shape:

  ```ts
  expect(evaluateEligibility({ kind: "RETURN", status: 1, deliveredAt: "2026-09-01T00:00:00.000Z", warrantyMonths: 0, now: "2026-09-08T00:00:00.000Z" })).toMatchObject({ eligible: true });
  expect(() => assertTransition("REFUNDED", "APPROVED")).toThrow("Invalid after-sales status transition");
  ```

- [ ] **Step 2: Run policy tests to verify RED**

  Run: `pnpm --dir server test -- --run src/after-sales/__tests__/after-sales.policy.test.ts src/after-sales/__tests__/after-sales.validator.test.ts`

  Expected: FAIL because the policy module and schemas do not exist.

- [ ] **Step 3: Implement the smallest pure domain layer**

  Keep date arithmetic in UTC, return structured error codes/messages for ineligible cases, validate positive integer quantities, cap list limits to 100, validate ISO dates only where tests require them, and accept only the documented kind/status values.

- [ ] **Step 4: Run focused tests to verify GREEN**

  Run the same command and confirm every policy/validator test passes.

- [ ] **Step 5: Commit**

  ```powershell
  git add server/src/after-sales
  git commit -m "feat(after-sales): add eligibility policy"
  ```

### Task 3: Build the repository and service request workflow

**Files:**
- Create: `server/src/after-sales/after-sales.repository.ts`
- Create: `server/src/after-sales/after-sales.service.ts`
- Create: `server/src/after-sales/__tests__/after-sales.service.test.ts`
- Create: `server/src/after-sales/__tests__/after-sales.repository.test.ts`

**Interfaces:**
- Consumes: Task 1 tables and Task 2 policy/types.
- Produces: service methods `createCustomerRequest`, `createGuestRequest`, `listCustomerRequests`, `listGuestRequests`, `getCustomerRequest`, `getGuestRequest`, `listAdminRequests`, `getAdminRequest`, `transitionRequest`, and repository transaction helpers.

- [ ] **Step 1: Write failing service tests**

  Use a fake repository boundary, not SQL-string-only assertions, to prove:

  - customer ownership is passed into the transaction;
  - guest creation verifies the token hash against the order;
  - item quantities are checked against purchased and active requested quantities;
  - duplicate idempotency keys return the original request;
  - list methods return `{ requests, pagination }` and cap the limit;
  - missing/foreign records produce `404` or `403` without leaking order data.

- [ ] **Step 2: Run focused service tests to verify RED**

  Run: `pnpm --dir server test -- --run src/after-sales/__tests__/after-sales.service.test.ts src/after-sales/__tests__/after-sales.repository.test.ts`

  Expected: FAIL because the repository/service classes do not exist.

- [ ] **Step 3: Implement parameterized repository queries and transaction orchestration**

  Lock the order and selected order items with `FOR UPDATE` during create/refund-sensitive operations. Join order items only through the request’s order. Return normalized camelCase service objects while preserving snake_case response mapping conventions where existing APIs require them. Use count-plus-page queries with `LIMIT ? OFFSET ?` and a maximum limit of 100.

- [ ] **Step 4: Run focused tests to verify GREEN**

  Run the same command; then run `pnpm --dir server typecheck`.

  Expected: focused service/repository tests and typecheck pass.

- [ ] **Step 5: Commit**

  ```powershell
  git add server/src/after-sales
  git commit -m "feat(after-sales): add request service"
  ```

### Task 4: Expose customer, guest, and admin controllers with authorization

**Files:**
- Create: `server/src/after-sales/after-sales.controller.ts`
- Create: `server/src/after-sales/after-sales-guest.controller.ts`
- Create: `server/src/after-sales/after-sales-admin.controller.ts`
- Create: `server/src/after-sales/after-sales.module.ts`
- Modify: `server/src/app.module.ts`
- Modify: `server/src/middleware/rate-limit.middleware.ts` only if the established guest route group cannot cover the new path
- Create: `server/src/after-sales/__tests__/after-sales.controller.test.ts`
- Create: `server/src/after-sales/__tests__/after-sales.authorization.spec.ts`

**Interfaces:**
- Consumes: Task 3 service methods and existing `AuthGuard`, `RolesGuard`, `OwnerParam`, `ZodValidationPipe`, CSRF, and rate-limit middleware.
- Produces: the documented `/api/after-sales`, `/api/orders/guest/after-sales`, and `/api/admin/after-sales` endpoints, registered in `AppModule`.

- [ ] **Step 1: Write failing controller/authorization tests**

  Assert that customer routes have `AuthGuard`/customer role behavior, admin routes require `AuthGuard` plus `RolesGuard` and admin role, guest routes accept only the token-protected DTO, and response shapes contain no raw token or payment secret. Assert that invalid transitions map to HTTP 409 and ownership failures do not reveal whether a foreign request exists.

- [ ] **Step 2: Run focused controller tests to verify RED**

  Run: `pnpm --dir server test -- --run src/after-sales/__tests__/after-sales.controller.test.ts src/after-sales/__tests__/after-sales.authorization.spec.ts`

  Expected: FAIL because the controllers/module are not registered.

- [ ] **Step 3: Implement thin controllers and module wiring**

  Keep request parsing/response formatting in controllers and business rules in the service. Use explicit route prefixes to avoid collisions with existing `/orders/guest/*` routes. Apply the existing rate-limit middleware to all three controllers; retain CSRF for unsafe requests according to the current global setup.

- [ ] **Step 4: Run focused tests and server typecheck**

  Run the same test command and `pnpm --dir server typecheck`.

  Expected: tests pass and the module compiles.

- [ ] **Step 5: Commit**

  ```powershell
  git add server/src/after-sales server/src/app.module.ts server/src/middleware/rate-limit.middleware.ts
  git commit -m "feat(after-sales): expose protected request APIs"
  ```

### Task 5: Add audited admin transitions and refund confirmation

**Files:**
- Modify: `server/src/after-sales/after-sales.service.ts`
- Modify: `server/src/after-sales/after-sales.repository.ts`
- Modify: `server/src/payments/payment-provider.service.ts` only for a narrow typed refund result adapter if required by existing interfaces
- Create: `server/src/after-sales/__tests__/after-sales.refund.test.ts`
- Modify: `server/src/orders/__tests__/orders.lifecycle.test.ts` only if shared payment status behavior needs a regression assertion

**Interfaces:**
- Consumes: `PaymentProviderService`, `order_payments`, Task 2 transition policy, and Task 3 transaction helpers.
- Produces: `confirmRefund(requestId, actorId, input)` with idempotent manual/mock behavior and an append-only event for every status/refund change.

- [ ] **Step 1: Write failing refund tests**

  Cover a mock-provider refund, a live/unconfigured provider failure that leaves the request and payment unchanged, a repeated idempotency key returning the same result, a second different reference being rejected, currency mismatch, amount above the server-derived refundable amount, and a COD/manual confirmation path.

- [ ] **Step 2: Run refund tests to verify RED**

  Run: `pnpm --dir server test -- --run src/after-sales/__tests__/after-sales.refund.test.ts`

  Expected: FAIL because refund confirmation is not implemented.

- [ ] **Step 3: Implement transactional refund confirmation**

  Lock the request, order payment, and requested items. Derive the amount from snapshots and payment state. Call the existing provider abstraction only for mock behavior; for an unconfigured live provider, preserve the fail-closed error. Update `order_payments` exactly once, write `after_sales_events`, and transition the request to `REFUNDED` only after the ledger update succeeds.

- [ ] **Step 4: Run refund tests and server unit suite**

  Run the focused refund test, then `pnpm --dir server test -- --run`.

  Expected: all server unit tests pass.

- [ ] **Step 5: Commit**

  ```powershell
  git add server/src/after-sales server/src/payments server/src/orders/__tests__
  git commit -m "feat(after-sales): add auditable refund confirmation"
  ```

### Task 6: Document and integration-test the backend contract

**Files:**
- Modify: `docs/API.md`
- Modify: `docs/TESTING.md` if a new disposable fixture/setup command is needed
- Create: `server/src/after-sales/__tests__/after-sales.integration.test.ts`
- Modify: `server/src/flows/authz-flow.spec.ts` or create a focused flow spec under `server/src/after-sales` for cross-boundary authorization

**Interfaces:**
- Consumes: Tasks 1–5 public routes and database migration.
- Produces: documented request/response/error contracts and real MySQL coverage for create, list, transition, and refund paths.

- [ ] **Step 1: Write failing integration tests**

  Seed one delivered customer order, one delivered guest order, one canceled order, order items with different warranty snapshots, and payment rows. Test customer, guest, admin, pagination, seven-day eligibility, rejection, approval, and refund confirmation against disposable MySQL.

- [ ] **Step 2: Run integration tests to verify RED**

  Run: `pnpm --dir server test:integration -- after-sales.integration.test.ts`

  Expected: FAIL until the full route/migration contract is available.

- [ ] **Step 3: Add the API documentation and test fixture**

  Document exact payloads, safe guest fields, status transitions, 400/403/404/409 responses, pagination, CSRF requirements, and the manual refund boundary. Keep raw tokens and real credentials out of fixtures.

- [ ] **Step 4: Run the integration test to verify GREEN**

  Run the disposable MySQL baseline/migration setup from `docs/TESTING.md`, then the focused integration test and `pnpm --dir server prisma:migrate:status`.

  Expected: integration assertions pass and migration status is clean.

- [ ] **Step 5: Commit**

  ```powershell
  git add docs/API.md docs/TESTING.md server/src/after-sales
  git commit -m "test(after-sales): verify backend workflow contract"
  ```

### Task 7: Add client contracts and customer/guest request UI

**Files:**
- Create: `client/src/features/afterSales/types.ts`
- Create: `client/src/features/afterSales/api.ts`
- Create: `client/src/features/afterSales/api.test.ts`
- Create: `client/src/features/afterSales/pages/AfterSalesPage.tsx`
- Create: `client/src/features/afterSales/pages/AfterSalesPage.test.tsx`
- Create: `client/src/features/afterSales/components/AfterSalesRequestForm.tsx`
- Create: `client/src/features/afterSales/components/AfterSalesRequestForm.test.tsx`
- Modify: `client/src/features/orders/pages/GuestOrderLookupPage.tsx`
- Modify: `client/src/features/orders/pages/GuestOrderLookupPage.test.tsx`
- Modify: `client/src/features/orders/pages/OrderHistoryPage.tsx` and its test if the action belongs on order history
- Modify: `client/src/routes/router.tsx`
- Modify: `client/src/styles/index.scss`
- Create: `client/src/styles/features/after-sales/_after-sales.scss`

**Interfaces:**
- Consumes: Task 4 endpoint contracts and existing `http` client/session redirect behavior.
- Produces: typed customer API helpers, protected `/after-sales` route, guest request action from verified order lookup, form validation, timeline/status rendering, and pagination.

- [ ] **Step 1: Write failing client tests**

  Assert API helpers send exactly the documented customer/guest payloads and params. Assert the form blocks missing kind/reason/quantity, renders server 409 meaningfully, hides ineligible actions, preserves loading/empty/error states, and renders only safe guest data.

- [ ] **Step 2: Run client tests to verify RED**

  Run: `pnpm --dir client test -- --run src/features/afterSales/api.test.ts src/features/afterSales/pages/AfterSalesPage.test.tsx src/features/afterSales/components/AfterSalesRequestForm.test.tsx`

  Expected: FAIL because the feature files and route do not exist.

- [ ] **Step 3: Implement typed API helpers and UI**

  Reuse `client/src/lib/http.ts`, existing toast/status components, and feature styling conventions. Do not place business eligibility logic in the client; render the server-provided eligibility and conflict messages. Use the existing guest order lookup state rather than persisting raw tokens beyond the current guest order flow.

- [ ] **Step 4: Run focused tests and frontend typecheck**

  Run the focused tests, then `pnpm --dir client exec tsc -p tsconfig.json --noEmit`.

  Expected: tests pass and the client compiles.

- [ ] **Step 5: Commit**

  ```powershell
  git add client/src/features/afterSales client/src/features/orders/pages/GuestOrderLookupPage.tsx client/src/features/orders/pages/OrderHistoryPage.tsx client/src/routes/router.tsx client/src/styles
  git commit -m "feat(after-sales): add customer and guest request UI"
  ```

### Task 8: Add the paginated admin after-sales workspace

**Files:**
- Create: `client/src/features/admin/pages/AdminAfterSalesPage.tsx`
- Create: `client/src/features/admin/pages/AdminAfterSalesPage.test.tsx`
- Create: `client/src/features/admin/afterSalesApi.ts`
- Create: `client/src/features/admin/afterSalesApi.test.ts`
- Modify: `client/src/routes/router.tsx`
- Modify: `client/src/styles/features/admin/_shell.scss` or create `client/src/styles/features/admin/_after-sales.scss`
- Modify: `client/src/features/admin/pages/AdminDashboard.tsx` only if the new queue needs an existing dashboard action

**Interfaces:**
- Consumes: Task 4 admin list/detail/status/refund endpoints and existing `RequireAdmin`/admin table/status components.
- Produces: `/admin/after-sales` with filters, pagination, detail, legal transition controls, manual refund confirmation, and meaningful conflict/error states.

- [ ] **Step 1: Write failing admin UI/API tests**

  Cover query mapping, status/kind filters, page navigation, empty/error states, disabled controls during mutation, illegal-transition error copy, and a refund confirmation that requires a reference before submitting.

- [ ] **Step 2: Run focused tests to verify RED**

  Run: `pnpm --dir client test -- --run src/features/admin/afterSalesApi.test.ts src/features/admin/pages/AdminAfterSalesPage.test.tsx`

  Expected: FAIL because the admin API/page is not present.

- [ ] **Step 3: Implement the admin page**

  Follow existing `AdminSupportPage` and `AdminPaymentReconciliationPage` patterns, but keep pagination server-driven. Do not fetch all pages into memory. Show request identity, order, kind, status, delivery/eligibility, requested items, event timeline, payment state, and refund reference only to admins.

- [ ] **Step 4: Run focused tests, typecheck, and build**

  Run the focused tests, `pnpm --dir client exec tsc -p tsconfig.json --noEmit`, and `pnpm --dir client build`.

  Expected: all focused tests pass and the production client build succeeds.

- [ ] **Step 5: Commit**

  ```powershell
  git add client/src/features/admin client/src/routes/router.tsx client/src/styles
  git commit -m "feat(admin): add after-sales workspace"
  ```

### Task 9: Update Wiki and perform full verification

**Files:**
- Modify: `Wiki/index.md`
- Modify: `Wiki/log.md`
- Create or modify: `Wiki/entities/after-sales-request.md`
- Create or modify: `Wiki/sources/after-sales-runtime.md`
- Modify: `Wiki/synthesis/commerce-journey.md`
- Modify: `docs/API.md` and `docs/TESTING.md` if verification changes any contract details

**Interfaces:**
- Consumes: completed backend/client workflow and verification output.
- Produces: concise long-term documentation with backlinks, current date, and no duplicated source code.

- [ ] **Step 1: Write documentation verification checklist**

  Check that the Wiki explains identity modes, eligibility, state transitions, refund boundary, guest-safe data, admin ownership, and current non-goals; check that `Wiki/index.md` links the new pages and `Wiki/log.md` has one dated entry.

- [ ] **Step 2: Run documentation checks to verify RED if links are absent**

  Run: `rg -n "after-sales-request" Wiki/index.md Wiki/synthesis/commerce-journey.md Wiki/entities Wiki/sources`

  Expected: the new backlinks are absent before edits.

- [ ] **Step 3: Update the Wiki and API docs**

  Add only intent, contracts, relationships, and operational boundaries; do not copy implementation bodies.

- [ ] **Step 4: Run the complete verification set**

  Run:

  ```powershell
  pnpm --dir server prisma:validate
  pnpm --dir server typecheck
  pnpm --dir server lint
  pnpm --dir server test -- --run
  pnpm --dir server build
  pnpm --dir client exec tsc -p tsconfig.json --noEmit
  pnpm --dir client lint
  pnpm --dir client test -- --run
  pnpm --dir client build
  ```

  When disposable MySQL is available, also run the full server integration suite, `demo:verify`, and `prisma:migrate:status`. Run browser E2E against local client/server for customer, guest, and admin paths before claiming completion.

- [ ] **Step 5: Commit**

  ```powershell
  git add Wiki docs/API.md docs/TESTING.md
  git commit -m "docs(after-sales): document operational workflow"
  ```

## Final branch review

After all tasks, review `git diff main...HEAD`, inspect the migration SQL, verify no secrets/generated output are staged, and run the fresh verification commands required by `superpowers:verification-before-completion`. Create the PR only after the branch is clean and all available checks are recorded.
