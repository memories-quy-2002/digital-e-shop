# Internal Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace GHN with an internal delivery workflow that prices orders by road distance, assigns staff by schedule, and reports delivery status without collecting GPS.

**Architecture:** Keep the existing `shipping` feature as the compatibility boundary for checkout quotes, packing and customer delivery reads. Split route calculation, price policy, settings, assignment and persistence into focused services/repositories. Existing GHN shipment/event rows remain immutable; new internal orders retain the existing order-level packing state while separate assignment/event rows own last-mile delivery.

**Tech Stack:** NestJS 11, TypeScript, MySQL repositories, Prisma schema/migrations, Zod, React 19, Vite, Leaflet core, Vitest, pnpm.

**Spec:** `docs/superpowers/specs/2026-10-16-internal-delivery-design.md`

## Global Constraints

- Node.js `24.20.0`; pnpm `12.4.2`; client and server remain independent packages.
- Price route distance from configured OSRM-compatible road routing; never substitute straight-line distance.
- `< 5,000 m` costs `0 VND`; `5,000 to 20,000 m`, inclusive, costs `x`; `> 20,000 m` costs `y`, with `y > x`.
- Do not request, record, log, transmit, poll or display customer or employee GPS.
- Preserve authenticated/guest checkout ownership, guest-token lookup, CSRF, route aliases that remain provider-neutral, response envelopes, PayOS/COD behavior and order completion guards.
- MySQL feature repositories own SQL; Prisma schema/migrations stay aligned; schema changes are additive and never applied to production in this task.
- Keep existing GHN shipment/event rows and payloads unchanged and read-only; internal packing may retain the existing order-level fulfillment aggregate, but no carrier identifier/call/webhook/label/retry is created.
- Keep English/Vietnamese, light/dark, keyboard, responsive and screen-reader states aligned.
- Use existing dependencies where possible; add only Leaflet and its TypeScript definitions for the interactive map.

## Review Focus

- Invalid/no route, service timeout or malformed geometry must fail quote creation without inventing a price. **Task 1:** route adapter failure tests.
- Stale quote, changed address/pin/cart, expired quote or changed fee settings must not alter checkout totals silently. **Task 3:** quote fingerprint/version tests.
- Concurrent assignment writes must not double-book one employee or leave an order with two active assignments. **Task 4:** transaction-level overlap/concurrency test.
- A guessed assignment ID, another employee's ID, a disabled staff account or an invalid guest token must reveal no customer/order details. **Tasks 4 and 6:** authorization boundary tests.
- Concurrent/repeated `DELIVERED` requests must not duplicate COD collection, order completion, loyalty award, or email event. **Task 4:** idempotent completion test.

---

**Status:** approved by the Product Owner; implementation is underway. Tasks 1-2 are complete, Task 3 is in progress.  
**Branch:** `feature/internal-delivery` created in the current workspace from `fdf4d32` because it contains the approved Loyalty work that internal delivery completion must preserve; local `origin/main` is `b4176d8` and the GitHub remote could not be reached. This is a stacked branch; do not push or open a PR unless separately requested.

## Preflight

- [x] Confirm `git status --short` contains only the approved spec and this plan; do not carry unrelated application edits.
- [x] Check the live `origin/main` tip with `git ls-remote origin refs/heads/main`; if network is unavailable, verify the local `origin/main` ref and report it as the last reachable baseline.
- [x] Create `feature/internal-delivery` in the current workspace and keep the approved spec/plan in the branch. (Ruling: base on current feature branch to preserve Loyalty completion behavior; see SDD ledger.)

### Task 1: Distance pricing and road-route adapter

**Status: Complete — `5e66a73 feat(delivery): add road distance pricing`.**

**Files:**
- Create: `server/src/shipping/delivery.policy.ts`
- Test: `server/src/shipping/delivery.policy.test.ts`
- Create: `server/src/shipping/road-route.service.ts`
- Test: `server/src/shipping/road-route.service.test.ts`
- Modify: `server/src/shipping/shipping.types.ts`, `server/src/shipping/shipping.config.ts`
- Modify: `server/src/config/env.config.ts`
- Modify: `server/.env.example`, `server/.env.docker.example`

