# Shops, Product Detail, and Demo Catalog Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair Shops pagination, align Product Detail purchase controls, improve Reviews styling, and make the local demo catalog contain only named products with complete images.

**Architecture:** Keep the existing React/SCSS boundaries. The pagination component will keep its current `react-paginate` contract while its styles target the classes it actually renders. Product Detail will receive layout-only BEM styles. The MySQL demo seed will remove only legacy catalog fixtures whose names match the identified `E2E`/`Demo` patterns, then the verifier will assert zero legacy products and one image for every canonical product.

**Tech Stack:** React 19, TypeScript, SCSS, Vitest, Express/Nest server package, MySQL, CommonJS demo seeders.

## Global Constraints

- Do not create a worktree or touch `main`.
- Preserve unrelated dirty-worktree changes.
- Use existing product image slugs and `loadImage`/image URL conventions; do not add image dependencies.
- Never run demo cleanup against a non-local database; preserve `assertLocalDatabaseTarget`.
- Do not truncate unrelated users, orders, or catalog rows.

---

### Task 1: Add regression coverage for UI contracts

**Files:**
- Create: `client/src/components/common/__tests__/ShopAndProductDetailSurface.test.tsx`
- Modify: `server/src/database/seeders/demoSeedData.test.ts`

**Interfaces:**
- UI tests assert the rendered pagination classes, purchase-control grouping, and review section structure.
- Seed tests assert reserved product-name rejection and complete image metadata.

- [ ] **Step 1: Write failing tests**

Add assertions for `.shops__pagination`, `.pagination__item`, `.pagination__link`, `product-page__quantity-field`, `product-page__availability`, and `product-page__reviews-card`. Add a seed-plan case that renames one product to `Demo Camera Fixture` and expects `validateDemoSeedPlan` to reject it.

- [ ] **Step 2: Run the focused tests and confirm the expected failures**

Run from `client/`:

```powershell
node node_modules/vitest/vitest.mjs run src/components/common/__tests__/ShopAndProductDetailSurface.test.tsx
```

Run from `server/`:

```powershell
node node_modules/vitest/vitest.mjs run src/database/seeders/demoSeedData.test.ts
```

Expected: the new class/name assertions fail because the current UI and seed validator do not provide the new contracts.

### Task 2: Repair Shops pagination styling

**Files:**
- Modify: `client/src/styles/pages/_shops.scss`
- Modify: `client/src/App.scss`
- Test: `client/src/components/common/__tests__/ShopAndProductDetailSurface.test.tsx`

- [ ] **Step 1: Replace stale selectors**

Style the actual `react-paginate` output under `.shops__pagination`: `ul` reset, centered gap, `li` sizing, link alignment, selected/break/disabled states, Previous/Next labels, keyboard focus, and mobile wrapping. Remove the unused `.shops__container__main__pagination__items` block from `App.scss` so it cannot introduce a competing legacy visual language.

- [ ] **Step 2: Run the focused UI test and client build**

```powershell
node node_modules/vitest/vitest.mjs run src/components/common/__tests__/ShopAndProductDetailSurface.test.tsx
node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit
```

### Task 3: Align Product Detail purchase controls and Reviews

**Files:**
- Modify: `client/src/features/products/pages/ProductPage.tsx`
- Modify: `client/src/styles/pages/_product.scss`
- Test: `client/src/components/common/__tests__/ShopAndProductDetailSurface.test.tsx`

- [ ] **Step 1: Make availability a named sibling control**

Keep `Quantity` as the accessible label for the input, but render the stock message in a dedicated `.product-page__availability` element. Give the actions grid explicit aligned rows, make the quantity field and buttons share a control height, and keep the stock message from affecting button baseline alignment.

- [ ] **Step 2: Rebuild Reviews layout with stable sub-blocks**

Use separate grid areas for score, distribution bars, review form, list header, review rows, stars, and empty/login states. Add responsive stacking under 560px, visible focus styles for rating buttons, and consistent metadata/date wrapping.

- [ ] **Step 3: Run the focused tests and lint**

```powershell
node node_modules/vitest/vitest.mjs run src/components/common/__tests__/ShopAndProductDetailSurface.test.tsx
node node_modules/eslint/bin/eslint.js src/features/products/pages/ProductPage.tsx src/components/common/__tests__/ShopAndProductDetailSurface.test.tsx
```

### Task 4: Harden the local demo seed catalog

**Files:**
- Modify: `server/src/database/seeders/demoSeedData.js`
- Modify: `server/src/database/seeders/seedDemo.js`
- Modify: `server/src/database/seeders/verifyDemo.js`
- Modify: `server/src/database/seeders/demoSeedData.test.ts`

- [ ] **Step 1: Reject reserved fixture names and empty image slugs**

For every canonical product, reject a name containing the standalone words `E2E` or `Demo`, and keep the existing non-empty `mainImage` validation.

- [ ] **Step 2: Remove only legacy local catalog fixtures**

Before the existing relationship seeding, query products matching `LOWER(name) LIKE '%e2e%' OR LOWER(name) LIKE '%demo%'`, delete their product-scoped dependent rows (`product_attributes`, `inventory_reservations`, `cart_items`, `order_items`, `reviews`, `wishlist`, `inventory_movements`), and then delete those products. The seed remains guarded by `assertLocalDatabaseTarget` and does not truncate the database.

- [ ] **Step 3: Verify canonical coverage and zero legacy names**

Add `legacyProducts: 0` to `verifyDemo.js` and keep `productImages: 28`; a seed verification must fail if any canonical product is missing `main_image` or any legacy product remains.

- [ ] **Step 4: Run seed-plan tests and local seed verification**

```powershell
node node_modules/vitest/vitest.mjs run src/database/seeders/demoSeedData.test.ts
pnpm.cmd prisma:seed
pnpm.cmd demo:verify
```

Expected verification includes `products: 28`, `productImages: 28`, `legacyProducts: 0`, and zero orphan/gap counts.

### Task 5: Full review and verification

**Files:**
- Review: all files above and `git diff --check`

- [ ] **Step 1: Run the complete client checks**

```powershell
node node_modules/vitest/vitest.mjs run
node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit
node node_modules/eslint/bin/eslint.js src --ext .js,.mjs,.cjs,.ts,.mts,.cts,.jsx,.tsx --format=pretty
pnpm.cmd build
```

- [ ] **Step 2: Inspect the final diff and working tree**

```powershell
git diff --check
git status --short --branch
```

Report any unavailable browser/E2E verification separately; do not claim it passed without a runnable Playwright package/browser.
