# Retail P0 Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver all three P0 capabilities with reproducible local sandbox acceptance: internal delivery, COD settlement/manual refunds, and durable transactional email.

**Architecture:** Extend the existing Nest feature modules and MySQL transaction boundary. Internal delivery quotes, shipments, assignments and events are persisted locally; durable tasks send transactional email after commit. Preserve legacy order/payment contracts and add separate fulfillment and settlement projections.

**Tech Stack:** Node.js 24.20.0, pnpm 12.4.2, NestJS 11, mysql2, Prisma 7 migrations, Zod, React 19, Vitest, Testing Library; Resend SDK for maintained signature verification and Playwright Test for repeatable browser acceptance.

**Spec:** [Approved design](../specs/2026-10-14-retail-p0-operations-design.md), approved by the owner on 2026-10-14.

Scope update approved by the owner on 2026-10-16: use Digital-E's internal
delivery workflow; GHN and other carrier integrations are out of scope. The
[internal delivery design](../specs/2026-10-16-internal-delivery-design.md)
and [implementation plan](2026-10-16-internal-delivery.md) are authoritative
for detailed P0-01 behavior. Internal delivery is implemented; live
routing/map configuration, Resend/PayOS and external scheduler checks remain
separate operational gates. Historical GHN records are read-only.

## Global Constraints

- All three P0 capabilities belong to this release; P1 remains deferred.
- Initial operation uses one warehouse, Digital-E delivery staff and Resend as the email provider; no external carrier account or integration is needed.
- GHN shipment history remains readable but cannot trigger provider calls or new delivery work.
- Internal delivery uses an operator-configured store pin, manually selected customer pin, allowlisted road route and fee bands; do not request or store GPS.
- Email and payment sandbox modes are rejected in production.
- MySQL feature repositories own writes; Prisma migrations/schema stay aligned.
- `orders` retains numeric status `0 Pending`, `1 Done`, `2 Canceled`.
- Shipping is not discounted by merchandise percentage promotions.
- Guest tokens never enter email, logs, URLs or administrative projections.
- Admin actions retain auth/role/CSRF protection; external routes have exact authentication boundaries.
- Local simulation is never described as a provider staging test or a bank transfer.
- No deployment, real payout, hosted scheduler activation or push to `main` is part of execution.
- Frontend copy is EN/VI; responsive BEM styles use existing light/dark tokens and accessible controls.
- Never reset or commit unrelated working-tree changes. All work uses `feature/retail-p0-operations`.
- Only justified package-local dependencies and lockfile updates are allowed; no root workspace or npm/yarn lockfiles.

## Review Focus

1. Anonymous identity changes after sign-in must invalidate/replace a quote rather than transfer another cart's capability (Task 3).
2. Reopening a legacy terminal order or applying a stale delivery update must not restart warranty or stock restoration (Tasks 4-5).
3. Missing internal-delivery settings, invalid address pins or unavailable road routes must fail explicitly instead of quoting zero shipping (Task 2).
4. A historical discounted multi-unit order must not over-refund through unit rounding or duplicate requests (Task 7).
5. Crash after external email acceptance plus delayed retry beyond 24 hours must enter review rather than duplicate the message (Tasks 8-9).

---

## Execution ownership and baseline

Main Codex owns shared types, migrations, composition roots, pricing/lifecycle
integration, final review and Git. If the owner selects delegation, use only
Luna specialists with exact per-task ownership; no overlapping writes and no
subagent-created agents. Preserve the current dirty tree as an input baseline.

- [ ] Capture branch, HEAD, status and the existing diff before writing code.
- [ ] Activate the chosen execution skill, TDD and the relevant UI/a11y skills.
- [ ] Initialize fnm for Node 24.20.0; use `pnpm.cmd` in PowerShell when script execution policy blocks `pnpm.ps1`.
- [ ] Run baseline client/server typecheck and focused existing checkout/lifecycle/refund suites; distinguish existing failures from introduced failures.
- [ ] Confirm disposable MySQL/Firebase emulator availability; do not change remote data or silently claim skipped integration checks passed.

## Shared types and fixed policies