**Interfaces:**
- `RoadPoint = { latitude: number; longitude: number }`.
- `DeliveryAddress = { recipientName: string; recipientPhone: string; addressLine: string; city: string; country: "VN"; latitude: number; longitude: number }` for checkout; saved-address coordinates remain optional until pinned. Checkout validators require finite latitude `[-90, 90]` and longitude `[-180, 180]`.
- `RoadRoute = { distanceMeters: number; geometry: Array<[longitude: number, latitude: number]> }`.
- `RoadRouteService.getRoute(origin: RoadPoint, destination: RoadPoint, endpoint: string): Promise<RoadRoute>`; accept only an exact deployment-allowlisted endpoint, validate coordinate bounds and round provider route meters to the nearest whole meter before pricing.
- `calculateDeliveryFee(distanceMeters: number, bands: { fee5To20Vnd: number; feeOver20Vnd: number }): number`.

- [x] **Step 1: Write policy tests** asserting `4,999 -> 0`, `5,000 -> x`, `20,000 -> x`, and `20,001 -> y`; reject negative, fractional, unsafe distances/fees and `y <= x`. Route adapter tests assert `4,999.5 m` rounds to `5,000 m` before pricing.
- [x] **Step 2: Run `pnpm --dir server exec vitest run src/shipping/delivery.policy.test.ts`;** expected: fail because the policy is not implemented.
- [x] **Step 3: Implement `calculateDeliveryFee`** with fixed thresholds and whole-VND validation; no DB or HTTP dependency.
- [x] **Step 4: Write route-adapter tests** for valid OSRM route, `NoRoute`, timeout, malformed distance/geometry, unlisted endpoint and redirect; verify a private route endpoint is accepted only when its exact URL is deployment-allowlisted.
- [x] **Step 5: Run `pnpm --dir server exec vitest run src/shipping/road-route.service.test.ts`;** expected: fail because the adapter is not implemented.
- [x] **Step 6: Implement `RoadRouteService.getRoute`** using existing Axios, a 5-second request timeout, configured OSRM driving route path, exact deployment-allowlisted endpoint and redirects disabled. Permit private self-hosted routing only when the complete endpoint is explicitly configured; do not accept URL values from customer requests. Validate coordinate ranges; parse and round route distance to the nearest whole meter; validate GeoJSON geometry.
- [x] **Step 7: Run both targeted test files;** expected: pass with no straight-line fallback and no location APIs.
- [x] **Step 8: Commit** with `feat(delivery): add road distance pricing`.

### Task 2: Delivery settings and additive persistence

**Status: Complete — `d641ff3 feat(delivery): add delivery settings persistence`.**

**Files:**
- Create: `server/src/shipping/delivery-settings.repository.ts`
- Create: `server/src/shipping/delivery-settings.service.ts`
- Test: `server/src/shipping/delivery-settings.service.test.ts`
- Modify: `server/src/database/prisma/schema.prisma`
- Create: `server/src/database/prisma/migrations/20261016170000_internal_delivery/migration.sql`
- Modify: `server/src/addresses/addresses.validator.ts`, `addresses.dto.ts`, `addresses.repository.ts`, `addresses.service.ts`, `addresses.controller.ts`
- Modify: `server/src/shipping/shipping.module.ts`, `server/src/config/env.config.ts`
- Modify: server environment templates and `client/.env.example`

**Interfaces:**
- `DeliverySettings = { storeAddress: string; storeLatitude: number; storeLongitude: number; fee5To20Vnd: number; feeOver20Vnd: number; routingEndpoint: string; tileUrl: string; tileAttribution: string; version: number }`.
- `DeliverySettingsService.get(): Promise<DeliverySettings | null>`.
- `DeliverySettingsService.update(input: Omit<DeliverySettings, "version">, actorId: string): Promise<DeliverySettings>`.
- Repository writes and settings version increment run in one transaction; only exact deployment-allowlisted route/tile endpoint values may be selected. Private route hosts are allowed only when explicitly configured by the operator; tile URLs remain HTTPS.

