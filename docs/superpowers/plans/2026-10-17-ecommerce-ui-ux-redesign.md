# Ecommerce UI/UX Redesign Plan

- **Spec:** `docs/superpowers/specs/2026-10-17-ecommerce-ui-ux-redesign.md`
- **Task prompt:** `prompt.md` and `docs/ai-prompts/feature.md`
- **Base:** `0196f9ef57134ebe08b2c05ea72ddd36011129b4`
- **Working branch:** `bugfix/audit-feature-findings`
**Workspace:** Continue in the user's existing checkout. A pre-implementation snapshot of all 68 pre-existing dirty paths is preserved at `C:/Users/Admin/AppData/Local/Temp/digital-e-ui-ux-redesign/pre-implementation/`.

## Global constraints

- Use only the Digital-E client package. Do not edit server behavior, API contracts, auth guards, payment rules, or route paths.
- Preserve every pre-existing change in the checkout. When touching a dirty file, inspect and build on its current content; never restore it from HEAD.
- Use existing tokens, fonts, components, feature APIs, and bilingual translation patterns. No dependencies or invented commercial content.
- Keep the warm technical-editorial direction in the spec. Support light/dark, English/Vietnamese, keyboard and reduced-motion behavior, and explicit loading/empty/error/success states.
- Subagents use `gpt-6-luna`, do not spawn other agents, do not commit or run Git integration operations, and only edit their assigned paths. Main Codex owns integration, reviews, and final verification.
- Run task-scoped tests during implementation; run the broader client verification and Playwright Interactive QA after all tasks are integrated.

## Tasks

### Task 1: Shared design foundation and storefront shell

**Goal:** Align semantic tokens, page rhythm, global focus/interaction states, storefront header, footer, and shell spacing while preserving the current identity and controls.

**Owned paths:**

- `client/src/styles/tailwind.css`
- `client/src/styles/index.scss`
- `client/src/styles/foundations/_utilities.scss`
- `client/src/styles/layout/_app-shell.scss`
- `client/src/styles/layout/_header.scss`
- `client/src/styles/layout/_footer.scss`
- `client/src/components/layout/Header.tsx`
- `client/src/components/layout/Header.test.tsx`
- `client/src/components/layout/Footer.tsx`
- `client/src/components/layout/Footer.test.tsx`
- `client/src/styles/theme.tokens.test.ts`

**Acceptance:** Both themes retain accessible semantic colors; the header preserves working navigation/search/cart/account/locale/theme behavior; the mobile shell uses its viewport more efficiently without shrinking usable targets; global focus and reduced motion remain visible and predictable.

### Task 2: Product discovery and product decision surfaces

**Goal:** Make the homepage, catalog, product detail, comparison, and wishlist feel like one discovery journey, with clearer scan order and a usable mobile purchase action.

**Owned paths:**

- `client/src/pages/HomePage.tsx` and relevant tests
- `client/src/pages/ShopsPage.tsx` and relevant tests
- `client/src/features/products/pages/ProductPage.tsx` and relevant tests
- `client/src/features/products/pages/ProductComparisonPage.tsx` and relevant tests
- `client/src/pages/WishlistPage.tsx` and relevant tests
- `client/src/components/common/WishlistItem.tsx` and relevant tests
- `client/src/components/common/ConfirmActionModal.tsx` and relevant tests
- `client/src/context/ToastContext.tsx` and relevant tests
- `client/src/components/common/ProductItem.tsx` and relevant tests
- `client/src/i18n/en.ts`
- `client/src/i18n/vi.ts`
- `client/src/styles/pages/_home.scss`
- `client/src/styles/pages/_shops.scss`
- `client/src/styles/pages/_product.scss`
- `client/src/styles/pages/_comparison.scss`
- `client/src/styles/pages/_wishlist.scss`
- `client/src/styles/components/_product-card.scss`
- `client/src/styles/components/_product-media.scss`
- Any directly paired focused tests in these same domains