Define feature-local types before their consumers; do not put feature validators
in `shared`. `TransactionContext` remains the existing mysql2 context.

- `OrderIdentity`: `{ kind: 'authenticated'; userId: string } | { kind: 'guest'; guestCartId: string }`; resolve server-side, never from a submitted user ID.
- `DeliveryAddress`: recipient name/phone, address line and city, country fixed to `VN`, and manually selected latitude/longitude within valid bounds. GHN province/ward/service codes are not part of new quotes.
- `PricingSnapshot`: `{ itemsSubtotal: number; merchandiseDiscount: number; shippingFee: number; payableTotal: number; currency: 'VND' }`.
- `DeliveryQuote`: opaque ID, identity/cart/address fingerprints, route distance/geometry, delivery-settings version, pricing snapshot and UTC expiry.
- `FulfillmentState`: `UNFULFILLED | CONFIRMED | PICKING | PACKED | READY_TO_SHIP | SHIPPED | DELIVERY_FAILED | RETURNING | RETURNED | DELIVERED | CANCELED`.
- `TaskKind`: newly enqueued work uses `EMAIL_SEND`; legacy carrier shipment tasks are retired without network calls. `TaskState`: `READY | RUNNING | SUCCEEDED | FAILED | REVIEW_REQUIRED`.
- `TaskLease`: task ID, random fencing token, attempt number and lease expiry; `TaskResult`: email provider reference or retryable/permanent/ambiguous failure.
- `EmailMessage`: one recipient, locale, escaped subject/text/HTML and immutable business-event key; `EmailSendResult`: provider message ID and `accepted` or explicit `sandbox` outcome.
- `SettlementInput`: reference, transfer time, remitted VND amount, fee breakdown and evidence ID; server supplies expected/collected amounts.
- `ManualRefundInput`: existing idempotency/reference/currency fields plus transfer date, evidence ID and reviewed reason; no client-supplied refund amount.
- `ShipmentSummary`: order ID, internal fulfillment state, assigned employee and delivery window, delivered timestamp and guest-safe timeline; new internal shipments have no external tracking code.
- `CodSettlement`: order ID, expected/collected/remitted/delivery-fee VND amounts, settlement state, transfer references and masked evidence summaries. Internal delivery has no third-party carrier fee.
- `EmailBusinessEvent`: event key/type, order or after-sales ID, immutable contact/locale and pricing/status snapshot; types are placement, shipment update, cancellation, after-sales decision and refund confirmation.
- `EventReceipt`: event ID and queued/duplicate/ignored kind; `RunSummary`: claimed/succeeded/retried/failed/review-required counts and elapsed milliseconds.
- `EvidenceFile`: validated MIME, bounded bytes, hash, original safe filename and operator ID; `RefundableUnit`: orderItemId, unitIndex and netVnd.

New money calculations require non-negative safe integers; percentage discounts
are clamped and rounded to nearest VND with `Math.round` exactly once before
snapshots. Refund units use largest-remainder proportional allocation with ties
ordered by orderItemId/unitIndex; all allocated units sum to net merchandise.

Implementation constants: quote TTL 15 minutes; runner batch default 20/max 100;
lease 60 seconds; runner budget 20 seconds; external request timeout 8 seconds;
at most 8 attempts. Retry delays are 30s, 2m, 5m, 15m, 1h, 3h, 6h, capped by the
budget/window. Stop ambiguous email retries 23 hours after first send attempt.
Private evidence maximum 2 MiB; permitted validated JPEG/PNG/PDF content.

### Task 1: Durable tasks with restart-safe leases

**Files:** create `server/src/operations/tasks.types.ts`, `tasks.repository.ts`, `tasks.service.ts`, `tasks.module.ts`, `tasks.policy.ts`; tests `server/src/operations/__tests__/tasks.service.test.ts` and `tasks.integration.test.ts`. Modify `server/src/app.module.ts`; create `server/src/database/prisma/migrations/20261014100000_operations_tasks/migration.sql`; update `schema.prisma`.