- [x] **Step 1: Write settings tests** for missing configuration, invalid coordinates, `y <= x`, non-integer money, URL credentials/unlisted endpoints, deployment-allowlisted private routing, HTTPS tiles and version increments.
- [x] **Step 2: Run `pnpm --dir server exec vitest run src/shipping/delivery-settings.service.test.ts`;** expected: fail because settings service/repository are absent.
- [x] **Step 3: Add the additive migration** for singleton `delivery_settings`, internal `delivery_assignments` (one row per delivery attempt) and append-only `delivery_events`, optional customer address coordinates, and distance/coordinate/settings-version fields on existing `delivery_quotes`. Make legacy-only quote columns `service_type_id` and `parcel` nullable for new internal quotes without changing existing values. Keep every existing GHN shipment/event row unchanged; internal orders may still use the existing packing aggregate with provider `INTERNAL` and no carrier identifiers.
- [x] **Step 4: Add matching Prisma models/fields** and format/validate the Prisma schema; do not apply a production migration.
- [x] **Step 5: Implement settings repository/service and Zod validation**; audit actor and previous/new settings using the existing admin audit boundary.
- [x] **Step 6: Run settings tests and `pnpm --dir server prisma:validate`;** expected: pass.
- [x] **Step 7: Commit** with `feat(delivery): add delivery settings persistence`.

### Task 3: Internal checkout quote and immutable order snapshot

**Status: Complete — `1d87822 feat(delivery): quote checkout by road distance`.**

**Files:**
- Modify: `server/src/shipping/shipping-quote.service.ts`, `shipping-quote.repository.ts`, `shipping-quote.policy.ts`, `shipping.validator.ts`, `shipping.types.ts`
- Modify: checkout validators, DTOs, snapshot/repository code and tests under `server/src/orders/`
- Test: `server/src/shipping/__tests__/shipping-quotes.test.ts`, `shipping-checkout.integration.test.ts`, relevant order checkout tests

**Interfaces:**
- `InternalDeliveryQuote = { id: string; address: DeliveryAddress; origin: RoadPoint; destination: RoadPoint; distanceMeters: number; routeGeometry: RoadRoute["geometry"]; pricing: ShippingPricing; settingsVersion: number; tileUrl: string; tileAttribution: string; expiresAt: string }`; origin is returned so the customer map can show both configured store and destination pins.
- `ShippingQuoteService.createQuote(identity: QuoteIdentity, input: { address: DeliveryAddress; cart: CartItemRow[]; subtotal: number; discount: number }): Promise<InternalDeliveryQuote>`; destination coordinates come from `address.latitude/longitude`.
- Checkout continues to submit `shippingQuoteId` and `deliveryAddress`; destination coordinates are required in the quote/address binding.

- [x] **Step 1: Write quote tests** proving owner, guest-cart identity, address, coordinates, cart facts, expiry and settings version are fingerprinted; old provider-specific quote rows are rejected after cutover.
- [x] **Step 2: Run `pnpm --dir server exec vitest run src/shipping/__tests__/shipping-quotes.test.ts src/orders/checkout-flow.spec.ts src/orders/__tests__/checkout-reservation.service.test.ts`;** expected: fail for internal pricing and coordinate/config binding.
- [x] **Step 3: Implement provider-free quote orchestration**: read settings, call `RoadRouteService`, calculate fee, calculate existing merchandise/shipping payable totals, save one short-lived quote and return route geometry plus attribution.
- [x] **Step 4: Implement transactional quote consumption** that locks the quote, recomputes checkout merchandise totals, validates identity/cart/address/pin/version/expiry, consumes once and snapshots address, pin, route distance, fee, quote ID and version.
- [x] **Step 5: Update guest and authenticated checkout DTOs/validators** to accept manual pin coordinates while preserving quote ID, CSRF, PayOS and COD contracts.
- [x] **Step 6: Run quote, order and existing PayOS/COD checkout tests;** expected: no provider service ID or parcel data is required and the exact fee is included once.
- [x] **Step 7: Commit** with `feat(delivery): quote checkout by road distance`.

### Task 4: Staff roles, assignments and exactly-once completion

**Status: Implemented; isolated MySQL integration verification is deferred because the disposable test database is not configured.**

**Files:**
- Create: `server/src/shipping/delivery-assignment.repository.ts`, `delivery-assignment.service.ts`, `delivery.validator.ts`, `admin-delivery.controller.ts`, `delivery-staff.controller.ts`
- Modify: `server/src/shipping/admin-shipping.controller.ts`, `customer-shipping.controller.ts`, `fulfillment.service.ts`, `shipping.module.ts`, `server/src/app.module.ts`
- Modify: `server/src/shared/constants/user.ts`, `server/src/users/users.validator.ts`, `users.repository.ts`, `users.service.ts`
- Test: new `server/src/shipping/delivery-assignment.service.test.ts`, `delivery-staff.controller.test.ts`, `server/src/shipping/__tests__/delivery-assignment.integration.test.ts`, plus `server/src/shipping/__tests__/customer-shipping.controller.test.ts`

