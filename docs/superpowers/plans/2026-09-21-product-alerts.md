# Product Alerts Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Build authenticated price-drop and back-in-stock alerts with durable MySQL event identity, localized in-app notifications, responsive Product Detail/Wishlist controls, and complete automated verification.

**Architecture:** Add a standalone `product-alerts` backend feature with a subscription table and an event ledger. Product and order services call a transaction-aware alert service while they already hold the authoritative product row lock; the service fans out notifications with a unique `(alert_event_id, user_id)` guard. The client gets a small `productAlerts` API layer, a reusable accessible alert-control component, page-owned loading/update state, and localized notification rendering through the existing account notification center.

**Tech Stack:** NestJS 11 + Express 5, MySQL repositories with transaction contexts, Prisma schema/migrations as the partial schema projection, React 19 + TypeScript strict mode, Axios `http` client with CSRF interceptor, Vitest + Testing Library, SCSS BEM styles, existing theme tokens, existing EN/VI dictionaries, and Playwright for rendered verification.

**Spec:** `docs/superpowers/specs/2026-09-21-product-alerts-design.md`

## Global Constraints

- Work directly on the current `bugfix/production-visual-p1-fixes` worktree; do not create a worktree or branch.
- Preserve all unrelated dirty changes, especially the existing storefront visual/i18n changes; stage only alert files if a commit is explicitly requested later.
- Keep `client/` and `server/` as independent pnpm packages; do not add a root workspace, root lockfile, or root Playwright setup.
- MySQL remains the runtime persistence boundary; Prisma schema and forward migration metadata must stay aligned with the new tables/columns.
- Keep alert delivery in-app only for this version; do not add email, SMS, browser push, Firebase push, target prices, or price-history UI.
- Use `AuthGuard`, `RolesGuard`, `OwnerParam("uid")`, and Zod validation for every customer alert endpoint.
- Use transaction-aware, parameterized repository queries; never trust a client-supplied user ID or product price/stock value.
- Preserve existing notification, wishlist, product, cart, checkout, CSRF, response-envelope, route, and ownership contracts; additions must be additive.
- Compare effective prices using valid positive `sale_price < price`, otherwise `price`; emit price-drop events only for strict decreases.
- Emit back-in-stock events only for raw stock transitions `<= 0` to `> 0`; checkout deductions and reservation changes are not restocks.
- Add all customer-facing copy to both `client/src/i18n/en.ts` and `client/src/i18n/vi.ts`; use existing VND/date/theme helpers.
- Use accessible 44px controls, visible focus, `aria-checked`, live save/error feedback, mobile-first layout, and `prefers-reduced-motion`.
- Follow TDD: write each focused test first, run it and observe the expected failure, then write the smallest production change and rerun the test.
- Do not run production migrations or reset/seed production data; local schema verification is limited to the isolated development/integration database.

## Review Focus

- A price can fall to a previously used value after rising; the new transition must create a new event rather than being suppressed by a price-only dedupe key. Test in Task 1.
- Raw stock can be positive while reservations make available stock zero; this must not create a back-in-stock event until raw stock crosses the boundary. Test in Task 1 and Task 3.
- Disabling both flags must remove only the authenticated user's subscription, while another user's subscription for the same product remains untouched. Test in Task 2.
- Notification metadata can be absent, malformed, or contain non-string values; the notification UI must fall back safely without displaying `undefined`. Test in Task 6.
- A guest can see alert controls but must be redirected to Login with the encoded product URL; an authenticated toggle failure must roll back its visual state and expose retry. Test in Task 5 and Task 7.

## File Map

### Backend