**Interfaces:** `TasksService.enqueue(tx, input: { kind: TaskKind; key: string; payload: object }): Promise<number>`; `claimDue(limit, now): Promise<TaskLease[]>`; `finish(lease, result, now): Promise<boolean>`. Store due time, payload hash, attempt state and provider reference; matching keys with different payloads conflict.

- [ ] Write tests: duplicate enqueue returns one task; rollback creates none; concurrent claims produce one lease; expired lease is reclaimable; an old fencing token cannot finish a reclaimed task; due work obeys batch bounds.
- [ ] Run `pnpm --dir server exec vitest run src/operations/__tests__/tasks.service.test.ts`; confirm failure from the missing implementation.
- [ ] Implement the repository and policy using parameterized SQL and short transactions. Add unique `(kind, business_key)` and due-work indexes; validate migration against the seeded baseline.
- [ ] Rerun the focused suite and isolated integration test; require actual passing assertions, not a mocked concurrency promise alone.
- [ ] Review and commit only Task 1 changes as `feat(operations): persist leased tasks for external side effects`.

### Task 2: Internal delivery settings and road-distance quotes

The owner selected internal delivery. The authoritative requirements and
acceptance evidence are in [internal delivery design](../specs/2026-10-16-internal-delivery-design.md)
and [internal delivery implementation plan](2026-10-16-internal-delivery.md).
That work supplies the store pin/settings, allowlisted road route, quote,
customer pin selection and fee bands. Do not add carrier adapters, parcel
dimension requirements, province/ward/service lookups, GHN credentials, labels
or carrier webhooks.

- [x] Implement internal delivery settings and address-bound quotes; the current source and focused acceptance evidence are recorded in the linked internal-delivery plan.
- [x] Keep missing settings or route failures explicit; do not fall back to a guessed fee.
- [x] Preserve historical GHN records as read-only data.

### Task 3: Owner-bound quotes and authoritative checkout

**Files:** create `server/src/shipping/shipping-quote.repository.ts`, `shipping-quote.service.ts`, tests `shipping-quotes.test.ts` and `shipping-checkout.integration.test.ts`; modify `cart.service.ts`, `cart.types.ts`, `orders.pricing.ts`, `orders.validator.ts`, `orders.dto.ts`, `orders.types.ts`, `orders.service.ts`, `orders.payos.service.ts`, both order controllers, reservation service/repository, orders repository/snapshots and affected analytics projections.

**Interfaces:** `ShippingQuoteService.createQuote(identity, input): Promise<DeliveryQuote>`; `validateQuote(tx, identity, quoteId, authoritativeCart, address): Promise<PricingSnapshot>`; `calculatePricing(itemsSubtotal, merchandiseDiscount, shippingFee): PricingSnapshot`. New checkout writes require `shippingQuoteId` and structured address. Existing response keys remain; append the breakdown.

- [ ] Write tests: `9_000_000` merchandise, `900_000` discount and `99_000` shipping produce `8_199_000` payable; foreign/tampered/expired/repriced quotes fail; guest-to-auth identity changes cannot reuse old quotes; product stock and promotion remain server-authoritative.
- [ ] Run `pnpm --dir server exec vitest run src/shipping/__tests__/shipping-quotes.test.ts`; confirm red.
- [ ] Implement internal quote storage/fingerprint/TTL, lock and consume semantics, VND rounding and snapshots across all guest/signed-in COD/PayOS write aliases. Reject absent quotes explicitly; allow payment-provider retries without creating extra orders.
- [ ] Ensure `total_price` remains subtotal plus shipping before merchandise discount; historical shipping defaults zero; PayOS link and ledger receive payable total; incompatible historical currencies stay read-only for this path.
- [ ] Run focused tests plus existing checkout/reservation/PayOS suites; review and commit as `feat(checkout): price delivery through owner-bound quotes`.

### Task 4: Internal fulfillment lifecycle and safe completion

**Files:** create `shipping.repository.ts`, `fulfillment.policy.ts`, `fulfillment.service.ts`, `admin-shipping.controller.ts`, tests `fulfillment.test.ts`; modify orders repository/service/cancellation/module and app module. Create migration `20261014120000_shipping_operations/migration.sql`; update schema.