**Interfaces:**
- `DeliveryStatus = "ASSIGNED" | "OUT_FOR_DELIVERY" | "DELIVERED" | "DELIVERY_FAILED"`.
- `DeliveryAssignment = { id: number; orderId: number; employeeId: string; employeeName: string; scheduledStartAt: string; scheduledEndAt: string; status: DeliveryStatus; failureReason: string | null; events: DeliveryEvent[] }`.
- `DeliveryEvent = { id: number; status: DeliveryStatus; actorId: string | null; publicNote: string | null; createdAt: string }`.
- Customer projection returns only employee display name, schedule, public status and public events; internal failure reason is excluded.
- `DeliveryAssignmentService.assign(input: { orderId: number; employeeId: string; scheduledStartAt: Date; scheduledEndAt: Date }, adminId: string): Promise<DeliveryAssignment>`.
- `DeliveryAssignmentService.listForStaff(employeeId: string): Promise<DeliveryAssignment[]>`.
- `DeliveryAssignmentService.transition(input: { assignmentId: number; employeeId: string; status: DeliveryStatus; failureReason?: string }): Promise<DeliveryAssignment>`.
- Admin API: `GET/PUT /api/admin/delivery/settings`, `GET /api/admin/delivery/assignable-orders`, `GET /api/admin/delivery/staff`, `POST /api/admin/delivery/orders/:orderId/assignments`.
- Employee API: `GET /api/delivery/staff/assignments`, `GET /api/delivery/staff/assignments/:id`, `POST /api/delivery/staff/assignments/:id/status`.
- Customer reads retain owner/guest-token routes `/api/shipping/orders/:id` and `/api/shipping/guest/shipment`.

- [x] **Step 1: Write policy/service tests** for valid transitions, failed reason, active overlap, reassign audit history, staff ownership and terminal delivered state.
- [x] **Step 2: Run `pnpm --dir server exec vitest run src/shipping/delivery-assignment.service.test.ts src/shipping/delivery-staff.controller.test.ts`;** expected: fail before assignment persistence/service exists.
- [x] **Step 3: Add `DeliveryStaff` to shared/server role validation** and allow audited role grants through the existing admin user update flow; suspended/inactive accounts cannot act as drivers.
- [x] **Step 4: Implement admin assignment/settings controllers** guarded by `AuthGuard` + `RolesGuard(Admin)` at the declared admin routes. Reuse existing shipment/payment eligibility guards; only `READY_TO_SHIP` internal orders eligible for COD or verified payment can be assigned. Interpret schedules in `Asia/Ho_Chi_Minh`, require end > start, and reject invalid order, duplicate active assignment or overlapping active staff schedule in a transaction that locks the employee and order rows.
- [x] **Step 5: Implement employee controller** guarded by `AuthGuard` + `RolesGuard(DeliveryStaff)` at the declared employee routes. Scope each query by employee ID in SQL, reject inactive/suspended accounts, and allow only `OUT_FOR_DELIVERY`, `DELIVERED`, or `DELIVERY_FAILED` transitions. Require `OUT_FOR_DELIVERY` before a failure/delivery result, require a reason for failure, append events, and make duplicate same-state writes idempotent.
- [x] **Step 6: Implement customer delivery projection** on the existing owner and hashed guest-token boundaries. Return employee display name, schedule, status and public events only.
- [x] **Step 7: On first valid `DELIVERED`, call `completeDeliveredOrder`, COD collection, loyalty and transactional email in the existing transaction-aware path.** Preserve PayOS unpaid/simulated guards and make repeat/concurrent requests no-ops after the first commit.
- [x] **Step 8: Run the focused tests and full server suite.** Both passed; the MySQL integration test is implemented but not run because `DB_HOST=127.0.0.1` and `DB_NAME=retail_p0_test` are not configured.
- [x] **Step 9: Commit** with `feat(delivery): assign staff and record delivery status`.