- Create `server/src/product-alerts/product-alerts.types.ts` for alert types, snapshots, preferences, and normalized responses.
- Create `server/src/product-alerts/product-alerts.policy.ts` for pure effective-price and transition decisions.
- Create `server/src/product-alerts/product-alerts.validator.ts` for route, product ID, and update-body Zod schemas.
- Create `server/src/product-alerts/product-alerts.dto.ts` for controller input types.
- Create `server/src/product-alerts/product-alerts.repository.ts` for subscription SQL, event insertion, and one-query notification fan-out.
- Create `server/src/product-alerts/product-alerts.service.ts` for subscription policy and transaction orchestration.
- Create `server/src/product-alerts/product-alerts.controller.ts` for the three customer endpoints.
- Create `server/src/product-alerts/product-alerts.module.ts` for controller/provider/rate-limit wiring.
- Create `server/src/product-alerts/__tests__/product-alerts.policy.test.ts`.
- Create `server/src/product-alerts/__tests__/product-alerts.repository.test.ts`.
- Create `server/src/product-alerts/__tests__/product-alerts.service.test.ts`.
- Create `server/src/product-alerts/__tests__/product-alerts.controller.test.ts`.
- Create `server/src/database/prisma/migrations/20260921160000_product_alerts/migration.sql`.
- Modify `server/src/database/prisma/schema.prisma` with the two alert models and notification metadata/event fields.
- Modify `server/src/notifications/notifications.types.ts`, `notifications.repository.ts`, and `notifications.service.ts` for safe metadata normalization and typed notification inputs.
- Modify `server/src/products/products.service.ts` and `products.module.ts` for locked transition capture and module import.
- Modify `server/src/orders/orders.service.ts` and `orders.module.ts` for cancellation-restock transition capture and module import.
- Modify `server/src/app.module.ts` to register the new controller/module once.
- Modify `server/src/products/__tests__/products.service.test.ts` and `server/src/orders/__tests__/orders.service.test.ts` with trigger regression coverage where existing harnesses support it.

### Frontend

- Create `client/src/features/productAlerts/types.ts` for API and control contracts.
- Create `client/src/features/productAlerts/api.ts` for authenticated GET/PUT calls through `client/src/lib/http.ts`.
- Create `client/src/features/productAlerts/components/ProductAlertControls.tsx` for the reusable switch panel.
- Create `client/src/features/productAlerts/components/ProductAlertControls.test.tsx`.
- Create `client/src/features/productAlerts/api.test.ts`.
- Modify `client/src/features/products/pages/ProductPage.tsx` to load/update the product preference and render the alert panel.
- Modify `client/src/components/common/__tests__/ShopAndProductDetailSurface.test.tsx` and `client/src/components/common/__tests__/GuestCartEntryPoints.test.tsx` with Product Detail alert scenarios.
- Modify `client/src/pages/WishlistPage.tsx` to load the bounded alert list and update per-product preferences without N+1 requests.
- Modify `client/src/components/common/WishlistItem.tsx` to render compact alert controls and error/retry state.
- Create `client/src/pages/WishlistPage.test.tsx` for the new bounded alert-list and per-row update behavior.
- Modify `client/src/styles/pages/_product.scss` and `client/src/styles/pages/_wishlist.scss` with theme-token-based BEM styles.
- Modify `client/src/features/users/pages/CustomerAccountPage.tsx` and `CustomerAccountPage.test.tsx` for `price_drop`/`back_in_stock` notification copy and fallback behavior.
- Modify `client/src/i18n/en.ts` and `client/src/i18n/vi.ts` with all alert controls, statuses, notification labels, and error copy.
- Modify `client/src/i18n/dictionary.test.ts` with alert-copy parity assertions.

### Documentation

- Modify `docs/API.md` with the three customer alert endpoints and examples.
- Create `Wiki/entities/product-alert.md` for subscription/event/notification relationships.
- Modify `Wiki/architecture.md` with the new transaction-aware alert boundary.
- Modify `Wiki/index.md` last-updated date and catalog entry.
- Append one concise implementation entry to `Wiki/log.md`.

## Implementation Tasks

### Task 1: Alert policy and forward schema

**Files:**
- Create: `server/src/product-alerts/product-alerts.types.ts`
- Create: `server/src/product-alerts/product-alerts.policy.ts`
- Test: `server/src/product-alerts/__tests__/product-alerts.policy.test.ts`
- Create: `server/src/database/prisma/migrations/20260921160000_product_alerts/migration.sql`
- Modify: `server/src/database/prisma/schema.prisma`

