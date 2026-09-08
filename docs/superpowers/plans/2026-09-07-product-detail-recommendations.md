# Product Detail Recommendations and Image Consistency Implementation Plan

> **For agentic workers:** Execute the scoped UI change task-by-task with test-first verification.

**Goal:** Move Product Detail recommendations into a discoverable horizontal rail below the purchase hero and give every Product Detail image the same fixed display frame without cropping source images.

**Architecture:** Keep recommendation data and card rendering in `RecommendedProduct`, move only its page-level shell in `ProductPage`, and use existing shared product-media styles. The Product Detail gallery will use a square responsive frame with `object-fit: contain`, while the recommendation rail will scroll horizontally on narrow screens and show four equal cards on wider screens.

**Tech Stack:** React 19, TypeScript, Vite, SCSS, Vitest + Testing Library, Playwright CLI.

## Global Constraints

- Preserve the existing `fetchRelevantProducts` API and product navigation behavior.
- Do not crop product imagery; keep `object-fit: contain`.
- Preserve unrelated dirty worktree changes and do not create a worktree.
- Verify client typecheck, build, lint, Vitest, and Playwright route screenshots.

## Task 1: Add regression coverage

**Files:**
- Modify: `client/src/components/common/__tests__/ShopAndProductDetailSurface.test.tsx`
- Modify: `client/src/components/common/__tests__/ProductSurface.test.tsx`

- [x] Assert the recommendations shell appears before the Product Detail tabs.
- [x] Assert the gallery and recommendation image surfaces expose their fixed-frame classes.
- [x] Run the focused tests and confirm they fail before production changes.

## Task 2: Move and restyle recommendations

**Files:**
- Modify: `client/src/features/products/pages/ProductPage.tsx`
- Modify: `client/src/styles/pages/_product.scss`

- [x] Render the recommendations shell immediately after the Product Detail hero and before tabs.
- [x] Add stable test IDs for the shell, tabs, and fixed gallery frame.
- [x] Convert the recommendation grid into a horizontal scroll rail with equal-width cards, four visible cards on wider screens, and snap-friendly cards on mobile.

## Task 3: Normalize Product Detail image frames

**Files:**
- Modify: `client/src/styles/pages/_product.scss`
- Modify: `client/src/features/products/components/RecommendedProduct.tsx`

- [x] Make the main Product Detail image stage square and responsive at every breakpoint.
- [x] Keep images contained inside the stage and remove intrinsic-image sizing differences from the layout.
- [x] Apply the same full-width/no-max-width media contract to recommendation images.

## Task 4: Verify

- [x] Run focused Vitest tests, then the full client Vitest suite.
- [x] Run frontend typecheck, build, and lint.
- [x] Use Playwright at `/product?id=28` on desktop and mobile, capture the hero/recommendation rail, and confirm equal image frames and correct section order.
- [x] Run `git diff --check` and report any pre-existing browser console errors separately from the UI change.