**Implementation notes:** The assignment history endpoint `GET /api/admin/delivery/orders/:orderId` lets admins inspect reassignment attempts and events. A dedicated `AdminDeliveryController` keeps new internal delivery operations out of the legacy carrier controller. Lock rows in order → employee → assignment order so status updates and assignment writes use the same order and the employee row serializes schedule-overlap checks.

### Task 5: Checkout map and customer address UX

**Files:**
- Create: `client/src/features/shipping/components/DeliveryMapPicker.tsx` and focused test
- Modify: `client/src/features/shipping/components/DeliveryQuoteForm.tsx`, `client/src/features/shipping/api.ts`, `types.ts`
- Modify: `client/src/features/orders/components/CheckoutDeliverySection.tsx` and tests
- Modify: `client/src/features/users/pages/AddressBookPage.tsx` and tests
- Modify: `server/src/addresses/addresses.validator.ts`, `addresses.repository.ts`, `addresses.service.ts`, `addresses.controller.ts`
- Create: `client/e2e/internal-delivery.spec.ts`
- Modify: `client/package.json`, `client/pnpm-lock.yaml`, `client/src/lib/env.ts`, `client/.env.example`, shipping/user SCSS and `client/src/i18n/en.ts`/`vi.ts`

**Interfaces:**
- `DeliveryMapPicker` receives `store: RoadPoint`, `destination: RoadPoint`, `route: RoadRoute["geometry"]`, `tileUrl`, `tileAttribution`, `onDestinationChange(point: RoadPoint)` and an accessible coordinate/address fallback.
- Shipping API quote types match `InternalDeliveryQuote`; no province/service/parcel/sandbox response field remains in new checkout UI.

- [ ] **Step 1: Write component/API tests** for manual pin change, quote boundaries, loading/retry/no-route errors, saved-address coordinates and keyboard coordinate controls; assert no geolocation API is called.
- [ ] **Step 2: Run `pnpm --dir client exec vitest run src/features/shipping/components/DeliveryMapPicker.test.tsx src/features/shipping/components/DeliveryQuoteForm.test.tsx src/features/users/pages/AddressBookPage.test.tsx`;** expected: fail until internal quote/pin UI is implemented.
- [ ] **Step 3: Add `leaflet` and `@types/leaflet` only;** use Leaflet core within `useEffect`, configure tile URL/attribution, render two pins and quote polyline, and clean up map/listeners on unmount.
- [ ] **Step 4: Replace province/ward/service form controls** with structured address input, a manually positioned destination pin, route distance, fee and retryable errors. A saved address without a pin requires manual pin selection; never request browser location.
- [ ] **Step 5: Update checkout and address-book types/API** to preserve existing `shippingQuoteId` request property and optionally save coordinates.
- [ ] **Step 6: Add English/Vietnamese labels, visible focus, map attribution and responsive/light/dark styling.** Keep the address and coordinate controls usable without map dragging.
- [ ] **Step 7: Run the focused client tests;** expected: quote, keyboard, empty/error/loading and no-geolocation assertions pass.
- [ ] **Step 8: Commit** with `feat(delivery): add distance quote map to checkout`.

### Task 6: Admin, employee and customer workflows

**Files:**
- Modify: `client/src/features/shipping/pages/AdminFulfillmentPage.tsx`, `client/src/features/shipping/api.ts`, `types.ts`, `client/src/features/shipping/components/ShipmentTimeline.tsx`, shipping styles/tests
- Modify: `client/src/features/admin/pages/AdminAccountPage.tsx`, `client/src/features/admin/types.ts`, `client/src/features/admin/api.ts`, `client/src/types/user.ts`, auth guards, `client/src/routes/router.tsx`, router tests, `client/src/i18n/en.ts`, `client/src/i18n/vi.ts`
- Create: `client/src/features/auth/components/RequireDeliveryStaff.tsx` and `RequireDeliveryStaff.test.tsx`
- Create: `client/src/features/shipping/pages/AdminDeliverySettingsPage.tsx` and `AdminDeliverySettingsPage.test.tsx`
- Create: `client/src/features/shipping/pages/DeliveryStaffAssignmentsPage.tsx` and `DeliveryStaffAssignmentsPage.test.tsx`
- Test: `client/src/features/shipping/pages/AdminFulfillmentPage.test.tsx`, `client/src/features/admin/pages/AdminAccountPage.test.tsx`, `client/src/routes/router.test.tsx`, and existing `client/src/features/auth/components/RequireAdmin.test.tsx`

