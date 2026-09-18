# Wishlist price-drop and back-in-stock alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add owner-scoped wishlist alert preferences and transactional in-app price-drop/back-in-stock notifications.

**Architecture:** Keep the feature inside the existing raw-MySQL Wishlist module. A reusable `WishlistAlertsService` receives the before/after product state and writes preference state plus notification rows through the caller's `TransactionContext`; Products and Orders call it from their existing stock/price transactions. The additive Prisma migration creates the alert preference table and notification metadata column without replacing the legacy Wishlist persistence path. The client adds a compact alert-control panel to each wishlist item and maps alert metadata to the existing EN/VI notification surface.

**Tech Stack:** NestJS 11, TypeScript, MySQL transaction repositories, React 19, Vitest/Testing Library, SCSS, existing auth/CSRF/i18n/theme infrastructure.

## Global Constraints

- Use MySQL as the runtime persistence path; do not introduce a Prisma model for the legacy Wishlist tables.
- Preserve `AuthGuard`, `RolesGuard`, `OwnerParam`, CSRF, existing response keys, and the independent client/server pnpm packages.
- Use parameterized SQL and server-derived price/stock values; never trust client baselines.
- Add English and Vietnamese copy through the existing dictionary contract and reuse theme tokens with explicit focus, disabled, checked, and error states.
- Preserve unrelated dirty worktree changes and do not commit or push in this task.

---

### Task 1: Add the alert data contract and transactional processor

**Files:**
- Create: `server/src/database/prisma/migrations/20260918000000_wishlist_alerts/migration.sql`
- Create: `server/src/wishlist/wishlist-alerts.types.ts`
- Create: `server/src/wishlist/wishlist-alerts.repository.ts`
- Create: `server/src/wishlist/wishlist-alerts.service.ts`
- Modify: `server/src/wishlist/wishlist.module.ts`
- Modify: `server/src/notifications/notifications.repository.ts`
- Modify: `server/src/notifications/notifications.types.ts`
- Modify: `server/src/notifications/notifications.service.ts`
- Test: `server/src/wishlist/wishlist-alerts.service.spec.ts`

**Interfaces:**
- Consumes: `TransactionContext`, `{ productId, productName, priceBefore, salePriceBefore, stockBefore, priceAfter, salePriceAfter, stockAfter }`.
- Produces: `WishlistAlertsService.processProductChangeInTransaction(tx, change)`, `WishlistAlertsRepository.updatePreference(...)`, and `WishlistAlertsRepository.setPreferenceState(...)`.

- [x] **Step 1: Write the failing unit tests** for effective sale-price comparison, one price-drop notification below baseline, and one back-in-stock notification for a `0 -> positive` transition.
- [x] **Step 2: Run `pnpm --dir server exec vitest run src/wishlist/wishlist-alerts.service.spec.ts` and confirm the missing service/behavior failure.**
- [x] **Step 3: Add the migration, alert types, repository queries, metadata-aware notification row contract, and the minimal transactional service implementation.** The service locks enabled preference rows, updates baseline/state in the same transaction, and inserts `wishlist_price_drop` or `wishlist_back_in_stock` only when the acceptance conditions are met.
- [x] **Step 4: Re-run the focused Vitest test and then `pnpm --dir server typecheck`.**

### Task 2: Wire every active product and stock mutation

**Files:**
- Modify: `server/src/products/products.module.ts`
- Modify: `server/src/products/products.service.ts`
- Modify: `server/src/orders/orders.module.ts`
- Modify: `server/src/orders/orders.service.ts`
- Modify: `server/src/orders/checkout-reservation.repository.ts`
- Test: `server/src/products/products.service.spec.ts` or the nearest existing product service test surface

**Interfaces:**
- Consumes: `WishlistAlertsService.processProductChangeInTransaction` from Task 1.
- Produces: price-drop/back-in-stock processing for admin edits, quick inventory edits, paid checkout, COD checkout, and canceled-order restock.

- [x] **Step 1: Add a failing regression test or focused spy assertion proving a stock transition invokes the alert processor with before/after prices and stock.**
- [x] **Step 2: Run the focused server test and confirm it fails before wiring.**
- [x] **Step 3: Inject `WishlistAlertsService`, select the required price/name fields while locking products, and call it after each product stock/price update but before transaction commit.**
- [x] **Step 4: Run the focused test, `pnpm --dir server typecheck`, and `pnpm --dir server build`.**

### Task 3: Expose preferences and build the wishlist controls

