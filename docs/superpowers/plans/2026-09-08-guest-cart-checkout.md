# Guest Cart and Guest Checkout Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Enable unauthenticated visitors to persist a browser-local cart, validate it against the server, complete the existing cash, bank transfer, PayOS, and Stripe/Card checkout paths, and retrieve the resulting order with a one-time-visible token.

**Architecture:** Keep the client and server as independent pnpm packages. Add a versioned guest-cart storage module and public guest checkout UI on the client. Generalize the existing server cart, order, promotion, and Stripe reservation services around an authenticated-or-guest order identity, while keeping MySQL repositories, route-local response shapes, CSRF, rate limits, ownership checks, and the existing payment flows.

**Tech Stack:** React 19, React Router 7, Vite, TypeScript, SCSS, Axios, Express 5/NestJS modules, MySQL/mysql2 repositories, Prisma schema/migrations, Zod, Stripe, Vitest, ESLint, and pnpm.

**Spec:** docs/superpowers/specs/2026-09-08-guest-cart-checkout-design.md

## Global Constraints

- Work only on the feature branch created for this plan: feature/guest-cart-checkout.
- Do not modify or push main, and do not create a worktree.
- Use pnpm through the independent client and server package directories. Do not add a root workspace or a second package manager lockfile.
- Preserve authenticated route paths, response keys, CSRF behavior, role guards, ownership checks, payment methods, order status values, and existing admin behavior.
- Keep controllers thin. Put request validation in Zod validators, business orchestration in services, and SQL in repositories.
- Never accept client-provided prices, sale prices, totals, stock, discount amounts, or user IDs as authoritative.
- Store only a hash of a guest order token. Never log the raw token, cookies, access tokens, or payment secrets.
- Use parameterized SQL and align every raw SQL schema change with the Prisma schema and checked-in migration.
- Do not run a migration, seed, reset, or destructive operation against a production database.
- Do not add an email provider, payment provider, dependency, or broad API response normalization unless a focused implementation need is proven.
- Keep guest cart local persistence limited to productId and quantity. The server preview remains the source of product, price, stock, and promotion data.
- Add focused tests for new pure logic, validators, service branches, and UI state transitions where the existing test harness supports them.
- Update the relevant Wiki pages in the same change because this feature changes data relationships, API behavior, and checkout business logic.

## Implementation Tasks

Task tracker:

- [ ] 1. Guest order identity and database foundation
- [ ] 2. Authoritative guest cart preview
- [ ] 3. Transactional guest purchase for non-Stripe methods
- [ ] 4. Stripe/Card reservations and webhook finalization
- [ ] 5. Dual-source client cart context and merge behavior
- [ ] 6. Guest add-to-cart and public cart route
- [ ] 7. Guest checkout, success, and order lookup UI
- [ ] 8. Admin compatibility and Wiki documentation
- [ ] 9. Full verification and manual browser smoke checks

### 1. Add the guest order identity and database foundation

**Files:**

- Modify server/src/database/prisma/schema.prisma.
- Add server/src/database/migrations/20260908100000_guest_checkout/migration.sql.
- Add server/src/orders/guest-order-token.ts and server/src/orders/__tests__/guest-order-token.test.ts, following the existing auth-session token hashing pattern.
- Modify server/src/orders/orders.types.ts, server/src/orders/checkout-reservation.repository.ts, server/src/orders/checkout-reservation.service.ts, and the promotion types/repository that currently require a user ID.

**Steps:**

- Define a typed identity model that represents either an authenticated user ID or a guest contact snapshot. Keep the guest email and name required for a guest order, and the phone optional.
- Generate the raw guest token with cryptographically secure random bytes and hash it with SHA-256 before persistence. Keep token generation and comparison in a small, deterministic utility that can be tested without a database.
- Make orders.user_id, pending_checkouts.user_id, and discount_redemptions.user_id nullable without dropping existing foreign keys for non-null values.
- Add nullable guest_email, guest_name, guest_phone, and guest_order_token_hash fields to orders and pending_checkouts. Add token lookup indexes and an admin-friendly guest email index where the existing MySQL version supports it.
- Keep the migration additive and compatible with existing rows. Do not rewrite or reset the baseline dump.
- Align Prisma relation optionality, field mappings, indexes, and nullable types with the SQL migration.
- Update row and input types so existing authenticated code remains type-safe when user_id can be null.