**Interfaces:** Internal shipment creation is part of the checkout/order transaction; `completeDeliveredOrder(tx, orderId, deliveryAt, actor): Promise<boolean>` is called by an authorized assigned delivery employee after a valid `DELIVERED` update.

- [ ] Verify allowed/rejected internal delivery transitions; paid versus unpaid/simulated PayOS; COD collection; duplicate assignments/status updates; historical Done order preservation; and exactly one stock restoration on eligible physical return.
- [ ] Run `pnpm --dir server exec vitest run src/shipping/__tests__/fulfillment.test.ts`; confirm red.
- [x] Create internal shipment rows with the order transaction and use audited, non-overlapping delivery staff assignments; no external shipment job or carrier lookup is used.
- [ ] Make legacy admin completion and cancellation enforce the same fulfillment policy. Keep `delivered_at` stable and reuse cancellation inventory guards; returned paid orders still require money resolution.
- [ ] Rerun focused and existing lifecycle/cancellation suites; review and commit as `feat(fulfillment): persist shipment lifecycle and recovery`.

### Task 5: Internal delivery status and authorization; no carrier callbacks

GHN callback handling is removed from P0. Internal delivery uses the guarded
admin assignment and assigned-employee status routes described by the linked
internal delivery plan. Preserve admin/employee role checks, owner/guest
boundaries, schedule conflict protection, append-only events and idempotent
completion; do not add a public carrier webhook or broad CSRF exception.

### Task 6: COD settlement and private evidence

**Files:** create `server/src/payments/cod-settlement.types.ts`, `.validator.ts`, `.repository.ts`, `.service.ts`, `admin-cod-settlements.controller.ts`; create `server/src/operations/evidence.repository.ts`, `evidence.service.ts`, `admin-evidence.controller.ts`; tests `cod-settlement.test.ts`, `evidence.test.ts`. Modify payments/orders modules and internal delivery completion. Create migration `20261014130000_financial_operations/migration.sql`; update schema.

**Interfaces:** `CodSettlementService.recordCollection(tx, orderId, amount): Promise<void>`; `recordRemittance(orderId, actorId, input: SettlementInput): Promise<CodSettlement>`; `EvidenceService.store(actorId, file): Promise<{ id: number; sha256: string }>`; `readForAdmin(evidenceId): Promise<EvidenceFile>`.

- [ ] Write tests: COD collection is not remittance; prepaid COD is zero; internal delivery has zero third-party carrier fee, so `8_199_000` collected expects `8_199_000` remitted; mismatches remain unresolved; duplicate transfer references cannot credit twice; conflicting retries fail.
- [ ] Write private-file tests: customer denied; untrusted MIME/oversize content rejected; private reference cannot be an arbitrary external URL; no public storage URL; responses use attachment and `Cache-Control: no-store`.
- [ ] Run `pnpm --dir server exec vitest run src/payments/__tests__/cod-settlement.test.ts src/operations/__tests__/evidence.test.ts`; confirm red.
- [ ] Store bounded proof bytes privately in MySQL with MIME/hash/actor, using validated file signatures; no additional public Blob container. Lock balances and record append-only actor/event history; do not subtract a hypothetical carrier charge from internal-delivery COD.
- [ ] Rerun tests and integration constraints; review and commit as `feat(payments): reconcile COD with private remittance evidence`.

### Task 7: Discount-aware evidence-backed manual refunds

**Files:** create `server/src/after-sales/refund-allocation.ts`, `manual-refund.service.ts`, `manual-refund.repository.ts`; modify after-sales repository/service/validator/types/module/admin controller and payment projections; tests `refund-allocation.test.ts`, `manual-refund.test.ts`, existing refund suite. Extend financial migration/schema with immutable operation keys and allocated unit amounts.

**Interfaces:** `allocateRefundUnits(items, merchandiseDiscount): RefundableUnit[]` where each unit has orderItemId/unitIndex/netVnd; `ManualRefundService.confirm(requestId, actorId, input: ManualRefundInput): Promise<AfterSalesRequest>`. Endpoint: `POST /api/admin/after-sales/requests/:id/manual-refund`.