**Interfaces:**
- Produces `ProductAlertType = "price_drop" | "back_in_stock"`.
- Produces `ProductSnapshot = { productId: number; price: number; salePrice: number | null; stock: number }`.
- Produces `effectiveProductPrice(price: unknown, salePrice: unknown): number`.
- Produces `getProductAlertTransitions(before: ProductSnapshot, after: ProductSnapshot): ProductAlertTransition[]`.
- Produces `ProductAlertPreference = { productId: number; priceDropEnabled: boolean; backInStockEnabled: boolean }`.

- [ ] **Step 1: Write failing policy tests**

  Add tests that assert:

  ```ts
  expect(effectiveProductPrice(100, 80)).toBe(80);
  expect(effectiveProductPrice(100, 0)).toBe(100);
  expect(effectiveProductPrice(100, 120)).toBe(100);
  expect(getProductAlertTransitions(
      { productId: 7, price: 100, salePrice: null, stock: 4 },
      { productId: 7, price: 90, salePrice: null, stock: 4 },
  )).toEqual([expect.objectContaining({ type: "price_drop", previousPrice: 100, currentPrice: 90 })]);
  ```

  Also cover no transition for equal price, a price increase, stock `0 -> 4`,
  stock `-1 -> 4`, stock `4 -> 0`, and raw stock `4 -> 4` even if available
  stock would be zero due to reservations. Add the rise-then-fall-to-the-same-
  price case to prove the policy returns a new transition each time.

- [ ] **Step 2: Run the focused test and verify the expected failure**

  Run:

  ```powershell
  pnpm --dir server exec vitest run src/product-alerts/__tests__/product-alerts.policy.test.ts
  ```

  Expected: FAIL because the policy module does not exist yet, not because of a
  test setup or import error.

- [ ] **Step 3: Implement the minimal pure policy**

  Normalize finite numeric input, treat an invalid/non-positive sale price as
  inactive, compute the effective price once per snapshot, and return at most
  one `price_drop` plus one `back_in_stock` transition. Preserve decimal values
  as numbers without rounding in the policy; currency formatting belongs to the
  notification/client layer.

- [ ] **Step 4: Run the focused test and verify it passes**

  Run the same Vitest command. Expected: all policy tests PASS.

- [ ] **Step 5: Add the forward MySQL migration and Prisma projection**

  Add `product_alert_subscriptions` with a unique `(user_id, product_id)`,
  `product_alert_events` with typed previous/current price and stock fields, and
  `metadata JSON NULL` plus `alert_event_id INT NULL` to
  `customer_notifications`. Add indexes and foreign keys only where the
  current baseline uses the same referenced tables. Add matching Prisma models,
  nullable notification metadata/event fields, and mapped names in
  `schema.prisma`; do not edit production data or the legacy dump.

- [ ] **Step 6: Validate schema artifacts without applying production changes**

  Run:

  ```powershell
  pnpm --dir server prisma:format
  pnpm --dir server prisma:validate
  ```

  Expected: both commands PASS against the local schema files. If the local DB
  is available later, apply only the isolated development migration during the
  verification task.

### Task 2: Subscription API and notification persistence

**Files:**
- Create: `server/src/product-alerts/product-alerts.validator.ts`
- Create: `server/src/product-alerts/product-alerts.dto.ts`
- Create: `server/src/product-alerts/product-alerts.repository.ts`
- Create: `server/src/product-alerts/product-alerts.service.ts`
- Create: `server/src/product-alerts/product-alerts.controller.ts`
- Create: `server/src/product-alerts/product-alerts.module.ts`
- Test: `server/src/product-alerts/__tests__/product-alerts.repository.test.ts`
- Test: `server/src/product-alerts/__tests__/product-alerts.service.test.ts`
- Test: `server/src/product-alerts/__tests__/product-alerts.controller.test.ts`
- Modify: `server/src/notifications/notifications.types.ts`
- Modify: `server/src/notifications/notifications.repository.ts`
- Modify: `server/src/notifications/notifications.service.ts`
- Modify: `server/src/app.module.ts`