**Files:**
- Modify: `server/src/wishlist/wishlist.validator.ts`
- Modify: `server/src/wishlist/wishlist.controller.ts`
- Modify: `server/src/wishlist/wishlist.repository.ts`
- Modify: `server/src/wishlist/wishlist.service.ts`
- Modify: `client/src/pages/WishlistPage.tsx`
- Modify: `client/src/components/common/WishlistItem.tsx`
- Modify: `client/src/styles/pages/_wishlist.scss`
- Modify: `client/src/i18n/en.ts`
- Modify: `client/src/i18n/vi.ts`
- Test: `client/src/components/common/__tests__/WishlistItem.test.tsx`

**Interfaces:**
- Consumes: `PATCH /api/wishlist/:pid/alerts` and the GET preference fields from Task 1.
- Produces: explicit `Price drop` and `Back in stock` controls with per-item loading/error feedback and accessible state.

- [x] **Step 1: Write a failing component test for rendering both labeled controls and calling the update callback with the correct boolean payload.**
- [x] **Step 2: Run `pnpm --dir client exec vitest run src/components/common/__tests__/WishlistItem.test.tsx` and confirm the new control is absent.**
- [x] **Step 3: Add the Zod payload schema, owner-scoped controller/service/repository update, GET mapping, i18n strings, controlled client state, and theme-safe responsive styles.**
- [x] **Step 4: Run the component test and `pnpm --dir client exec tsc -p tsconfig.json --noEmit`.**

### Task 4: Localize notification rendering, update knowledge, and verify the browser flow

**Files:**
- Modify: `client/src/features/users/types.ts`
- Modify: `server/src/notifications/notifications.repository.ts`
- Modify: `server/src/notifications/notifications.types.ts`
- Modify: `Wiki/index.md`
- Modify: `Wiki/log.md`
- Create: `Wiki/concepts/wishlist-alerts.md`
- Test: existing users notification tests and the new wishlist component/service tests

**Interfaces:**
- Consumes: metadata-bearing notification rows and `wishlist_price_drop`/`wishlist_back_in_stock` types.
- Produces: localized notification title/message rendering and durable project knowledge.

- [x] **Step 1: Add a failing normalization/rendering assertion for alert metadata and locale-specific copy.**
- [x] **Step 2: Run the focused client/server tests and confirm the metadata contract is not yet represented.**
- [x] **Step 3: Return metadata from the API, extend the client type/notification rendering, update the Wiki index/log/concept page, and keep existing order notifications unchanged.**
- [x] **Step 4: Run the relevant client/server tests, client build, and Playwright checks for wishlist at desktop/mobile widths in EN/VI and light/dark themes, including keyboard focus and no horizontal overflow.**

## Implementation notes

- Wishlist alert controls are intentionally compact: exactly two checkbox-label pairs per item, with per-item error feedback and responsive stacking on narrow screens.
- Product rows keep the image, product summary, stock state, and alert controls in one cohesive content column; price and actions use stable desktop columns and full-width mobile actions.
- Header navigation now reserves a visible gap before the search field, and the theme control is icon-only visually while retaining an accessible `aria-label` and labeled menu options.
- Browser checks covered 1920px desktop and 390px mobile in light/dark states. No horizontal overflow, clipped product names, clipped alert labels, or wrapped action-button text was observed.

## Verification record

- `pnpm --dir server test -- --run`: passed — 71 files, 352 tests.
- `pnpm --dir server typecheck`: passed.
- `pnpm --dir server build`: passed.
- `pnpm --dir client exec vitest run src/features/users/pages/CustomerAccountPage.test.tsx src/components/common/__tests__/WishlistItem.test.tsx`: passed — 2 files, 5 tests.
- `pnpm --dir client exec tsc -p tsconfig.json --noEmit`: passed.
- `pnpm --dir client build`: passed.
- Playwright wishlist checks: passed for 1920px and 390px, EN/VI, light/dark, focus/checked states, and horizontal-overflow assertions.
- The broader client suite still has five unrelated timeout failures in ContactUs, AdminDashboard, Login, and Signup tests; those are not part of this feature's changed surface.

## Self-review

- Spec coverage: data migration and transactional processor are Task 1; all active mutation paths are Task 2; API/UI and EN/VI are Task 3; notification rendering, Wiki, and browser evidence are Task 4.
- Placeholder scan: no task relies on a future decision or unspecified file; commands and owned paths are concrete.
- Type consistency: Task 1 defines `processProductChangeInTransaction`; Task 2 consumes that exact method; Task 3 consumes the response booleans; Task 4 consumes the metadata-bearing notification row.