- [ ] Write tests: three `30_000` units with `10_000` total discount allocate `26_667`, `26_667`, `26_666`; sum is `80_000`. Ordering is stable by item ID/unit index. Shipping is excluded; concurrent/replayed partial requests never refund a unit twice.
- [ ] Test missing/unowned evidence, unpaid ledger, conflicting reference, unsupported currency, excessive cumulative amount, invalid request state and no changes after rollback.
- [ ] Run `pnpm --dir server exec vitest run src/after-sales/__tests__/refund-allocation.test.ts src/after-sales/__tests__/manual-refund.test.ts`; confirm red.
- [ ] Implement integer allocation, historical snapshot compatibility and short transaction locking. Record operator attestation/evidence; atomically update request, cumulative payment status/audit and future notification job. Do not route manual confirmation through a fake provider refund or restock damaged goods.
- [ ] Rerun existing after-sales/refund/lifecycle suites; review and commit as `feat(after-sales): confirm audited manual refunds within paid balances`.

### Task 8: Email rendering, real adapter and restart-safe sending

**Files:** create `server/src/transactional-email/email.types.ts`, `email.templates.ts`, `email.policy.ts`, `email.repository.ts`, `email.service.ts`, `email-provider.ts`, `resend.provider.ts`, `sandbox-email.provider.ts`, `email.module.ts`; tests `email.test.ts`, `email-policy.test.ts`. Add a compatible Resend SDK to server package/lockfile; modify env validation/template. Create migration `20261014140000_transactional_email/migration.sql`; update schema.

**Interfaces:** `EmailService.enqueue(tx, event: EmailBusinessEvent): Promise<number | null>`; `renderEmail(event): EmailMessage`; `EmailProvider.send(message, idempotencyKey): Promise<EmailSendResult>`; `processEmail(lease): Promise<TaskResult>`. Business events carry order/refund snapshot, order contact recipient and locale, never raw capabilities.

- [ ] Write tests for all EN/VI templates, escaped hostile customer text, privacy, one recipient, missing configuration, permanent versus temporary errors, rate-limit hints and successful sandbox markers.
- [ ] Test crash after acceptance, lease takeover and stable idempotency payload; at age 23 hours an ambiguous send becomes `REVIEW_REQUIRED`, not another provider call. An accepted message remains distinct from delivered.
- [ ] Run `pnpm --dir server exec vitest run src/transactional-email/__tests__/email.test.ts src/transactional-email/__tests__/email-policy.test.ts`; confirm red.
- [ ] Add `resend` only after registry/runtime compatibility check; use maintained webhook verification from the SDK. Implement Task 1 leases, fixed retry policy and sandbox fixture outcomes. Reject sandbox in production and disabled configuration as successful delivery.
- [ ] Rerun tests and check server lockfile diff; review and commit as `feat(email): send transactional messages through durable retries`.

### Task 9: Transactional email hooks and bounded runner

**Files:** create `email-webhook.controller.ts`, `email-webhook.service.ts`, `admin-email.controller.ts`; create `server/src/operations/task-runner.service.ts`, `task-runner.controller.ts`, `server/scripts/run-operations.mjs`; tests `email-events.test.ts`, `task-runner.test.ts`, `transactional-hooks.integration.test.ts`. Modify current order/reservation/payment-finalization/cancellation/fulfillment/after-sales transaction entry points, modules, main bootstrap, auth module and server package scripts.

**Interfaces:** `TaskRunnerService.run({ limit, budgetMs }): Promise<RunSummary>`; `EmailWebhookService.accept(rawBody, headers): Promise<EventReceipt>`; `EmailService.resend(messageId, actorId, acknowledgeUnknownOutcome): Promise<number>`.