**Interfaces:**
- `ProductAlertsRepository.listByUser(uid: string): Promise<ProductAlertPreference[]>`.
- `ProductAlertsRepository.findByUserAndProduct(uid: string, productId: number): Promise<ProductAlertPreference | null>`.
- `ProductAlertsRepository.savePreference(uid: string, productId: number, input: ProductAlertUpdateInput): Promise<ProductAlertPreference>`.
- `ProductAlertsRepository.recordTransitionsInTransaction(tx: TransactionContext, transitions: ProductAlertTransition[]): Promise<void>`.
- `ProductAlertsService.getForUser(uid)`, `getForProduct(uid, productId)`, and `updateForUser(uid, productId, input)`.
- `ProductAlertsService.recordTransitionsInTransaction(tx, transitions)`.

- [ ] **Step 1: Write failing repository/service/controller tests**

  Test the repository's parameterized user/product scope and that both-false
  updates delete the subscription. Test service normalization of missing rows
  into disabled preferences, invalid product IDs, and a transaction fan-out
  that inserts one event and one `INSERT ... SELECT` notification statement per
  transition type. Test the controller's `GET`/`PUT` response envelopes and
  that the update body contains booleans only.

- [ ] **Step 2: Run focused tests and verify the expected failures**

  Run:

  ```powershell
  pnpm --dir server exec vitest run src/product-alerts/__tests__/product-alerts.repository.test.ts src/product-alerts/__tests__/product-alerts.service.test.ts src/product-alerts/__tests__/product-alerts.controller.test.ts
  ```

  Expected: FAIL because the new feature files and providers do not exist yet.

- [ ] **Step 3: Implement Zod validators and repository subscription methods**

  Validate `uid` as a non-empty route string, `productId` as a positive integer,
  and the update body as `{ priceDropEnabled: z.boolean(), backInStockEnabled: z.boolean() }`.
  Implement parameterized `SELECT`, `INSERT ... ON DUPLICATE KEY UPDATE`, and
  delete-on-both-false queries. Return a disabled default for a missing
  subscription only in the service, not by fabricating a database row.

- [ ] **Step 4: Implement transaction-aware event fan-out**

  For each transition, insert one `product_alert_events` row, capture its
  insert ID, then use one parameterized `INSERT INTO customer_notifications ...
  SELECT` joining `product_alert_subscriptions` and `products`. Use `type`
  `price_drop` or `back_in_stock`, an encoded `/product?id=<id>` link, bounded
  JSON metadata, and `ON DUPLICATE KEY UPDATE id = id` for the unique event/user
  guard. Do not loop over users with individual queries.

- [ ] **Step 5: Extend notification normalization safely**

  Add optional `metadata` and `alert_event_id` to the backend notification row
  type and select them in the repository. Parse JSON only when the driver
  returns a string; accept an object only when it is a plain record; otherwise
  return null. Preserve all existing order notification fields and behavior.

- [ ] **Step 6: Implement the service/controller/module**

  Keep controller methods thin and use the existing `ZodValidationPipe`,
  `AuthGuard`, `RolesGuard`, and `OwnerParam("uid")`. Return `{ alerts, msg }`
  for list, `{ alert, msg }` for single/update, and keep all ownership checks
  server-side. Add a rate limit matching the existing customer notification and
  wishlist modules. Export `ProductAlertsService` for Products and Orders.

- [ ] **Step 7: Register the module and run focused tests**

  Import `ProductAlertsModule` in `AppModule`; verify provider exports do not
  create a circular import. Run the three focused test files again and expect
  PASS. Then run `pnpm --dir server typecheck` to catch module/type errors.

### Task 3: Wire authoritative product and order transitions

**Files:**
- Modify: `server/src/products/products.service.ts`
- Modify: `server/src/products/products.module.ts`
- Modify: `server/src/orders/orders.service.ts`
- Modify: `server/src/orders/orders.module.ts`
- Test: `server/src/products/__tests__/products.service.test.ts`
- Test: `server/src/orders/__tests__/orders.service.test.ts`

**Interfaces:**
- Consumes `ProductAlertsService.recordTransitionsInTransaction(tx, transitions)` from Task 2.
- Produces no alert for checkout stock deduction or unchanged product saves.