**Tests and verification:**

- Test that generated tokens are non-empty, unpredictable across calls, and never equal to their stored hash.
- Test that the same raw token hashes deterministically and that a different token does not match.
- Run the Prisma formatter/validation or generate command available in server/package.json.
- Review the SQL for foreign keys, nullability, indexes, and compatibility with the checked-in schema before moving to service work.

**Commit:** feat(server): add guest order identity foundation

### 2. Implement the authoritative guest cart preview

**Files:**

- Modify server/src/cart/cart.dto.ts, server/src/cart/cart.types.ts, server/src/cart/cart.validator.ts, server/src/cart/cart.repository.ts, server/src/cart/cart.service.ts, server/src/cart/cart.controller.ts, and server/src/cart/cart.module.ts.
- Add focused server tests for preview validation and price/stock calculation.
- Add client/src/features/orders/guestCartStorage.ts and its Vitest tests.
- Modify client/src/features/orders/api.ts and client/src/features/orders/types.ts.

**Steps:**

- Add POST /api/cart/guest/preview without an authentication guard, while leaving the existing CSRF middleware and module rate limit active.
- Validate a bounded list of positive integer product IDs and quantities, plus an optional bounded discountCode, with Zod before repository access.
- Query the current product, sale price, image, stock, and availability data using parameterized SQL. Reuse the existing normalized cart item contract where practical.
- Return current merchandise totals, promotion result, and actionable issues for missing, inactive, out-of-stock, or insufficient-quantity items. Do not create a cart row or inventory reservation.
- Keep the final checkout path responsible for repeating the authoritative read and transactionally validating the cart.
- Create a pure guestCartStorage module using the key digital-e:guest-cart:v1. Persist only productId and quantity, tolerate malformed or unavailable localStorage data, and expose add, update, remove, clear, and read operations without React dependencies.
- Expose a client API helper for preview and guest checkout contracts without hard-coding URLs outside the shared HTTP client.

**Tests and verification:**

- Test local storage round trips, quantity replacement, removal, malformed JSON recovery, and the fact that price/stock/user fields are not persisted.
- Test preview behavior for current pricing, duplicate product IDs, missing products, insufficient stock, and an invalid discount code.
- Verify the public endpoint still passes through CSRF and rate-limit middleware according to the current application composition.

**Commit:** feat: add authoritative guest cart preview

### 3. Add transactional guest purchase for non-Stripe methods

**Files:**

- Modify server/src/orders/orders.dto.ts, server/src/orders/orders.validator.ts, server/src/orders/orders.types.ts, server/src/orders/orders.repository.ts, server/src/orders/orders.service.ts, and server/src/orders/orders.controller.ts.
- Modify server/src/orders/checkout-reservation.service.ts, server/src/orders/checkout-reservation.repository.ts, server/src/promotions/promotions.repository.ts, server/src/promotions/promotions.types.ts, and server/src/notifications/notifications.service.ts.
- Add focused order-service/controller tests following the existing server test conventions.

**Steps:**

