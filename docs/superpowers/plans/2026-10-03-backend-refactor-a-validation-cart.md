# Backend validation and cart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove duplicate validation ownership and simplify cart asynchronous orchestration without changing HTTP behavior.

**Architecture:** Feature validators remain authoritative; shared validation becomes a compatibility facade plus its existing helpers. CartRepository exposes typed promises while NestCartService preserves the same SQL sequencing and business checks.

**Tech Stack:** Existing NestJS, TypeScript, MySQL2, Zod and Vitest; Node 24.20.0 / pnpm 12.4.2 as pinned by AGENTS.md.

**Spec:** `docs/superpowers/specs/2026-10-03-backend-refactor-design.md`, Batch A.

## Global Constraints

- No new dependencies, schema changes, production operations, commits, or pushes.
- Preserve routes, aliases, payload keys, HTTP statuses, error messages, ordering, pagination semantics, and the unpaginated product response.
- Preserve guards, ownership, CSRF, cookie flow, and Firebase verification.
- No API-wide normalization, neighboring repository conversion, or dependency installation.
- Require approval for `server/src/cart/cart.repository.ts`, classified high; never manufacture loop approval records.
- Preserve existing client and scripts/loop changes; edits belong only to the paths listed here and the Wiki paths below.
- Execution is bounded by canonical stop conditions: 25 files / 1,000 changed lines / 1,800 seconds / 5 iterations / 2 same failures / 3 flaky retries. Measure the actual run diff; do not reset counters or treat a new task heading as a new run.

## Review Focus

1. Re-exported schemas must be the route's actual schema, including discountCode (Task 1).
2. Firebase schemas must retain Firebase-only inputs; stale shared auth shapes must not redefine route behavior (Task 1).
3. Empty cart/product results resolve without hanging or issuing invalid SQL (Task 2).
4. DB rejection propagates and prevents later mutations (Task 2).
5. Update/delete retain user ownership and zero-affectedRows not-found behavior (Task 2).

## Execution and verification

Recommended method: native in this chat; user selection remains pending. Read the spec and relevant files before each task. Run `pnpm --dir server exec vitest run` with the task's selectors from the repository root. If pnpm hits NO_TTY, run `./node_modules/.bin/vitest.cmd run` with identical selectors from `server/`; do not implicitly reinstall.

At the end run `pnpm --dir server typecheck`, `pnpm --dir server lint`, `pnpm --dir server build`, `pnpm --dir server test -- --run`. Package-local tsc/eslint/vitest can verify corresponding checks if pnpm is unavailable; build still needs its complete generation/compile/assets sequence. Report toolchain deviations and unavailable checks. No integration target is assumed available.

### Task 1: authoritative schema facade

**Files:** Modify `server/src/shared/validation/request-schemas.ts`; test `server/src/shared/validation/request-schemas.test.ts`. Read all owning validators without changing them.

**Interfaces:** Keep `parseBody<T extends z.ZodType>(schema: T, body: unknown): z.infer<T>` and `getValidationMessage(error: unknown): string`. Preserve exported names through direct re-exports:

- cartAddItemSchema, cartDeleteItemSchema, cartUpdateQuantitySchema from `cart/cart.validator`.
- promotionSchema from `promotions/promotions.validator`; addressSchema from `addresses/addresses.validator`.
- adminUserUpdateSchema from `users/users.validator`.
- orderStatusSchema, purchaseSchema, applyDiscountSchema from `orders/orders.validator`.
- productCreateSchema, productUpdateSchema, inventoryUpdateSchema from `products/products.validator`.
- userLoginSchema, registerUserSchema from `auth/auth.validator`.

- [ ] Capture fresh shared-validation and cart baselines and inspect each validator's imports for cycles.
- [ ] Add assertions that shared/feature exports are the same object for all names; `purchaseSchema.parse(validPurchaseWithDiscountCode).discountCode === "SAVE10"`; Firebase login/register use the existing feature schemas; structured product attributes survive validation. Keep existing unsupported-payment checks and getValidationMessage expectations.
- [ ] Run `vitest run src/shared/validation/request-schemas.test.ts`; confirm new equivalence/discount assertions fail against duplicate schemas.
- [ ] Replace schema definitions with the explicit re-exports above, retaining helpers and their error formatting. The shared facade is compatibility-only; new callers import feature validators.
- [ ] Run `vitest run src/shared/validation/request-schemas.test.ts src/auth/auth-flow.spec.ts src/orders/checkout-flow.spec.ts src/products/__tests__/products.service.test.ts`; require zero failed tests. Check import cycles and route schemas remained unchanged.

### Task 2: Promise-returning CartRepository

**Files:** Modify `server/src/cart/cart.repository.ts`, `server/src/cart/cart.service.ts`; test `server/src/cart/__tests__/cart.repository.test.ts`, `cart.service.test.ts`, `cart.stock.service.test.ts`, `cart.not-found.service.test.ts`, `guest-cart-preview.test.ts` (all under that same test directory).

**Interfaces:** Remove each callback argument. Keep existing arguments and SQL; return:

| Existing method | Promise result |
| --- | --- |
| addItemToCartByUserId(uid, pid, quantity), addItemToCart(cartId, pid, quantity) | UpdateResult |
| getCartIdByUserId(uid), getCartItemsByUserId(uid) | CartRow[] |
| getCartItemQuantityByUserId(uid, pid), getCartItemsDetails(cartId), getCheckoutCartItemsDetails(cartId), getGuestCartPreviewItems(productIds), getCartItemStock(cartItemId, uid) | CartItemRow[] |
| updateCartItemQuantity(cartItemId, uid, quantity), deleteCartItem(cartItemId, uid) | UpdateResult |

Argument types remain their current string/number/number[] types. Wrap the pool callback once within CartRepository using a private typed query helper; keep existing query behavior rather than introducing a new driver abstraction.

- [ ] Add repository tests for promise resolution, DB rejection, empty product IDs without pool calls, and exact owner-scoped SQL parameters. These fail before callback removal.
- [ ] Add service characterization tests for empty carts, adding to an existing item, DB error at each write stage, stock conflict, missing/deleted items, and exact success messages. Update test doubles to return promises in the implementation step, not to hide baseline behavior.
- [ ] Run `vitest run src/cart/__tests__`; confirm only tests requiring the new Promise contract fail.
- [ ] Implement repository signatures and replace only its callback wrappers in NestCartService with await. Preserve mutation order and zero-affectedRows checks. Keep explicit wrappers around GuestCartRepository and PromotionsRepository, whose APIs are outside this task.
- [ ] Adapt the listed test doubles; run the complete cart suite plus `src/orders/checkout-flow.spec.ts`; require zero failed tests. Inspect all production CartRepository callers for callbacks left behind.
- [ ] Update `Wiki/architecture.md`, `Wiki/index.md`, `Wiki/log.md` for feature-owned validation and cart Promise boundaries; preserve unrelated Wiki content.
- [ ] Run the plan's final checks and review its exact diff; do not commit. Stop before another plan if cumulative run budget would be exceeded.

## Handoff

Report exact edited paths, command results, existing environment failures, and any remaining callbacks in neighboring APIs. Plan B and C are independently reviewable deliverables; this plan does not authorize silently starting a fresh loop run or resetting budgets.