- [ ] **Step 1: Add failing trigger regression tests**

  Add product-service tests for `0 -> 8` inventory update, effective price
  decrease, equal effective price, and unchanged stock. Add order-service
  coverage for cancellation restoring `0 -> quantity`, while ensuring the
  existing cancellation path remains idempotent. Assert the alert service is
  called with the locked before/after values, not client-provided values.

- [ ] **Step 2: Run the trigger tests and verify the expected failure**

  Run:

  ```powershell
  pnpm --dir server exec vitest run src/products/__tests__/products.service.test.ts src/orders/__tests__/orders.service.test.ts
  ```

  Expected: FAIL because the services do not inject or call `ProductAlertsService`.

- [ ] **Step 3: Make product updates compare locked authoritative snapshots**

  In `updateProductDetailsService`, re-read the product row with `FOR UPDATE`
  inside the existing `withTransaction` callback before writing. Compare that
  row to the new price/sale-price/stock values and call the alert service before
  the transaction commits. Preserve existing attribute replacement and
  inventory movement behavior. In `updateInventoryService`, reuse the locked
  stock row and call the alert service only after the update succeeds.

- [ ] **Step 4: Wire cancellation restock transitions**

  Inject `ProductAlertsService` into `NestOrdersService`, call it after each
  successful `stock = stock + quantity` update using the locked stock-before
  and computed stock-after values, and leave checkout deduction code untouched.
  Update `OrdersModule`/`ProductsModule` imports and provider exports as needed.

- [ ] **Step 5: Run trigger tests and the server checks**

  Run the focused tests again, then:

  ```powershell
  pnpm --dir server typecheck
  pnpm --dir server build
  pnpm --dir server lint
  ```

  Expected: PASS, with any unrelated baseline warnings reported separately.

### Task 4: Client alert API and reusable control contract

**Files:**
- Create: `client/src/features/productAlerts/types.ts`
- Create: `client/src/features/productAlerts/api.ts`
- Create: `client/src/features/productAlerts/components/ProductAlertControls.tsx`
- Create: `client/src/features/productAlerts/api.test.ts`
- Create: `client/src/features/productAlerts/components/ProductAlertControls.test.tsx`

**Interfaces:**
- `ProductAlertPreference` mirrors the server response with camelCase fields.
- `fetchProductAlerts(uid: string): Promise<ProductAlertPreference[]>`.
- `fetchProductAlert(uid: string, productId: number): Promise<ProductAlertPreference>`.
- `updateProductAlert(uid: string, productId: number, input: ProductAlertUpdateInput): Promise<ProductAlertPreference>`.
- `ProductAlertControls` accepts a preference, variant (`"product" | "wishlist"`), saving/error state, and an `onToggle` callback; it does not own authentication or HTTP.

- [ ] **Step 1: Write failing API and control tests**

  Assert API wrappers call `/api/users/:uid/product-alerts` through the shared
  `http` client with the exact GET/PUT paths and camelCase payload. Render the
  control component and assert two `role="switch"` controls expose accurate
  `aria-checked`, labels, helper text, disabled/saving state, and a live error.

- [ ] **Step 2: Run the focused client tests and verify failure**

  Run:

  ```powershell
  pnpm --dir client exec vitest run src/features/productAlerts/api.test.ts src/features/productAlerts/components/ProductAlertControls.test.tsx
  ```

  Expected: FAIL because the API/component files do not exist.

- [ ] **Step 3: Implement typed API wrappers**

  Use `client/src/lib/http.ts` only. Normalize missing `alerts`/`alert` payloads
  to safe defaults, preserve Axios errors for page-level retry handling, and do
  not send a user ID in the request body.

- [ ] **Step 4: Implement the presentational control panel**

  Use existing SVG icon components, real labelled switch buttons, a compact
  product variant and a stacked wishlist variant. Keep switch labels and helper
  text visible in both themes; expose saving through `aria-busy` and a live
  status; never rely on orange/green alone to communicate state.

- [ ] **Step 5: Run the focused client tests and typecheck**

  Run the same Vitest command, then:

  ```powershell
  pnpm --dir client exec tsc -p tsconfig.json --noEmit
  ```

  Expected: PASS.