- [ ] Write tests: business rollback leaves no email; successful placement creates one event for guest/signed-in COD/PayOS; replayed provider finalization creates none; delivery/cancel/after-sales decisions/refund create their unique events.
- [ ] Write tests: changed raw webhook body/bad signature rejected; duplicate or unknown message events cannot forge delivered status; runner secret missing/wrong rejected; admin drain/retry still needs role/CSRF; expired lease recovery works; unknown-outcome resend requires acknowledgment.
- [ ] Run `pnpm --dir server exec vitest run src/transactional-email/__tests__/email-events.test.ts src/operations/__tests__/task-runner.test.ts`; confirm red.
- [ ] Enqueue using the actual business transaction, not the existing post-commit void notification callback. Preserve in-app notifications and Firebase auth emails. Enable raw body retention for the exact Resend callback; exclude only machine routes with their own authentication.
- [ ] Expose POST `/api/operations/run` using scheduler bearer secret and POST admin drain/retry routes; add a command that bootstraps then closes the Nest application context. Do not add a Vercel Hobby-incompatible schedule. Drain handlers stop at budgets and release/expire leases safely.
- [ ] Rerun focused/unit integration tests; review and commit as `feat(operations): connect domain events and bounded recovery runner`.

### Task 10: Internal-delivery customer, admin and employee UI

The current client implementation and acceptance criteria are recorded in
[internal delivery implementation plan](2026-10-16-internal-delivery.md),
Tasks 5-6. Use that plan as the source of truth for address pins, road-distance
quotes, admin delivery settings/assignments, employee status updates, and
customer-visible delivery timelines. Do not add parcel forms, carrier service
selection, labels, or tracking-number UI.

- [x] Implement internal-delivery UX with EN/VI copy, responsive layouts, theme support, keyboard access and explicit loading/error states.
- [x] Bind customer quotes to cart/address/settings and preserve the current checkout and guest-lookup authorization boundaries.
- [x] Keep staff views assignment-scoped and customer timelines free of private staff notes or location data.

### Task 11: Financial and email operator UI

**Files:** create `client/src/features/admin/pages/AdminCodSettlementsPage.tsx`, `AdminEmailOperationsPage.tsx`, `components/PrivateEvidenceUpload.tsx`; modify `AdminPaymentReconciliationPage.tsx`, admin API/types, after-sales API/types/AdminAfterSalesPage, routes/nav, locales and admin/after-sales styles; add focused page/API tests.

**Interfaces:** financial wrappers `fetchCodSettlements(filters)`, `confirmCodRemittance(orderId, input)`, `uploadFinancialEvidence(file)`, `confirmManualRefund(requestId, input)`; email wrappers `fetchEmailOperations(filters)`, `runOperations(limit)`, `retryEmail(messageId, acknowledgeUnknownOutcome)`.

- [ ] Write tests: collection versus remittance labels, discrepancy totals, server-owned refund amount, mandatory transfer/evidence, duplicate-click pending states, expired sessions and private evidence access.
- [ ] Write tests: failed versus accepted/delivered email display, sandbox marker, masked recipient, server-safe reason, pagination/bounds and explicit unknown-outcome resend acknowledgment.
- [ ] Run `pnpm --dir client exec vitest run src/features/admin/pages/AdminCodSettlementsPage.test.tsx src/features/admin/pages/AdminEmailOperationsPage.test.tsx`; confirm red.
- [ ] Implement semantic forms/tables/dialog focus and recoverable errors; preserve existing PayOS reconciliation and distinguish manual attestation from automatic transfer.
- [ ] Rerun admin/after-sales focused suites; review and commit as `feat(admin): manage settlement refunds and email recovery`.

### Task 12: MySQL sandbox journey and repeatable browser acceptance

**Files:** create `server/src/operations/__tests__/retail-p0.integration.test.ts`, `server/scripts/retail-p0-sandbox.mjs`, `client/playwright.config.ts`, `client/e2e/retail-p0.spec.ts`, `client/e2e/fixtures/retail-p0.ts`; modify internal-delivery seed fixtures, client/server package scripts, client Vitest excludes, package-local lockfiles and `.gitignore` for test artifacts.

**Interfaces:** server `retail:p0:sandbox` command validates localhost/disposable database and explicit sandbox modes; Playwright fixture uses seeded guest/customer/admin/delivery-staff identities and localhost API only. E2E artifacts never contain real credentials/capabilities.

