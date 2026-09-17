# Digital-E Home Reference Design Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reshape the storefront Home page to match the supplied Digital-E reference design while preserving its existing API-backed product, cart, wishlist, locale, theme, and route behavior.

**Architecture:** Keep `HomePage.tsx` as the route-level orchestrator for product fetching, tabs, wishlist/cart mutations, and recently viewed behavior. Replace only the page presentation with focused static category/value/bundle metadata plus dynamic product surfaces. Keep motion CSS-first, use a small `IntersectionObserver` reveal effect for scroll entry, and use a bounded hero product rotation that stops for reduced-motion users.

**Tech Stack:** React 19, TypeScript, React Router, existing product/card/icon components, SCSS, existing semantic theme tokens, Vitest + Testing Library.

## Global Constraints

- Use pnpm only; do not add npm or yarn lockfiles.
- Preserve existing API response shapes, cart/wishlist callbacks, route links, CSRF/auth behavior, and recently viewed tracking.
- Keep all user-facing Home copy in `client/src/i18n/en.ts` and `client/src/i18n/vi.ts`.
- Use existing theme tokens and support both `:root` dark mode and `[data-theme="light"]` without hard-coded component colors.
- Motion must use transform/opacity, stay within 150–500ms for interactions, and honor `prefers-reduced-motion: reduce`.
- Preserve unrelated dirty worktree changes, including the existing Cart, Header, Footer, docs, server OpenAPI, and reference PNG changes.
- Verify with frontend typecheck, Home tests, build, and lint.

---

### Task 1: Add reference-style Home metadata and motion state

**Files:**
- Modify: `client/src/pages/HomePage.tsx`
- Test: `client/src/pages/HomePage.test.tsx`

**Interfaces:**
- Consumes: existing `allProducts`, `featuredProducts`, `displayedProducts`, `addItem`, `toggleWishlist`, `useT`, and `useRecentlyViewed` values.
- Produces: `categoryLinks`, `valueProps`, `heroSlideIndex`, and reveal behavior consumed by the new Home markup.

- [ ] **Step 1: Define static category and value-proposition metadata** using translation keys and existing icon components. Category metadata maps `Gaming`, `Laptops`, `Audio`, `Components`, `Smart Home`, and `Accessories` to existing shop query values and fallback carousel images. Value metadata maps shipping, checkout, payment, support, and returns to existing icon components.

- [ ] **Step 2: Add bounded hero rotation state** that selects one product from `featuredProducts`, wraps manual previous/next controls, and uses a five-second interval only when at least two featured products exist and reduced motion is not requested.

- [ ] **Step 3: Add a page-level reveal observer** that finds `[data-reveal]` elements under `.home`, adds `is-visible` on intersection, falls back to visible state when `IntersectionObserver` is unavailable, and disconnects on unmount.

- [ ] **Step 4: Update the Home test fixtures** to assert the new hero, category navigation, trending tabs, value propositions, and bundle CTA while keeping existing add-to-cart and wishlist behavior covered.

### Task 2: Replace Home presentation with the supplied reference structure

**Files:**
- Modify: `client/src/pages/HomePage.tsx`

**Interfaces:**
- Consumes: Task 1 metadata/state and all existing product actions.
- Produces: accessible sections named `home__hero`, `home__categories`, `home__trending`, `home__value`, `home__bundle`, and the existing `RecentlyViewedStrip` surface.

- [ ] **Step 1: Keep the existing `<Layout>` and `<Helmet>` contract**, including the high-priority product image preload and page metadata.

- [ ] **Step 2: Build the hero section** with overlay copy, primary/secondary links, in-stock live status, dynamic featured deal ticket, availability label, manual carousel buttons, and accessible slide indicators. Use product data for the deal image/name/category/price instead of baking text into the raster image.

- [ ] **Step 3: Build the category rail** with six query-backed links, image fallback handling, readable labels/descriptions, and a “view all categories” link to `/shops`.

- [ ] **Step 4: Build the trending product section** with the existing `HomeTab` tabs and `ProductItem` so cart/wishlist actions remain shared. Show five products on large screens and let the grid collapse into a horizontal overflow rail on small screens.

- [ ] **Step 5: Build the value strip** with five concise trust points and existing icons; ensure each value is understandable without relying on color alone.

- [ ] **Step 6: Build the bundle banner** with a product/workbench image, translated heading/body/button, and a visual deal panel that links to the shop. Keep it decorative and non-blocking if product data is loading.

