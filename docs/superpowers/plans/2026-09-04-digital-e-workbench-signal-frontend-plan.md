# Digital-E Workbench / Signal Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the Digital-E frontend to a complete Workbench / Signal visual system built with Tailwind CSS and shadcn-style UI primitives.

**Architecture:** Keep the existing React Router, contexts, Axios API helpers, page ownership, and backend contracts. Introduce Tailwind theme variables and small reusable UI primitives, then migrate shared layout and route groups from the current SCSS/Bootstrap visual layer to utility-based Workbench / Signal markup. Keep legacy SCSS only where a route has not yet been migrated, and remove React-Bootstrap entirely.

**Tech Stack:** React 19, Vite 8, TypeScript, Tailwind CSS, `@tailwindcss/vite`, shadcn/ui conventions, Radix primitives where needed, Lucide-compatible existing SVG icon components, Vitest, Playwright CLI.

## Global Constraints

- Preserve existing route paths, auth wrappers, context providers, API response keys, cookies, CSRF behavior, and image helper contracts.
- Use Tailwind CSS + shadcn-style primitives for new and migrated UI; do not add new React-Bootstrap usage.
- Use Workbench / Signal tokens: graphite `#111416`, mineral panels `#1C2429`/`#263137`, mineral paper `#E7E3DA`, copper `#E4663D`, electric blue `#4C8DFF`, circuit mint `#B6D546`.
- Use Exo for display headings, Nunito Sans for body/UI copy, and Roboto Mono for specs/operational metadata.
- Verify 375px, 768px, 1024px, and 1440px layouts; maintain visible focus and reduced-motion support.
- Do not change server files or database behavior.

### Task 1: Tailwind and shadcn foundation

**Files:**
- Create: `client/src/lib/utils.ts`
- Create: `client/src/styles/tailwind.css`
- Create: `client/src/components/ui/button.tsx`
- Create: `client/src/components/ui/badge.tsx`
- Create: `client/src/components/ui/card.tsx`
- Create: `client/components.json`
- Modify: `client/package.json`
- Modify: `client/vite.config.ts`
- Modify: `client/src/main.tsx`
- Modify: `client/src/styles/index.scss`

**Interfaces:**
- `cn(...inputs: ClassValue[]): string` merges conditional class names with `clsx` and `tailwind-merge`.
- `Button` accepts native button props plus `variant` (`primary | secondary | ghost | danger`) and `size` (`sm | md | lg | icon`).
- `Badge` accepts `tone` (`neutral | signal | info | success | danger`) and children.
- `Card`, `CardHeader`, `CardTitle`, `CardDescription`, and `CardContent` provide composable Tailwind surfaces.

- [ ] Add the Tailwind/shadcn dependencies with pnpm and remove `react-bootstrap` from `client/package.json` only after all imports are migrated.
- [ ] Add `cn`, the Workbench theme variables, font imports, focus rules, reduced-motion rules, and base typography in `client/src/styles/tailwind.css`.
- [ ] Register the Tailwind Vite plugin and import `tailwind.css` from `main.tsx` before the legacy SCSS entry.
- [ ] Add the primitive components with typed variants and no page-specific styling.
- [ ] Run `client\\node_modules\\.bin\\tsc.cmd -p client\\tsconfig.json --noEmit` and `pnpm --filter client build`.

### Task 2: Shared public shell

**Files:**
- Modify: `client/src/components/layout/Layout.tsx`
- Modify: `client/src/components/layout/Header.tsx`
- Modify: `client/src/components/layout/Footer.tsx`
- Modify: `client/src/components/common/Icons.tsx`
- Create: `client/src/components/ui/sheet.tsx`
- Create: `client/src/components/ui/input.tsx`
- Create: `client/src/components/ui/separator.tsx`

**Interfaces:**
- Header keeps existing search, account, wishlist, notifications, cart, locale, and theme behavior while replacing Bootstrap/SCSS presentation with Tailwind classes.
- `Sheet` exposes `open`, `onOpenChange`, `side`, and `children` for mobile navigation/filter drawers.

- [ ] Preserve current Header handlers and route navigation while replacing class-based layout markup with accessible Tailwind structure.
- [ ] Move mobile navigation into `Sheet`, keep a single login action, and preserve search keyboard shortcut and recent-search behavior.
- [ ] Convert Footer into Workbench paper/graphite sections with visible labels, newsletter feedback, and responsive columns.
- [ ] Verify navigation keyboard focus and mobile menu open/close in a focused Vitest render test.

### Task 3: Homepage redesign

**Files:**
- Modify: `client/src/pages/HomePage.tsx`
- Modify: `client/src/components/common/ProductItem.tsx`
- Modify: `client/src/components/common/RecentlyViewedStrip.tsx`
- Modify: `client/src/components/common/StorefrontSkeleton.tsx`

**Interfaces:**
- Preserve `HomePage` product-fetch, wishlist, recommendation, tab, carousel, and recently-viewed behavior.
- Product cards continue to call the existing `onToggleWishlist` and `onAddingCart` callbacks.

- [ ] Replace the current hero with the Workbench signal panel and a real-data spec rail.
- [ ] Add category/workbench shortcuts using existing routes and product categories.
- [ ] Restyle featured and standard product cards with Tailwind, accessible image fallback, stock/rating labels, copper primary action, and electric-blue focus states.
- [ ] Preserve loading skeletons, product tabs, and URL `tab` synchronization.
- [ ] Add a home render test covering the hero heading and product action accessible names.

### Task 4: Catalog and product detail redesign