- [ ] Write integration tests with concurrent claims/refunds/assignments, rollback, quote repricing, duplicate and stale internal delivery updates, payment amount equality and baseline historical orders. Refuse remote database/browser targets before writes.
- [ ] Run `pnpm --dir server exec vitest run --config vitest.integration.config.ts src/operations/__tests__/retail-p0.integration.test.ts` against isolated MySQL; observe missing feature evidence before finishing integration.
- [ ] Add compatible `@playwright/test` as a client dev dependency, narrowly scoped to `e2e/`; keep Vitest from collecting those tests. Configure Chromium desktop 1440x900/mobile 390x844, both locales and light/dark, deterministic local runner invocations.
- [ ] Implement the local sandbox scenario: guest/customer COD checkout through internal staff assignment, delivery, remittance and refund; PayOS quote/reservation/checkout and simulated-payment delivery rejection; email outage/restart/retry/permanent failure. Use a separately identified seeded paid-PayOS ledger for eligible delivery/refund integration tests. Never clear the simulated flag on a checkout-created order or describe seeded evidence as an actual external payment.
- [ ] Run `pnpm --dir client exec playwright test e2e/retail-p0.spec.ts`; record keyboard operation, errors/empty/loading and absence of horizontal overflow, screenshots and actual results. GHN staging is out of scope; report routing/map, Resend and PayOS live checks only when actually exercised.
- [ ] Review fixtures/data guards and commit as `test(retail): verify the complete P0 sandbox lifecycle`.

### Task 13: Regression, documentation and whole-change review

**Files:** update `docs/API.md`, `docs/DEVELOPMENT.md`, `docs/TESTING.md`, `docs/DEMO.md`, `server/src/docs/openapi.json`, `docs/backlog/README.md`, affected Wiki architecture/order/payment/after-sales notes, new shipping/email concepts, Wiki index/log; preserve other authors' changes.

- [ ] Run client `exec tsc -p tsconfig.json --noEmit`, `lint`, `test -- --run`, `build`; server `typecheck`, `lint`, `test -- --run`, `build`, isolated `test:integration`; use `pnpm --dir <package>` for every command.
- [ ] Run both sandbox CLI and Playwright acceptance; map actual evidence to A01-A12. Any unavailable/failing relevant check stays explicitly open.
- [ ] Update contracts, mode restrictions, internal-delivery routing/map settings, private evidence limits, email job recovery and scheduler invocation. Document hosted scheduling as a separate deployment gate and keep P1 deferred.
- [ ] Review the full task diff for cross-module correctness, duplicate money/stock, privacy, authorization, API compatibility, migration constraints and minimal dependency churn. Request the permitted independent reviewer according to the chosen method and resolve findings.
- [ ] Mark P0 tracker complete only after all sandbox acceptance requirements pass. Commit only task changes as `docs(retail): document verified P0 operations and remaining live gates`; no PR, push, merge or deployment unless requested.

## Acceptance coverage

| Spec | Tasks |
| --- | --- |
| A01-A02: internal quote ownership and complete VND totals | 2, 3, 10, 12 |
| A03: stock and internal-assignment idempotency | 1, 4, 12 |
| A04: assigned-staff authorization, ordered delivery updates and durable email callbacks | 5, 6, 9, 12 |
| A05: delivery/return lifecycle | 4, 5, 10, 12 |
| A06: COD remittance and discrepancy | 6, 11, 12 |
| A07: net refund allocation and evidence | 6, 7, 11, 12 |
| A08-A09: transactional persistence/restart/retry | 1, 8, 9, 12 |
| A10: delivery events and operator recovery | 8, 9, 11, 12 |
| A11: locales/themes/mobile/keyboard | 10, 11, 12 |
| A12: historical contracts and regression | 3-9, 12, 13 |

## Handoff

The owner reviews this plan and selects native execution or Luna subagent-driven
execution. Native means Main Codex implements the dependent tasks sequentially;
delegated execution assigns exact ownership and retains Main integration.
This plan does not authorize claiming completion before the tracker evidence
exists, and does not turn local fixtures into external provider verification.

Provider references: [Resend raw-body verification](https://resend.com/changelog/managing-webhooks-via-api),
[Resend idempotency window](https://resend.com/docs/dashboard/emails/idempotency-keys),
[Playwright configuration](https://playwright.dev/docs/test-configuration).