### Task 5: Product Detail and Wishlist integration

**Files:**
- Modify: `client/src/features/products/pages/ProductPage.tsx`
- Modify: `client/src/components/common/__tests__/ShopAndProductDetailSurface.test.tsx`
- Modify: `client/src/components/common/__tests__/GuestCartEntryPoints.test.tsx`
- Modify: `client/src/pages/WishlistPage.tsx`
- Modify: `client/src/components/common/WishlistItem.tsx`
- Create: `client/src/pages/WishlistPage.test.tsx`
- Modify: `client/src/styles/pages/_product.scss`
- Modify: `client/src/styles/pages/_wishlist.scss`
- Modify: `client/src/i18n/en.ts`
- Modify: `client/src/i18n/vi.ts`

**Interfaces:**
- Consumes the Task 4 API and `ProductAlertControls` contracts.
- Product Detail owns one-product load/update state; Wishlist owns one bounded
  alert-list load and per-product update state, avoiding one request per row.

- [ ] **Step 1: Add failing Product Detail/Wishlist tests**

  Product Detail tests must cover guest click redirect to
  `/login?redirect=%2Fproduct%3Fid%3D<id>`, authenticated preference loading,
  successful toggle, and failed toggle rollback/retry. Wishlist tests must cover
  loading the alerts list once, rendering the matching preference per row,
  updating one row without affecting another, and preserving alert state after
  wishlist removal in the local UI model.

- [ ] **Step 2: Run the focused tests and verify failure**

  Run:

  ```powershell
  pnpm --dir client exec vitest run src/components/common/__tests__/ShopAndProductDetailSurface.test.tsx src/components/common/__tests__/GuestCartEntryPoints.test.tsx src/pages/WishlistPage.test.tsx
  ```

  Expected: FAIL because the pages do not load or render alert preferences yet.

- [ ] **Step 3: Integrate Product Detail state and guest routing**

  Load the single-product alert preference only for an authenticated `uid`; use
  a disabled default for guests. Render the panel beneath purchase actions. For
  guest toggles, navigate with `encodeURIComponent(location.pathname + location.search)`.
  For authenticated updates, optimistically set one flag, call the API, restore
  the previous preference on failure, and expose a retryable inline message.
  Alert state must never enable Add to Cart.

- [ ] **Step 4: Integrate Wishlist bounded state**

  Fetch `/product-alerts` once alongside the wishlist load, index the response by
  `productId`, pass each preference to `WishlistItem`, and update only the
  targeted map entry after a successful PUT. If the alert-list request fails,
  keep the wishlist usable and show retry/error state in the alert subsection.

- [ ] **Step 5: Add responsive themed styles and copy**

  Add BEM styles to `_product.scss` and `_wishlist.scss` using existing semantic
  tokens. Keep desktop controls aligned without expanding the row's left gutter;
  stack the alert panel below product information on mobile; reserve image and
  control space to prevent layout shift; add visible focus/pressed/disabled
  states and a reduced-motion media query. Add exact EN/VI labels, helper text,
  loading, saved, error, retry, login-required, and switch-state copy.

- [ ] **Step 6: Run focused tests and browser-independent checks**

  Run the focused page/control tests, then:

  ```powershell
  pnpm --dir client exec tsc -p tsconfig.json --noEmit
  pnpm --dir client build
  ```

  Expected: PASS with no clipped alert text or TypeScript errors.

### Task 6: Localized notification center integration

**Files:**
- Modify: `client/src/features/users/pages/CustomerAccountPage.tsx`
- Modify: `client/src/features/users/pages/CustomerAccountPage.test.tsx`
- Modify: `client/src/features/users/types.ts` if needed for `metadata` fields.
- Modify: `client/src/i18n/en.ts`
- Modify: `client/src/i18n/vi.ts`

**Interfaces:**
- Consumes backend `metadata` from Task 2 and existing `CustomerNotification`.
- Produces localized `price_drop` and `back_in_stock` type labels/title/message
  with server-copy fallback for malformed metadata.

