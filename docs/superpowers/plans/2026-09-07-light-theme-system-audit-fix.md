# Light Theme System Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the selected Light theme apply consistently to storefront, authentication, customer, and admin routes while preserving intentional inverse surfaces and repairing the observed admin spacing failures.

**Architecture:** Apply the persisted color scheme once from `AppProviders`, so routes that do not render the storefront Header still receive `document.documentElement[data-theme]`. Replace auth/admin page-specific hardcoded colors with the existing `--de-color-*` tokens, keeping dark header/sidebar/hero areas only through semantic inverse surfaces. Add focused regression coverage for the global theme synchronizer and verify the route matrix with Playwright at desktop and mobile widths.

**Tech Stack:** React 19, TypeScript, Vite, SCSS, Vitest + Testing Library, Playwright CLI.

## Global Constraints

- Use pnpm only; do not add npm or yarn lockfiles.
- Preserve existing dirty worktree changes and do not reset, checkout, commit, or push unrelated work.
- Preserve auth, CSRF, API response contracts, and existing route structure.
- Reuse the existing Digital-E tokens in `client/src/styles/tailwind.css`; do not add a new theme dependency.
- Keep the existing dark brand shell only where it is an intentional inverse surface, not as the default for a Light route.
- Verify the touched client surface with Vitest, TypeScript, build, lint, and Playwright.

---

### Task 1: Apply the persisted color scheme at app scope

**Files:**
- Create: `client/src/components/common/ThemeSync.tsx`
- Modify: `client/src/app/providers.tsx`
- Test: `client/src/components/common/__tests__/ThemeSync.test.tsx`

**Interfaces:**
- `ThemeSync` consumes `useColorScheme()` and renders no visible markup.
- `AppProviders` mounts `ThemeSync` before route content.

- [x] Write a failing test that stores `"light"` under `digital-e:color-scheme:v1`, renders `ThemeSync`, and expects `document.documentElement.dataset.theme` to become `light` and `colorScheme` to become `light`.
- [x] Run `pnpm --dir client exec vitest run src/components/common/__tests__/ThemeSync.test.tsx`; confirm it fails because no global synchronizer exists.
- [x] Implement `ThemeSync` with `useColorScheme()` and mount it inside `BrowserRouter` in `AppProviders`.
- [x] Run the focused test and confirm it passes.
- [x] Confirm that Header and ThemeSync can coexist without changing the stored scheme behavior.

### Task 2: Normalize authentication pages to the theme token system

**Files:**
- Modify: `client/src/styles/features/auth/_login.scss`
- Modify: `client/src/styles/features/auth/_signup.scss`
- Modify: `client/src/styles/features/auth/_forgot-password.scss` if present, otherwise the imported forgot-password stylesheet.

**Interfaces:**
- Existing auth page class names and form behavior remain unchanged.
- Auth pages consume `--de-color-bg*`, `--de-color-surface*`, `--de-color-text*`, border, focus, and semantic status tokens.

- [x] Replace the signup page's hardcoded page/form/text/action colors with the existing semantic theme tokens while preserving the dark inverse image panel.
- [x] Align login and forgot-password backgrounds, cards, inputs, focus states, links, and primary actions to the same token roles.
- [x] Keep error/success colors semantic and readable in Light theme.
- [x] Run the auth-focused client tests and TypeScript check.

### Task 3: Normalize admin shell and page surfaces

**Files:**
- Modify: `client/src/styles/features/admin/_shell.scss`
- Modify: `client/src/styles/features/admin/_dashboard.scss`
- Modify: `client/src/styles/features/admin/_notifications.scss`
- Modify: `client/src/styles/features/admin/_orders.scss`
- Modify: `client/src/styles/features/admin/_products.scss`
- Modify: `client/src/styles/features/admin/_promotions.scss`
- Modify: `client/src/styles/features/admin/_accounts.scss`
- Modify: `client/src/styles/layout/_admin-shell.scss` only where shared layout defaults conflict with the tokenized shell.

**Interfaces:**
- Existing `.admin__*` selectors and page markup remain compatible.
- Existing inverse sidebar/header/hero areas use semantic inverse tokens; main page, cards, forms, and tables use Light surfaces when `data-theme="light"` is active.

- [x] Convert hardcoded white/slate/blue/purple/green page surfaces to token roles without removing existing status distinctions.
- [x] Add consistent spacing, min-width, wrapping, and overflow handling to admin toolbar, summary cards, form grids, notification rows, and tables.
- [x] Ensure mobile admin cards and tables stack or scroll intentionally at widths 720px and 560px.
- [x] Keep focus rings visible and ensure controls remain readable in Light theme.
- [x] Run client TypeScript, build, lint, and the full Vitest suite.

### Task 4: Browser verification and regression review

**Files:**
- Create/update only generated evidence under `output/light-theme-audit/`; do not add test fixtures unless a reusable route test is needed.

- [x] Start or reuse the local client/server dev processes.
- [x] Use Playwright to set Light theme and verify `/`, `/login`, `/signup`, `/forgot-password`, `/cart`, `/account`, `/orders`, `/addresses`, `/notifications`, `/wishlist`, `/admin`, `/admin/notifications`, `/admin/support`, `/admin/products`, `/admin/orders`, `/admin/accounts`, `/admin/promotions`, and `/admin/add`.
- [x] Capture desktop screenshots at 1280px and mobile screenshots at 390px for representative storefront, auth, customer, and admin routes.
- [ ] Assert `data-theme="light"`, `color-scheme: light`, no horizontal overflow, and no major toast/component overlap; admin notification/support API failures still produce visible error toasts in those captures.
- [x] Re-read the diff, run `git diff --check`, and report any remaining API/runtime failures separately from visual fixes.
