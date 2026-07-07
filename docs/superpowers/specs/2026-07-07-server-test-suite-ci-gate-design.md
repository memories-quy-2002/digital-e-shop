# Server test suite + CI gate — design

Date: 2026-07-07
Status: Approved

## Goal

Stand up a server-side Vitest harness (none exists today) and write focused
unit tests on the money-handling paths — checkout validation, overselling
prevention, cart-tampering detection, discount lookup, and inventory movement
mapping — then wire them into the existing CI gate so the `server` job runs
them on every push and pull request to `main`.

Resume framing: "Established GitHub Actions CI (typecheck/lint/test) with
branch protection; authored unit tests for checkout and inventory flows,
including overselling and cart-tampering prevention."

## Context (current state)

- **Client** has Vitest configured + one test (`client/src/utils/__tests__/images.test.ts`).
  CI runs `pnpm --filter client test -- --run`.
- **Server** has no test harness at all: no `vitest.config`, no `test` script,
  and CI runs no server tests. The `server` CI job today only typechecks,
  lints, and builds.
- The highest-value logic lives in:
  - `server/src/modules/cart/cart.service.ts` — pure functions
    `buildCartValidationIssue`, `buildCartValidationResult`,
    `compareSubmittedCart` (out-of-stock / insufficient-stock detection and
    submitted-vs-authoritative cart mismatch detection). Currently **not
    exported**.
  - `server/src/modules/inventory/inventory.service.ts` — pure
    `normalizeMovement` mapping. Currently **not exported**.
  - `server/src/modules/orders/orders.service.ts` — `makePurchase`
    orchestration: transaction, `SELECT ... FOR UPDATE` stock lock, stock
    validation, single CASE stock decrement, commit, and post-commit side
    effects. CommonJS `require`-based with deep DB coupling.

## Approach: unit tests with mocked DB

Chosen over live-DB integration tests: fast, no database in CI, no flakiness,
best resume signal per hour. Integration tests against the new Docker MySQL are
a documented future follow-up, out of scope here.

### Harness

- Add `server/vitest.config.ts` — **node** environment (not jsdom like client),
  globals enabled.
- Add `"test": "vitest"` to `server/package.json` scripts and `vitest` to its
  devDependencies.
- Tests live under `server/src/**/__tests__/*.test.ts`, matching the client's
  `__tests__/` convention.

### Testability change (minimal, behavior-preserving)

Export the pure helpers so tests can reach them directly:

- `cart.service.ts`: add `buildCartValidationIssue`, `buildCartValidationResult`,
  `compareSubmittedCart` to `module.exports`.
- `inventory.service.ts`: add `normalizeMovement` to `module.exports`.

No logic changes — only additional exports.

### CI wiring

Add a `Test` step to the `server` job in `.github/workflows/ci.yml`:
`pnpm --filter server test -- --run`. This makes the server CI job verify logic
rather than only typecheck/lint/build.

## Test coverage (~15–25 tests)

**A. Pure functions (no mocking):**

- `buildCartValidationIssue`: returns `null` for a valid line; `unavailable`
  for missing/null stock; `out_of_stock` when stock ≤ 0; `insufficient_stock`
  when requested > available.
- `buildCartValidationResult`: `valid` only when non-empty and zero issues;
  aggregates issues; empty cart is invalid.
- `compareSubmittedCart` (tampering/overselling story): detects
  `quantity_changed`, `price_changed`, `missing_item`, `unexpected_item`, and
  `total_changed`; computes authoritative total from server-side prices
  (preferring sale price); clean cart yields no mismatches.
- `normalizeMovement`: numeric coercion, null-preserving fields
  (`order_id`, `stock_before`, `stock_after`), default `quantity_change` 0.

**B. `makePurchase` orchestration — DESCOPED (see "Constraint discovered").**

The overselling/oversell-guard *logic* is still covered by the pure
`buildCartValidationIssue` and `compareSubmittedCart` tests above.

## Constraint discovered during implementation

`makePurchase` (and `applyDiscount`) load their collaborators with CommonJS
`require("...")` (e.g. `const cartService = require("#src/modules/cart/cart.service")`).
Vitest's `vi.mock` **only intercepts `import`, not `require`** (per Vitest
docs). The pure-function tests work because those functions never invoke the
`require`d dependencies — the modules only need to *load*. But orchestration
tests require the collaborators to be *mocked*, which is not possible without
one of:

- refactoring `orders.service.ts` (and its deps) from `require` to ESM
  `import`, touching critical checkout code; or
- integration testing `makePurchase` against a live database.

Both were out of scope for this task (the user chose to ship the pure-logic
suite and defer orchestration testing). This is recorded as a follow-up below.

## Success criteria

- `pnpm --filter server test -- --run` passes locally and in CI.
- The `server` CI job runs tests; a deliberately broken assertion fails the
  gate (verified once, then reverted).
- Coverage includes overselling prevention, empty/invalid-cart rejection,
  cart-tampering detection, discount lookup, and inventory movement mapping.

## Risks

- **CommonJS + Vitest interop**: the target modules use `require` and
  `module.exports`. De-risk by getting one import + one assertion green before
  writing the full suite.
- **`makePurchase` mocking depth**: it promisifies `pool.getConnection` and the
  connection's `query`/`beginTransaction`/`commit`/`rollback`, and `require`s
  cart/inventory/notification/timeline services. Mock the pool and those
  services; assert on transaction-control call order for the overselling
  guarantee.

## Out of scope

- Live-DB integration tests (future follow-up against Docker MySQL).
- Frontend tests beyond what already exists.
- Any change to checkout/inventory runtime behavior.

## Follow-ups

- Test `makePurchase` orchestration (transaction, `FOR UPDATE` stock lock,
  commit/rollback, post-commit side effects) either by (a) converting
  `orders.service.ts` and its collaborators from `require` to ESM `import` so
  `vi.mock` can intercept them, or (b) an integration test against the Docker
  MySQL environment.
