# Customer Account Localization and Route Structure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Localize the customer account, orders, addresses, and notification screens in EN/VI and make account-scoped routes canonical without breaking legacy links.

**Architecture:** Keep the existing feature page boundaries and `useT` translator. Add focused `account`, `orders`, and `addresses` namespaces to the existing dictionaries, centralize customer URL constants in `client/src/routes/customerRoutes.ts`, and make the router redirect legacy customer paths while preserving order query parameters.

**Tech Stack:** React 19, React Router 7, TypeScript, Vitest, existing `useT`/`LocaleProvider`, independent client pnpm package.

**Spec:** `docs/superpowers/specs/2026-09-18-customer-localization-routing.md`

## Global Constraints

- Preserve existing API paths, auth/session protection, response shapes, CSRF, and unrelated dirty worktree changes.
- Use `pnpm --dir client ...`; do not add dependencies or root orchestration.
- Keep all customer UI copy in EN/VI dictionaries and preserve responsive/theme behavior.
- Canonical customer paths are `/account`, `/account/orders`, `/account/addresses`, and `/account/notifications`.

### Task 1: Add canonical customer route helpers and regression coverage

**Files:**
- Create: `client/src/routes/customerRoutes.ts`
- Modify: `client/src/routes/router.tsx`
- Modify: `client/src/routes/router.test.tsx`

- [ ] Add route constants and an order-link helper for `/account/orders?order=<id>`.
- [ ] Add protected canonical routes and compatibility redirects for the three legacy paths; preserve `location.search` for `/orders?order=...`.
- [ ] Write tests first for canonical routes and legacy redirects, then run the focused router test and verify the new assertions fail before implementation.

### Task 2: Add EN/VI customer dictionaries

**Files:**
- Modify: `client/src/i18n/en.ts`
- Modify: `client/src/i18n/vi.ts`

- [ ] Add namespaces covering customer navigation, account overview, order history/detail, address book, and notification actions/states.
- [ ] Include formatter keys for counts, pagination, order IDs, notification summaries, and delete confirmations.
- [ ] Keep both dictionaries structurally identical and run the existing dictionary parity test.

### Task 3: Localize customer screens and update links

**Files:**
- Modify: `client/src/features/users/components/CustomerAccountShell.tsx`
- Modify: `client/src/features/users/pages/CustomerAccountPage.tsx`
- Modify: `client/src/features/users/pages/AddressBookPage.tsx`
- Modify: `client/src/features/orders/pages/OrderHistoryPage.tsx`
- Modify: `client/src/pages/ContactUsPage.tsx`
- Modify: `client/src/pages/SupportPage.tsx`
- Modify: `client/src/features/orders/pages/CheckoutSuccessPage.tsx`

- [ ] Replace visible hardcoded customer copy and toasts with `useT` keys.
- [ ] Localize known order status/payment/timeline and notification copy while leaving user-generated values unchanged.
- [ ] Update internal links to canonical customer routes and make account notifications scroll for both canonical path and legacy hash compatibility.
- [ ] Add focused page assertions for Vietnamese headings/actions and canonical link targets.

### Task 4: Verify and review

- [ ] Run focused Vitest suites for routes, account, and affected page tests.
- [ ] Run `pnpm --dir client exec tsc -p tsconfig.json --noEmit`.
- [ ] Run `pnpm --dir client build` and `git diff --check`.
- [ ] Re-read the diff and confirm no API route or unrelated dirty file changed.