- [ ] **Step 1: Add failing notification tests**

  Add one valid price-drop notification with `{ productName, currentPrice }`, one
  valid back-in-stock notification, and one malformed/empty metadata case. Assert
  EN and VI copy, VND formatting, product link, read/mark-read behavior, and no
  `undefined` text.

- [ ] **Step 2: Run the notification tests and verify failure**

  Run:

  ```powershell
  pnpm --dir client exec vitest run src/features/users/pages/CustomerAccountPage.test.tsx
  ```

  Expected: FAIL because the existing notification copy resolver only knows the
  current order and fallback branches.

- [ ] **Step 3: Extend the copy resolver and dictionaries**

  Add explicit `price_drop` and `back_in_stock` branches before the generic
  fallback. Validate metadata fields with small local type guards, format the
  current price through `formatCurrency`, and use server title/message when the
  product name or price is missing. Add type labels, titles, messages, and
  accessibility copy to both dictionaries.

- [ ] **Step 4: Run notification tests and client quality checks**

  Run the focused test, then:

  ```powershell
  pnpm --dir client exec tsc -p tsconfig.json --noEmit
  pnpm --dir client lint
  ```

  Expected: PASS.

### Task 7: Documentation, integration verification, and visual review

**Files:**
- Modify: `docs/API.md`
- Create: `Wiki/entities/product-alert.md`
- Modify: `Wiki/architecture.md`
- Modify: `Wiki/index.md`
- Append: `Wiki/log.md`
- Verify: changed backend/client tests and rendered routes through Playwright.

- [ ] **Step 1: Document the API and domain model**

  Add the three endpoint paths, auth/ownership requirements, request/response
  examples, alert transition semantics, and notification metadata fallback to
  `docs/API.md`. Add the product-alert entity page with links to the product,
  user, subscription, event, and customer-notification relationships.

- [ ] **Step 2: Update the Wiki architecture catalog**

  Add the new transaction-aware `product-alerts` boundary to
  `Wiki/architecture.md`, add `[[product-alert]]` to `Wiki/index.md`, bump the
  last-updated date to `2026-09-21`, and append one factual line to
  `Wiki/log.md`.

- [ ] **Step 3: Apply and verify the migration only in the isolated local DB**

  If the local development database is available, run the repository's existing
  migration command against that database, inspect the two new tables and the
  notification columns, and run the focused backend integration tests. Do not
  use production credentials, production URLs, reset commands, or seed commands
  for this feature.

- [ ] **Step 4: Run the complete relevant quality gates**

  Run:

  ```powershell
  pnpm --dir server typecheck
  pnpm --dir server build
  pnpm --dir server lint
  pnpm --dir server test -- --run
  pnpm --dir client exec tsc -p tsconfig.json --noEmit
  pnpm --dir client build
  pnpm --dir client lint
  pnpm --dir client test -- --run
  ```

  Record any environment-only integration failure separately from application
  failures; do not mask a red test.

- [ ] **Step 5: Verify the rendered customer flows with Playwright**

  Use the already-running client/server; do not start another port. At 1440x900
  and a mobile viewport, verify:

  1. Guest Product Detail alert click redirects to Login with the encoded return URL.
  2. Authenticated Product Detail loads both switches and successfully toggles one.
  3. Wishlist loads alert state in one list request, updates one row, and keeps prices/actions aligned.
  4. Notifications shows price-drop and back-in-stock copy in EN and VI.
  5. Dark/light themes keep switch states, text, borders, and focus rings readable.
  6. No body-level horizontal overflow, clipped currency, or controls below 44px.

- [ ] **Step 6: Review the final diff and scope**

  Run `git diff --check`, inspect `git status --short`, and confirm only the
  alert spec/plan, alert implementation files, migration/schema/docs, and
  explicitly related tests are part of the feature diff. Preserve all existing
  unrelated dirty changes. Do not commit or push until the user explicitly
  requests that handoff.

## Handoff

After the plan is approved, execute it task-by-task with
`superpowers:executing-plans`. Pause after each task's focused tests and before
any destructive or production-facing operation. The image generated for design
review remains a preview reference only; production UI must use the existing
React/SCSS/icon system.