- Add typed guest contact and shipping DTOs. Require a valid email, recipient name, address, city, country, and an allowed payment method; keep phone optional and normalize it consistently with existing account checkout behavior.
- Add POST /api/orders/guest/purchase. The body contains cart productId/quantity pairs, contact, shipping, optional discountCode, and paymentMethod. It must not contain a user ID, trusted price, trusted total, or trusted discount.
- Reuse the same server-authoritative cart validation and order transaction used by authenticated purchase. Keep inventory decrement, order items, payment/timeline writes, promotion redemption, and rollback behavior in the shared service layer.
- Introduce a guest order identity at the service boundary instead of duplicating the authenticated purchase workflow. Set user_id to NULL and persist the validated contact snapshot and token hash.
- Return the raw guest token only in the successful creation response. Do not log it or include it in an order row DTO.
- Keep notifications conditional: authenticated orders retain their existing notification behavior; guest orders skip user-owned notification records.
- Add POST /api/orders/guest/lookup with orderId and guestOrderToken. Compare the token hash server-side and return a guest-safe order detail only after both values match. Do not expose internal user IDs, token hashes, admin notes, or other private fields.
- Keep POST /api/orders/purchase/:uid and all ownership/admin guards unchanged except for the shared nullable identity types required by the service.

**Tests and verification:**

- Test successful guest cash and bank-transfer purchase, including the nullable user ID, contact snapshot, token hash, order items, and inventory changes.
- Test PayOS using the existing symbolic/configured path and preserve its existing amount/currency behavior.
- Test invalid contact, unsupported payment method, stale price, insufficient stock, invalid coupon, duplicate product IDs, and malformed quantities.
- Test that lookup fails with an order ID alone, a wrong token, and a token for another order, while succeeding with the correct pair.
- Test rollback/no partial order when an inventory or promotion transaction fails.

**Commit:** feat(server): support transactional guest purchase

### 4. Extend Stripe/Card reservations and webhook finalization

**Files:**

- Modify server/src/orders/orders.stripe.service.ts, server/src/orders/checkout-reservation.service.ts, server/src/orders/checkout-reservation.repository.ts, server/src/orders/orders.service.ts, server/src/orders/orders.controller.ts, and server/src/orders/orders.repository.ts.
- Modify server/src/stripe/stripeWebhook.controller.ts only where the existing webhook contract needs nullable guest reservation fields.
- Extend the existing Stripe webhook and checkout flow tests.

**Steps:**

- Add POST /api/orders/guest/checkout-session with the same validated cart, contact, shipping, and optional discount input as guest purchase.
- Generalize reservation input to accept a nullable user ID, guest contact snapshot, and token hash while preserving reservation expiry, inventory locking, promotion reservation, idempotency, and pending-checkout statuses.
- Persist guest fields and the token hash in pending_checkouts. Return the raw token together with the existing checkout URL; keep it out of logs and provider metadata unless the provider metadata is explicitly proven safe and needed.
- Ensure mock Stripe mode follows the same guest finalization service as live mode.
- Keep the webhook as the authoritative finalization trigger. It must be able to finalize a guest pending checkout after redirect without an authenticated request.
- Add POST /api/orders/guest/by-session with sessionId and raw guest token. Look up the pending/finalized order only after validating the token and preserve the existing Stripe session response behavior for authenticated callers.
- Keep raw-body webhook signature verification and existing Stripe event handling unchanged.

**Tests and verification:**

- Test guest mock checkout session creation, pending-checkout persistence, finalization, and token-protected lookup.
- Test live-shaped webhook payload finalization for a guest reservation and repeated webhook delivery/idempotency.
- Test expired, released, missing, and already-finalized reservations.
- Run server typecheck and build after this task because it crosses order, reservation, and webhook types.

**Commit:** feat(server): support guest Stripe checkout

### 5. Make the client cart context dual-source and merge-safe

**Files:**

- Modify client/src/context/CartContext.tsx, client/src/features/orders/api.ts, client/src/features/orders/types.ts, and client/src/features/orders/guestCartStorage.ts.
- Add or extend focused CartContext and storage tests.

**Steps:**