- [ ] **Step 1: Write UI tests** for admin settings/assignment, role editing, employee own-assignment view, customer public timeline, empty/loading/error states and a DeliveryStaff account being denied admin access.
- [ ] **Step 2: Run `pnpm --dir client exec vitest run src/features/shipping/pages/AdminFulfillmentPage.test.tsx src/features/shipping/pages/AdminDeliverySettingsPage.test.tsx src/features/shipping/pages/DeliveryStaffAssignmentsPage.test.tsx src/features/admin/pages/AdminAccountPage.test.tsx src/routes/router.test.tsx src/features/auth/components/RequireDeliveryStaff.test.tsx src/features/auth/components/RequireAdmin.test.tsx`;** expected: fail until the new role and pages are implemented.
- [ ] **Step 3: Update the admin board** to retain packing controls and add schedule assignment, employee, order contents, destination, COD and event history. Add settings page for store pin, fees, and allowlisted map/routing settings.
- [ ] **Step 4: Add the DeliveryStaff route guard/page** and customer status UI; show assignee, schedule and assigned/out/delivered/failed states. Keep legacy customer shipment events readable. Never render a driver position or live map.
- [ ] **Step 5: Add DeliveryStaff to the admin role editor and client role type.** Verify `RequireAdmin` still admits only Admin and the employee guard admits only active DeliveryStaff.
- [ ] **Step 6: Run `pnpm --dir client exec vitest run src/features/shipping/pages/AdminFulfillmentPage.test.tsx src/features/shipping/pages/AdminDeliverySettingsPage.test.tsx src/features/shipping/pages/DeliveryStaffAssignmentsPage.test.tsx src/features/admin/pages/AdminAccountPage.test.tsx src/routes/router.test.tsx src/features/auth/components/RequireDeliveryStaff.test.tsx src/features/auth/components/RequireAdmin.test.tsx`;** expected: admin settings/assignment, employee view, customer timeline and role access states pass in both locales.
- [ ] **Step 7: Commit** with `feat(delivery): add delivery management screens`.

### Task 7: Retire GHN runtime and preserve historical records

**Files:**
- Retire: `server/src/shipping/ghn.provider.ts`, `sandbox-shipping.provider.ts`, `persisted-sandbox-shipping.provider.ts`, `shipping.registry.ts`, `shipping-webhook.controller.ts`, `shipping-webhook.service.ts`
- Modify: `server/src/shipping/shipping.controller.ts`, `admin-shipping.controller.ts`, `shipping.validator.ts`, `shipping.policy.ts`, `shipping-provider.ts`, `shipping.config.ts`, `shipping.types.ts`, `server/src/app.module.ts`
- Modify: `server/src/operations/tasks.types.ts`, `tasks.repository.ts`, `task-runner.service.ts`, `server/src/operations/__tests__/task-runner.test.ts`, `retail-p0.integration.test.ts`
- Modify: `server/src/auth/auth.module.ts`, `server/src/auth/auth.module.test.ts`, `server/src/orders/orders.repository.ts`, `server/src/transactional-email/__tests__/email.test.ts`
- Modify: `server/.env.example`, `server/.env.docker.example`, `server/src/shipping/README.md`, `docs/API.md`, `docs/ARCHITECTURE.md`, `docs/DEVELOPMENT.md`, `docs/TESTING.md`, `docs/DEMO.md`, `docs/backlog/README.md`, `Wiki/architecture.md`, `Wiki/concepts/shipping-and-fulfillment.md`, `Wiki/index.md`, `Wiki/log.md`
- Test: `server/src/shipping/__tests__/shipping-webhook.test.ts`, `shipping-provider.test.ts`, `customer-shipping.controller.test.ts`, `server/src/operations/__tests__/task-runner.test.ts`, `server/src/auth/auth.module.test.ts`, `server/src/orders/__tests__/orders.repository.test.ts`

