# Task 6 implementation report

## Status

DONE_WITH_CONCERNS

Task 6 is implemented on `feature/guest-cart-checkout`. The change is limited to
the client cart entry points, public cart route/state handling, localized cart
error copy, focused tests, and the justified CartContext result compatibility
bridge described below.

## Commit

`96b13cc feat(client): allow guest cart additions`

## Files in the commit

- `client/src/components/common/PaginatedItems.tsx`
- `client/src/components/common/__tests__/GuestCartEntryPoints.test.tsx`
- `client/src/components/common/__tests__/ShopAndProductDetailSurface.test.tsx`
- `client/src/context/CartContext.tsx`
- `client/src/context/__tests__/CartContext.test.tsx`
- `client/src/features/orders/pages/CartPage.test.tsx`
- `client/src/features/orders/pages/CartPage.tsx`
- `client/src/features/products/api.ts`
- `client/src/features/products/pages/ProductPage.tsx`
- `client/src/i18n/en.ts`
- `client/src/i18n/vi.ts`
- `client/src/pages/HomePage.tsx`
- `client/src/routes/router.test.tsx`
- `client/src/routes/router.tsx`
- `client/src/styles/features/orders/_cart.scss`

## Behavior

- Home, catalog, and product-detail add-to-cart actions call the shared
  `CartContext.addItem` mutation for both guests and authenticated users.
- The direct product-page cart API helper was removed; authenticated behavior
  remains owned by CartContext and its existing server path.
- Wishlist and review behavior remains authenticated-only.
- `/cart` is public; account, wishlist, address, notification, order-history,
  checkout-success, and admin routes remain protected as before.
- Public cart rendering now has explicit loading, empty, recoverable error with
  retry, and server-authoritative unavailable/stock validation states.
- English and Vietnamese retry/error strings and responsive cart state styling
  were added without introducing a framework or dependency.

## CartContext compatibility reason

The brief does not list `CartContext.tsx`, so this was reviewed explicitly.
Task 5's `addItem` catches guest preview and authenticated mutation failures and
resolves `void`. After Task 6 routes all entry points through that method, a
page could otherwise show a success toast after CartContext had already handled
an error. The minimal compatibility change makes `addItem` return `true` only
when the mutation/guest preview succeeds and `false` for invalid input, source
invalidation, or handled failure. It preserves Task 5 storage, preview,
authenticated endpoint, merge, and error-state behavior; it only exposes the
outcome needed to preserve Task 6 success/error feedback. A focused regression
test covers failed guest preview adds.

## TDD evidence

- RED: new entry-point, route, cart-state tests failed against the pre-change
  implementation; the CartContext feedback test first observed `undefined`
  instead of `false`.
- GREEN: focused Task 6 tests passed after implementation; the final full suite
  passed with 33 files and 171 tests.

## Verification

- `pnpm --dir client exec vitest run src/components/common/__tests__/GuestCartEntryPoints.test.tsx src/routes/router.test.tsx src/features/orders/pages/CartPage.test.tsx`
  — passed, 7 tests.
- `pnpm --dir client exec vitest run src/context/__tests__/CartContext.test.tsx src/components/common/__tests__/GuestCartEntryPoints.test.tsx src/routes/router.test.tsx src/features/orders/pages/CartPage.test.tsx`
  — passed, 4 files and 25 tests.
- `pnpm --dir client test -- --run` — passed, 33 files and 171 tests.
- `pnpm --dir client exec tsc -p tsconfig.json --noEmit` — passed.
- `pnpm --dir client lint` — passed with 52 existing `@typescript-eslint/no-explicit-any` warnings in unrelated/pre-existing code.
- `pnpm --dir client build` — passed.
- `git diff --cached --check` — passed before commit/amend.

## Assumptions

- Task 5's CartContext remains the source of truth for guest localStorage,
  guest preview, authenticated server mutations, and cart refresh behavior.
- Guest checkout, checkout success, order lookup, and all Task 7 behavior remain
  out of scope.
- Existing jsdom/Vitest setup is the available responsive test setup; no browser
  viewport smoke test was added.

## Concerns

- The client lint command still reports 52 pre-existing `no-explicit-any`
  warnings.
- Vitest and Vite emit the existing warning that the CommonJS-loaded TypeScript
  config uses ESM syntax with the upcoming native config loader.
- No Playwright/browser viewport verification was available in the existing
  client test setup; desktop/mobile layout changes were kept within the
  existing responsive SCSS conventions.

## Worktree safety

Only the listed Task 6 client files were committed. Existing unrelated dirty
server, CI, Wiki, docs, and demo-seed files were not staged, edited, reverted,
or committed by this task.

## Fix

### Status

DONE_WITH_CONCERNS. All Important review findings are resolved. The fix commit
uses `fix(client): make guest cart feedback truthful`; its hash is reported in
the task handoff.

### Files

- `client/src/components/layout/Header.tsx`
- `client/src/components/layout/Header.test.tsx`
- `client/src/context/CartContext.tsx`
- `client/src/context/__tests__/CartContext.test.tsx`
- `client/src/pages/HomePage.tsx`
- `client/src/components/common/PaginatedItems.tsx`
- `client/src/components/common/__tests__/GuestCartEntryPoints.test.tsx`
- `client/src/features/products/pages/ProductPage.tsx`
- `client/src/routes/router.test.tsx`
- `.superpowers/sdd/task-6-report.md`

### Verification

- Focused tests: passed, 4 files and 32 tests.
- `pnpm --dir client test -- --run`: passed, 34 files and 180 tests.
- `pnpm --dir client exec tsc -p tsconfig.json --noEmit`: passed.
- `pnpm --dir client lint`: passed with 52 pre-existing `no-explicit-any` warnings.
- `pnpm --dir client build`: passed.
- `git diff --check`: passed before staging.

### Finding resolution

1. All three guest Header cart controls now navigate directly to public
   `/cart`; protected account, wishlist, notification, and other actions keep
   their login guards. Header tests cover desktop, profile-menu, and mobile
   cart access, while router tests retain wishlist protection.
2. `CartContext.addItem` now returns false for failed guest previews,
   invalid/issue previews, and authenticated refresh failures. Home, catalog,
   and product-detail entry points show error feedback and never show success
   when the mutation returns false.
3. Regression coverage now covers failed guest preview, invalid guest preview,
   authenticated refresh failure, false-result entry-point feedback, Header
   navigation, and protected wishlist routing.

### Concerns

- Lint retains the existing 52 unrelated `no-explicit-any` warnings.
- Vitest/Vite retain the existing CommonJS-loaded TypeScript config warning.
- No browser viewport run was available; desktop/mobile Header behavior is
  covered by focused jsdom tests and existing responsive styles.