- Keep authenticated users on the existing server cart endpoint and preserve the existing cart item normalization.
- For guests, read local product IDs and quantities, call guest preview, and expose loading, empty, validation issue, and recoverable error states explicitly. Never render a failed preview as an empty cart.
- Add a single context-level add/update/remove flow used by home, catalog, and product detail pages. Authenticated mutations use the existing server endpoint; guest mutations update local storage and refresh preview.
- Preserve the existing discount UX but route guest discount validation through preview rather than the authenticated-only discount endpoint.
- When authentication becomes available with guest items, offer or clearly surface a merge action. Add each guest item through the existing authenticated cart path, let the server validate it, and clear local storage only after all accepted items have been merged.
- Ensure logout does not accidentally copy authenticated server data into guest storage.
- Keep cart quantities bounded and coalesce duplicate product IDs before preview or merge.

**Tests and verification:**

- Test guest add/update/remove/refresh behavior and server preview failure handling.
- Test authenticated behavior remains on the existing API routes.
- Test guest-to-authenticated merge success, partial rejection, retry behavior, and clear-after-success semantics.
- Test logout/login transitions do not leak one user’s cart into another user’s local guest state.

**Commit:** feat(client): add dual-source cart state

### 6. Enable guest add-to-cart and make the cart route public

**Files:**

- Modify client/src/components/common/PaginatedItems.tsx, client/src/pages/HomePage.tsx, client/src/features/products/pages/ProductPage.tsx, client/src/features/products/api.ts, client/src/features/orders/pages/CartPage.tsx, and client/src/routes/router.tsx.
- Modify client/src/i18n/en.ts, client/src/i18n/vi.ts, and relevant SCSS files.
- Add focused component tests for the add-to-cart states and public cart routing.

**Steps:**

- Replace page-level login blocking for cart additions with the shared CartContext mutation. Keep wishlist and review actions authenticated because they remain out of scope.
- Preserve visible success/error feedback and accessible button names for both authenticated and guest additions.
- Remove the authentication wrapper from /cart only. Keep account, wishlist, address, notification, and customer order-history routes protected.
- Ensure the cart can render after a refresh with local guest entries, including loading and unavailable-product states.
- Keep responsive behavior and existing design conventions; do not introduce a new UI framework or unrelated visual redesign.

**Tests and verification:**

- Test add-to-cart from home/catalog/product detail for a signed-out user.
- Test that wishlist actions still require authentication.
- Test public /cart rendering and authenticated /cart compatibility at desktop and mobile viewport sizes where the existing test setup allows.

**Commit:** feat(client): allow guest cart additions

### 7. Build guest checkout, public success, and order lookup UI

**Files:**

- Modify client/src/features/orders/components/CheckoutPaymentPage.tsx, client/src/features/orders/pages/CartPage.tsx, client/src/features/orders/pages/CheckoutSuccessPage.tsx, client/src/features/orders/pages/checkoutSuccessStorage.ts, client/src/routes/router.tsx, client/src/i18n/en.ts, client/src/i18n/vi.ts, and checkout styles.
- Add client/src/features/orders/pages/GuestOrderLookupPage.tsx and its styles/tests.
- Add or extend client/src/features/orders/api.ts and client/src/features/orders/types.ts for guest purchase, session, lookup, and session finalization.

**Steps:**

- Allow guests to submit email, recipient name, address, city, country, and optional phone. Keep saved-address loading limited to authenticated users.
- Send only product IDs, quantities, validated contact, shipping, discount code, and payment method. Do not send client totals or prices as trusted values.
- Route cash, bank transfer, and PayOS to guest purchase when no authenticated user exists. Route Stripe/Card to guest session creation and preserve the redirect flow.
- Store the raw token only in the existing checkout session storage for the active browser flow. Clear guest cart storage after immediate purchase succeeds, or after Stripe order finalization is confirmed.
- Make /checkout-success public. For guests, show order ID, payment method, submitted email, token, copy action, and a link to /guest-order. Do not claim email delivery. Keep authenticated success behavior intact.
- Add /guest-order with order ID and token fields, client-side validation, inline errors, loading state, guest-safe order rendering, and no token logging.
- Keep checkout validation errors inline and use transient toasts only for contextual failures. Preserve responsive keyboard-accessible form behavior.