- [ ] **Step 1: Write retirement tests** proving the GHN webhook is no longer excluded from auth, provider/service/location routes cannot make HTTP calls, existing GHN shipment/event rows remain read-only, old queued `SHIPMENT_CREATE`/`SHIPMENT_SYNC` tasks terminate without network calls, and internal packing rows have no external provider order code.
- [ ] **Step 2: Run `pnpm --dir server exec vitest run src/shipping/__tests__/shipping-webhook.test.ts src/shipping/__tests__/shipping-provider.test.ts src/shipping/__tests__/customer-shipping.controller.test.ts src/operations/__tests__/task-runner.test.ts src/auth/auth.module.test.ts src/orders/__tests__/orders.repository.test.ts`;** expected: fail until GHN paths are removed and legacy handling is updated.
- [ ] **Step 3: Remove GHN routes, credentials/config validation, provider selection, labels, create/retry and webhook processing.** Remove the webhook auth exclusion, remove code that infers shipment state from a `SHIPMENT_CREATE` task, and block new carrier-task enqueue. Do not delete migration history, columns, old shipment rows or old event payloads.
- [ ] **Step 4: Keep only a no-network permanent handler for already queued carrier tasks.** New internal rows retain packing state with `provider = INTERNAL`; assignment/events are the delivery source of truth; in-flight historical GHN rows and events stay unchanged, remain readable in admin/customer projections, and are not duplicated internally.
- [ ] **Step 5: Remove GHN-only environment documentation and update maintained API, architecture, development, testing, demo, backlog and Wiki guides** to document internal delivery and the historical read-only boundary. Leave archived Superpowers specs/log entries intact as historical records.
- [ ] **Step 6: Run the focused server tests;** expected: no runtime branch can call GHN, legacy data remains readable, and retired jobs finish without a provider call.
- [ ] **Step 7: Commit** with `refactor(shipping): retire GHN runtime integration`.

### Task 8: Full verification and branch review

**Files:** changed implementation, tests, migration and docs only.

- [ ] **Step 1: Run `pnpm --dir server prisma:format`, `pnpm --dir server prisma:validate`, and `pnpm --dir server prisma:generate`** without applying a production migration.
- [ ] **Step 2: Run full client checks:**

  ```powershell
  pnpm --dir client exec tsc -p tsconfig.json --noEmit
  pnpm --dir client test -- --run
  pnpm --dir client build
  pnpm --dir client lint
  ```

- [ ] **Step 3: Run full server checks:**

  ```powershell
  pnpm --dir server typecheck
  pnpm --dir server test -- --run
  pnpm --dir server build
  pnpm --dir server lint
  ```

- [ ] **Step 4: Run `pnpm --dir server test:integration` only against the configured isolated database.** Expected: quote ownership, schedule overlap and concurrent delivery completion pass; otherwise record why the DB gate is unavailable.
- [ ] **Step 5: Run `pnpm --dir client exec playwright test e2e/internal-delivery.spec.ts`.** The configured Playwright projects cover desktop/mobile, EN/VI and light/dark. Expected: checkout quote/pin, admin settings/assignment, employee update, customer timeline, keyboard focus and no horizontal overflow pass with mocked API responses; live route/tile acceptance remains separate.
- [ ] **Step 6: Review diff** for authorization before business logic, CSRF/guest token preservation, no coordinate logs, no GHN network calls, additive migration and absence of loyalty/PayOS changes.
- [ ] **Step 7: Run `git diff --check`;** expected: no whitespace errors, secrets, generated migration drift or edits outside delivery scope.
- [ ] **Step 8: Commit any verification fixes** with Conventional Commit messages; leave push/PR to a separate explicit request.

## Acceptance Coverage

- AC01-AC02: Task 5 map tests; Task 8 browser checks verify no geolocation and visible attribution.
- AC03-AC05: Tasks 1-3 boundary, route failure, quote binding and immutable snapshot tests.
- AC06-AC08: Tasks 4 and 6 admin scheduling, employee ownership and state transition tests.
- AC09-AC10: Tasks 4 and 6 customer projection plus exactly-once order/COD/loyalty/email tests.
- AC11: Task 7 legacy read-only and no-GHN-call tests.
- AC12-AC13: Tasks 1-7 focused tests and Task 8 full, integration and browser checks.

## Technical References

- [Leaflet quick start](https://leafletjs.com/examples/quick-start/) for map/marker/polyline lifecycle and attribution.
- [OSRM HTTP API](https://project-osrm.org/docs/v26.5.0/http) for route distance and geometry.
- [OpenStreetMap tile usage policy](https://operations.osmfoundation.org/policies/tiles/) for attribution, caching and tile-server limits.