- [ ] **Step 7: Keep recently viewed after the bundle section**, preserving its existing selection and tracking callbacks.

### Task 3: Implement the reference visual system and responsive motion

**Files:**
- Modify: `client/src/styles/pages/_home.scss`

**Interfaces:**
- Consumes: the BEM classes and `data-reveal`/`is-visible` hooks from Task 2.
- Produces: desktop, tablet, mobile, dark/light, focus, hover, reduced-motion, and loading/empty visual states.

- [ ] **Step 1: Replace the current Home variables with semantic values derived from `--de-color-*` tokens**, using deep navy/graphite surfaces, warm paper cards, signal orange, electric blue, and circuit green.

- [ ] **Step 2: Style the hero as a balanced two-column composition** with a clipped technical grid, restrained glow, responsive product image, floating deal ticket, live status pulse, and CTA hierarchy. Animate only hero copy/ticket/traces as the main page-load moment.

- [ ] **Step 3: Style category cards and product cards** with consistent borders, image zones, badge hierarchy, accessible focus rings, transform-only hover feedback, and no horizontal overflow at desktop widths.

- [ ] **Step 4: Add reveal transitions** for category, trending, value, bundle, and recently viewed sections. Keep default interaction transitions at 180–240ms and use transform/opacity only.

- [ ] **Step 5: Add responsive breakpoints** so hero stacks at tablet width, category/product rails become touch-scrollable at mobile widths, CTA controls remain at least 44px tall, and the deal ticket never clips price or action text.

- [ ] **Step 6: Add `[data-theme="light"] .home` overrides** using semantic theme tokens and verify contrast for copy, CTA, status, borders, and images.

- [ ] **Step 7: Add reduced-motion rules** that disable hero rotation-dependent animation, infinite decorative animation, and scroll reveal transitions while preserving visible content and functional controls.

### Task 4: Localize all new Home copy

**Files:**
- Modify: `client/src/i18n/en.ts`
- Modify: `client/src/i18n/vi.ts`

**Interfaces:**
- Consumes: keys requested by `HomePage.tsx`.
- Produces: complete EN/VI values for promo labels, categories, value points, bundle content, carousel controls, and accessibility labels.

- [ ] **Step 1: Add English keys** for `heroDeal`, `heroPrevious`, `heroNext`, `heroSlide`, `categoryTitle`, six category labels/descriptions, `viewAllCategories`, `trendingKicker`, `trendingTitle`, `valueTitle`, five value labels/bodies, `bundleKicker`, `bundleTitle`, `bundleBody`, `bundleCta`, `dealDiscount`, and the related aria labels.

- [ ] **Step 2: Add Vietnamese equivalents** with natural Vietnamese copy rather than literal English placeholders, keeping the same object shape as English.

- [ ] **Step 3: Run the existing i18n type/test surface** and remove any raw user-facing strings introduced in the Home JSX except product data fallbacks that already follow local conventions.

### Task 5: Verify the Home redesign

**Files:**
- Test: `client/src/pages/HomePage.test.tsx`
- Test: `client/src/pages/HomePageTheme.test.tsx` if present in the current checkout

**Interfaces:**
- Consumes: completed Home implementation.
- Produces: evidence that the route renders, the core interactions remain wired, and the build/type/lint checks pass.

- [ ] **Step 1: Run the focused Home tests** with `pnpm --dir client exec vitest run src/pages/HomePage.test.tsx --config vitest.config.ts` and fix only Home-related failures.

- [ ] **Step 2: Run frontend typecheck** with `pnpm --dir client exec tsc -p tsconfig.json --noEmit`.

- [ ] **Step 3: Run the production build** with `pnpm --dir client build`.

- [ ] **Step 4: Run frontend lint** with `pnpm --dir client lint`.

- [ ] **Step 5: If the client server is available, inspect `/` at desktop and mobile widths** and confirm hero text, price, category cards, product actions, light/dark theme, and no horizontal clipping. Report any environment/API failure separately from visual findings.

## Plan self-review

- The plan covers the supplied reference sections, overlay content, dynamic product behavior, animation, responsive layout, i18n, and dark/light theme.
- No new runtime dependency is required; existing icons, product cards, theme tokens, and route contracts are reused.
- No schema/API/auth/checkout behavior is changed.
- The only worktree files intended for implementation are `HomePage.tsx`, `_home.scss`, `en.ts`, `vi.ts`, and the focused Home test file, plus this plan document.