**Tests and verification:**

- Test guest form validation and request payloads for every supported payment method.
- Test immediate success clears local cart only after a successful response.
- Test Stripe success waits for guest session finalization and preserves the token across redirect.
- Test success and lookup pages do not require authentication and reject missing/wrong tokens.
- Test authenticated checkout and success routes retain their current behavior.

**Commit:** feat(client): add guest checkout and order lookup

### 8. Preserve admin compatibility and document the new contract

**Files:**

- Modify server/src/orders/orders.repository.ts, server/src/orders/orders.service.ts, server/src/orders/orders.types.ts, client/src/features/admin/pages/AdminOrderPage.tsx, and the relevant client order types/API.
- Modify Wiki/index.md, Wiki/architecture.md, and Wiki/log.md.
- Add Wiki/decisions/0004-guest-cart-and-checkout.md and Wiki/concepts/guest-checkout.md.
- Add focused admin rendering tests if the existing client harness supports them.

**Steps:**

- Keep customer order history filtered by authenticated user ID and exclude guest orders from it.
- Update admin order queries and display DTOs to use a left join and show guest name/email/phone when no user exists. Avoid exposing the raw guest token.
- Ensure admin status updates, order details, inventory timeline, and payment information still work for nullable user IDs.
- Document the guest cart storage boundary, token-protected lookup, nullable order identity, reservation behavior, non-goals, and operational migration caution.
- Update Wiki/index.md last-updated metadata and append a one-line entry to Wiki/log.md. Use Obsidian wikilinks for the new decision/concept pages.

**Tests and verification:**

- Test an admin list/detail response for both authenticated and guest orders.
- Test that customer order history never returns another user’s order or a guest order.
- Review the documentation against the approved spec and current route/schema names.

**Commit:** docs: document guest cart and checkout architecture

### 9. Run the complete verification and manual browser smoke checks

**Files:** No source changes are expected unless a verification result identifies a concrete defect. Keep any fix scoped to the failing task and add a regression test.

**Commands:**

    pnpm --dir server typecheck
    pnpm --dir server build
    pnpm --dir server lint
    pnpm --dir server test -- --run

    pnpm --dir client exec tsc -p tsconfig.json --noEmit
    pnpm --dir client build
    pnpm --dir client lint
    pnpm --dir client test -- --run

    git diff --check

**Manual Playwright smoke flow:**

- Start the independent server and client development processes using the repository commands.
- At desktop and mobile viewport sizes, open home, catalog, and product detail while signed out; add a product and verify /cart survives a refresh.
- Verify preview price/stock data and an actionable insufficient-stock message.
- Complete cash and bank transfer in a local test environment; verify the success token and guest lookup.
- Exercise PayOS and Stripe/Card mock mode, including redirect/finalization and a repeated webhook-shaped completion if the local harness exposes it.
- Verify signed-in cart/checkout, customer order history, wishlist, and admin order pages remain usable.
- Do not add a root Playwright configuration or committed E2E suite; use the existing project conventions and manual/browser tooling for this smoke pass.

**Final review checklist:**

- Confirm only intended files are changed and no .env, token, cookie, or production credential is staged.
- Confirm no authentication, ownership, role, CSRF, or webhook signature check was broadened.
- Confirm no raw guest token or payment secret appears in logs, API responses other than creation, browser URL, or persisted cart state.
- Confirm the migration is present and validated but has not been run against production.
- Confirm the branch remains feature/guest-cart-checkout and no push or merge into main was performed.

## Completion Criteria

- Every task above is checked off only after its focused tests and review pass.
- All package verification commands that are runnable in the current environment are reported with their results.
- The accepted design spec and this implementation plan remain committed on the feature branch.
- Any unresolved infrastructure limitation is recorded explicitly instead of being presented as a passing application check.