**Acceptance:** Preserve search/query/filter/sort/pagination, compare, wishlist, product alert, review, and add-to-cart behavior. Product facts remain data-backed. Any mobile purchase affordance reuses the existing action and loading/disabled state and does not cover content or keyboard focus.
Ensure customer-facing wishlist page and row labels, statuses, actions, confirmations, and feedback use the existing English/Vietnamese dictionary.
Wishlist toast severity reflects the outcome in both locales, and confirmation busy labels are localized.

### Task 3: Cart, checkout, authentication, and customer account journeys

**Goal:** Improve the presentation and responsive clarity of existing purchase and account tasks without changing their contracts or state transitions.

**Owned paths:**

- `client/src/features/orders/pages/CartPage.tsx` and relevant tests
- `client/src/features/orders/pages/CheckoutSuccessPage.tsx` and relevant tests
- `client/src/features/orders/pages/MockPayOSCheckoutPage.tsx` and relevant tests
- `client/src/features/orders/pages/GuestOrderLookupPage.tsx` and relevant tests
- `client/src/features/orders/pages/OrderHistoryPage.tsx` and relevant tests
- `client/src/features/auth/pages/*.tsx` and paired tests
- `client/src/features/users/pages/*.tsx` and paired tests
- `client/src/features/loyalty/pages/CustomerLoyaltyPage.tsx` and paired tests
- `client/src/i18n/en.ts`
- `client/src/i18n/vi.ts`
- Relevant SCSS under `client/src/styles/features/orders/`, `auth/`, and `users/`, plus `client/src/styles/features/users/_loyalty-page.scss`

**Acceptance:** Preserve cart quantities/totals, guest checkout, payment result handling, recovery paths, protected customer routes, account ownership, and all English/Vietnamese labels. Forms remain labeled, errors stay near the relevant fields, and no price, auth, or payment logic changes.

### Task 4: Support, after-sales, and informational pages

**Goal:** Align service, policy, and content pages with the storefront design while making help and recovery actions easy to locate.

**Owned paths:**

- `client/src/pages/AboutUsPage.tsx` and relevant tests
- `client/src/pages/ContactUsPage.tsx` and relevant tests
- `client/src/pages/NewsPage.tsx`, `NewsArticlePage.tsx`, and relevant tests
- `client/src/pages/SupportPage.tsx` and relevant tests
- `client/src/pages/NotFoundPage.tsx`, `ForbiddenPage.tsx`, and relevant tests
- `client/src/features/after-sales/pages/AfterSalesPage.tsx` and relevant tests
- `client/src/styles/pages/_about.scss`, `_contact.scss`, `_informational.scss`, `_news.scss`, `_support.scss`, `_not-found.scss`
- `client/src/styles/features/after-sales/_after-sales.scss`

**Acceptance:** Keep existing routes and support/after-sales actions, preserve established policy and contact content, and provide coherent responsive empty/loading/error/success states.

### Task 5: Admin workspace visual system

**Goal:** Improve the admin layout and dense operational workflows as a distinct workspace, carrying the same visual identity with clear information hierarchy.

**Owned paths:**

- `client/src/components/layout/AdminLayout.tsx` and paired tests
- `client/src/components/layout/AdminHeader.tsx` and paired tests
- `client/src/components/layout/AdminSidebar.tsx` and paired tests
- `client/src/styles/layout/_admin-shell.scss`
- `client/src/styles/features/admin/*.scss`
- `client/src/styles/features/after-sales/_after-sales-admin.scss`
- `client/src/styles/features/shipping/_shipping.scss`

**Acceptance:** Preserve admin guards, role requirements, table actions, filters, audit/evidence workflows, delivery operations, payment reconciliation, and existing form behavior. Improve responsive data density, navigation/focus, status readability, and empty/loading/error states. Treat existing local modifications as user work to preserve and extend.

## Sequence and review gates

Implement one task at a time in the order above. Before dispatch, extract its task brief and capture the current bytes of the exact owned paths. After implementation, create a task-scoped diff against those snapshots, dispatch a read-only spec/quality reviewer, and resolve Critical/Important findings before marking the task complete in `.superpowers/sdd/progress.md`. After Task 5, dispatch one broad read-only review, then run the full client checks and Playwright Interactive QA inventory from the spec.