**Files:**
- Modify: `client/src/pages/ShopsPage.tsx`
- Modify: `client/src/features/products/pages/ProductPage.tsx`
- Modify: `client/src/features/products/components/RecommendedProduct.tsx`
- Create: `client/src/components/ui/select.tsx`
- Create: `client/src/components/ui/tabs.tsx`
- Create: `client/src/components/ui/slider.tsx`

**Interfaces:**
- Catalog query-string filters and pagination remain unchanged.
- Product detail purchase, wishlist, review, description, specification, and recommendation behavior remain unchanged.

- [ ] Build a two-column catalog frame with a desktop filter rail and mobile Sheet.
- [ ] Add active filter chips, clear result counts, sort control, and intentional loading/empty/error states without changing request parameters.
- [ ] Recompose product detail into asymmetric gallery/purchase surfaces, spec rail, tabs, and recommendation cards.
- [ ] Keep every purchase control at least 44px high and expose product image fallback content.
- [ ] Verify catalog filter controls and product quantity controls render with accessible labels.

### Task 5: Customer, auth, checkout, and informational routes

**Files:**
- Modify: `client/src/features/auth/pages/LoginPage.tsx`
- Modify: `client/src/features/auth/pages/SignupPage.tsx`
- Modify: `client/src/features/orders/pages/CartPage.tsx`
- Modify: `client/src/features/orders/pages/CheckoutSuccessPage.tsx`
- Modify: `client/src/features/orders/pages/OrderHistoryPage.tsx`
- Modify: `client/src/features/orders/components/CheckoutPaymentPage.tsx`
- Modify: `client/src/features/users/pages/CustomerAccountPage.tsx`
- Modify: `client/src/features/users/pages/AddressBookPage.tsx`
- Modify: `client/src/features/users/pages/CustomerNotificationsPage.tsx`
- Modify: `client/src/pages/AboutUsPage.tsx`
- Modify: `client/src/pages/ContactUsPage.tsx`
- Modify: `client/src/pages/NewsPage.tsx`
- Modify: `client/src/pages/SupportPage.tsx`
- Modify: `client/src/pages/WishlistPage.tsx`
- Modify: `client/src/pages/NotFoundPage.tsx`
- Modify: related `client/src/components/common/*.tsx` shared state components

**Interfaces:**
- Preserve all form submit callbacks, auth/session checks, cart calculations, checkout payloads, and customer API calls.
- Use the shared shell and UI primitives from Tasks 1-2.

- [ ] Replace route-level SCSS presentation with Workbench form, panel, table, timeline, and empty-state compositions.
- [ ] Keep visible labels, inline validation/error announcements, clear totals, and confirmation states.
- [ ] Add focused tests for login validation state, cart total rendering, and notification empty state.

### Task 6: Admin shell and management surfaces

**Files:**
- Modify: `client/src/components/layout/AdminLayout.tsx`
- Modify: `client/src/components/layout/AdminSidebar.tsx`
- Modify: `client/src/components/layout/AdminHeader.tsx`
- Modify: `client/src/features/admin/pages/AdminDashboard.tsx`
- Modify: `client/src/features/admin/components/AdminDashboardCharts.tsx`
- Modify: `client/src/features/admin/pages/AdminProductPage.tsx`
- Modify: `client/src/features/admin/pages/AdminAddProductPage.tsx`
- Modify: `client/src/features/admin/pages/AdminOrderPage.tsx`
- Modify: `client/src/features/admin/pages/AdminAccountPage.tsx`
- Modify: `client/src/features/admin/pages/AdminPromotionsPage.tsx`
- Modify: `client/src/features/admin/pages/AdminNotificationsPage.tsx`
- Modify: `client/src/components/common/admin/*.tsx`
- Create: `client/src/components/ui/table.tsx`
- Create: `client/src/components/ui/dialog.tsx`

**Interfaces:**
- Preserve admin route guards, CRUD callbacks, CSV exports, chart data, dialogs, and role/status actions.

- [ ] Replace the remaining React-Bootstrap Button/Modal usage with shared shadcn-style Button/Dialog components.
- [ ] Build a dense charcoal admin shell with responsive Sidebar and clear active route state.
- [ ] Restyle dashboard metrics, charts, tables, dialogs, workflows, and forms with the same tokens and accessible focus/empty/loading states.
- [ ] Add an admin shell render test covering the active navigation label and logout action.

### Task 7: Remove Bootstrap visual dependencies and migrate style entrypoints

**Files:**
- Modify: `client/package.json`
- Modify: `client/vite.config.ts`
- Modify: `client/src/styles/index.scss`
- Modify or remove only when no imports remain: `client/src/styles/foundations/_bootstrap-overrides.scss`
- Modify: `client/pnpm-lock.yaml` or root `pnpm-lock.yaml` according to the existing workspace lockfile workflow

- [ ] Confirm `rg -n -i "react-bootstrap|bootstrap" client/src client/package.json client/vite.config.ts` returns no runtime/dependency references.
- [ ] Remove the Bootstrap vendor chunk branch and package dependency.
- [ ] Keep only the minimum legacy SCSS imports required by untouched selectors, then remove migrated page imports when their markup no longer uses them.
- [ ] Run client typecheck, lint, test, and build.

### Task 8: Browser verification and handoff

**Files:**
- Create or update only browser artifacts under `output/playwright/`
- Modify: `Wiki/index.md` and `Wiki/log.md` only if the final change materially updates the project’s frontend architecture

- [ ] Start the client with `pnpm --filter client start`.
- [ ] Open the local URL in Playwright and inspect home, shops, product, cart/auth, and admin route shells where available.
- [ ] Capture desktop and mobile screenshots in `output/playwright/`.
- [ ] Check console/network output for regressions and keep deployed data/image failures separate from visual findings.
- [ ] Run the final verification commands and report exact results before claiming completion.
