# PayOS checkout reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make authenticated and guest PayOS checkout resumable and recoverable, and confirm orders only after verified payment and committed order state.

**Architecture:** Persist an owner-scoped payment attempt, unique provider order code and immutable expected amount before PayOS is called. Signed webhooks and bounded server-to-server lookups feed one durable payment observation and idempotent order processor; frontend reads owner-scoped status from Digital-E. Paid receipts survive stock/order failures for audited operator resolution.

**Tech Stack:** NestJS 11, TypeScript, MySQL repositories and additive Prisma projection/migrations, existing `@payos/node` v2, existing MySQL operations task runner, React 19/Vite, Vitest, Playwright.

**Spec:** [PayOS checkout reliability design](../specs/2026-10-15-payos-checkout-reliability-design.md)

## Global Constraints

- Node.js 24.20.0, pnpm 12.4.2; install no dependencies without concrete need.
- Keep whole-number VND, immutable checkout snapshots, current 35-minute reservation and existing route aliases/response envelopes.
- Preserve verified-email, auth, owner, guest-cookie, CSRF and role checks; unknown guest attempt IDs disclose nothing.
- Never use browser return parameters or session storage as payment proof. Only verified PayOS evidence and committed DB order establish confirmation.
- No outbound call inside DB transaction; persist a verified receipt independently from order finalization.
- Keep task runner bounded: 20-second budget, 60-second task lease, provider request at most 10 seconds, one active create/reconcile lease per attempt.
- No automatic bank transfer/refund, production migration, live payment or deployment as part of local implementation.

## Review Focus

- PayOS accepted create but client timed out: same persisted provider order code is looked up before any retry.
- Signed paid webhook races link creation or expiry: observation is retained and finalization/review remains recoverable.
- Attempt is expired while another customer holds inventory: availability excludes other live reservations.
- Guest cookie is missing or belongs to another cart: attempt status reveals no payment or personal data.
- Cancel/paid/refund race: paid fact is immutable; no order is created after cancellation intent and refund cannot exceed verified receipt.

---

## Planned file ownership

- Persistence and domain boundary: `server/src/database/prisma/schema.prisma`, one additive migration under `server/src/database/prisma/migrations/`, `server/src/payments/payment-attempt.{repository,service,types}.ts`, `server/src/payments/payments.module.ts`.
- Shared payment ingestion: `server/src/payments/payment-reconciliation.{repository,service}.ts`, `server/src/payments/payos-webhook.controller.ts`, their existing tests.
- Checkout creation/finalization and owner routes: `server/src/orders/orders.payos.service.ts`, `server/src/orders/orders.service.ts`, `server/src/orders/orders.repository.ts`, `server/src/orders/orders.controller.ts`, `server/src/orders/guest-orders.controller.ts`, `server/src/orders/orders.module.ts`, focused existing orders tests.
- Durable recovery and operator exception handling: `server/src/operations/tasks.types.ts`, `server/src/operations/tasks.policy.ts`, `server/src/operations/task-runner.service.ts`, `server/src/operations/task-runner.module.ts`, `server/src/payments/admin-payments.controller.ts`, focused task/payment tests. Extend `server/src/operations/financial-operations.*` only if exceptional orphan refunds need a distinct owning controller/service.
- Customer flow: `client/src/features/orders/api.ts`, `types.ts`, `pages/checkoutSuccessStorage.ts`, `pages/CheckoutSuccessPage.tsx`, checkout page where idempotency key is created, existing colocated tests and one dedicated Playwright spec under `client/e2e/`.
- Guides: `docs/API.md`, `docs/DEVELOPMENT.md`, `Wiki/entities/payment.md`, `Wiki/concepts/durable-operations.md`, `Wiki/index.md`, `Wiki/log.md`, and `docs/backlog/README.md` only as needed to mark this work separately from accepted retail P0.

## Agent allocation and dependencies

Use the repository's named roles in `.codex/agents/`; each delegated packet follows `docs/CODEX_ORCHESTRATION.md`, chooses `gpt-6-luna` with effort per task, names exact owned paths, and prohibits commits or nested agents. Limit active subagents to two. Main Codex decides and freezes cross-layer contracts; Backend implements their server types and behavior. Main Codex remains responsible for composition-root wiring, integration, final verification, wiki/docs, and Git.

| Sequence | Role | Plan tasks | Ownership and boundary |
| --- | --- | --- | --- |
| Before implementation | Architect | Read-only review of this spec/plan | Trace current payment, reservation, refund, task-runner boundaries; report contract/schema risks and task overlap. No edits unless Main assigns a specific design-document correction. Main Codex resolves findings before implementation. |
| Before implementation | Main Codex | Freeze `PaymentAttemptStatus`, status routes, and admin exception API contract | Own the shared contract decisions. Architect reviews them read-only; no agent independently changes cross-layer field names or states. |
| 1 | Backend | Tasks 1–5, sequentially | Own only the server files listed in each task. Keep this cohesive backend stream sequential because attempts, webhook comparison, finalization, task kinds, and route contracts share files and DB invariants. Task 1 implements Main's frozen `PaymentAttemptStatus`; Task 5 completes its server route contract before Task 6. |
| 2a, after Task 5 contract is frozen | Frontend | Task 6 | Own only the client paths listed in Task 6. May run concurrently with Backend Task 7 because client/server ownership does not overlap. Do not redefine status or route fields locally; raise a contract conflict to Main. |
| 2b, after Task 1 and Task 3 | Backend | Task 7 | Continue with the same backend ownership after Task 5, or a fresh Backend agent after the earlier agent releases. Own server payment and financial-operation paths only. |
| 3, after Task 7 API contract | Frontend | Task 8 | Own only the named admin UI/API client paths in Task 8. This UI slice depends on the backend exception contract from Task 7. |
| After implementation slices merge | QA | Task 9 browser and acceptance verification only | Own test/fixture files explicitly assigned for browser evidence; do not edit product code. Run isolated DB and package suites only on approved test infrastructure; report unavailable gates distinctly. |
| After Main integration | Reviewer | Integrated branch diff, read-only | Review server/client/migration diff for auth, CSRF, money, concurrency, idempotency, accessibility and regression risks. No edits. Main resolves findings and reruns affected checks. |
| Throughout / final | Main Codex | Composition root, Task 9 docs, migration integration, all Git and final checks | Own `server/src/app.module.ts` and any file shared across agents, settle disagreements, inspect the complete diff, run final package/integration checks and commit. Never delegate Git operations. |

The Architect review is a bounded preflight, not a second design project. If it finds a material product decision missing from the approved spec, stop at that decision and return it for owner review. Avoid assigning DevOps: this plan does not change CI/CD or provision the external scheduler. A separate DevOps task is warranted only if the owner later requests scheduler/deployment configuration. Do not spawn a separate Reviewer or QA until implementation dependencies are satisfied.

Existing interfaces to preserve/extend: `PayOSService.createPaymentLink/getPaymentLink/cancelPaymentLink`; `PaymentReconciliationService` signature verification/comparison and existing webhook claim fencing; `CheckoutReservationService`; `TasksService.enqueue/claimDue/finish`; `TaskRunnerService.run`; `OrdersService.finalizePayOSCheckout`; `client/src/lib/http.ts`. Inspect exact signatures before coding and adapt at owning feature boundary. Do not introduce a second provider client, task runner or generic payment framework.

## Task 1: Persist payment attempt and orphan financial facts

**Files:**
- Create: `server/src/database/prisma/migrations/20261015100000_payos_checkout_attempts/migration.sql`
- Modify: `server/src/database/prisma/schema.prisma`, `server/src/payments/payment.types.ts`, `server/src/payments/payments.module.ts`
- Create: `server/src/payments/payment-attempt.types.ts`, `server/src/payments/payment-attempt.repository.ts`, `server/src/payments/payment-attempt.service.ts`
- Test: `server/src/payments/__tests__/payment-attempt.service.test.ts`, `server/src/payments/__tests__/payment-attempt.integration.test.ts`

**Interfaces:**
- Produce `PaymentAttemptService.claim(input, tx?) -> Promise<PaymentAttemptClaim>` with same-owner/key replay, canonical hash conflict and bounded unique code generation; `recordObservation(input) -> Promise<PaymentAttemptProjection>`; `getOwnedStatus(input) -> Promise<PaymentAttemptStatus>`.
- Persist `payment_attempts`, append-only `payment_attempt_observations` and `payment_attempt_refunds`. Keep `pending_checkouts` and existing webhook inbox authoritative for their current responsibilities.
- `PaymentAttemptStatus` uses the exact independent payment/order/resolution states and safe VND summary in the spec. Provider order code is serialized as string for JSON safety.

- [ ] **Step 1: Write failing unit tests** for deterministic canonical request hash; same owner/key/body replay; changed body 409; different owner isolated key; cryptographic code range and unique-collision retry limit 5; immutable expected amount; duplicate observation dedupe versus conflicting payload; partial refund cap under concurrent transaction; no PII in status projection.
- [ ] **Step 2: Run red tests**

Run from `server/`: `node ./node_modules/vitest/vitest.mjs run src/payments/__tests__/payment-attempt.service.test.ts`
Expected: FAIL because attempt service/contracts are absent.

- [ ] **Step 3: Add additive SQL and Prisma models** with unique owner/key hash, provider/order code, nullable link ID, refund reference/idempotency and useful state/expiry indexes. Add nullable relations without cascading deletion of financial evidence. Generate Prisma client via `node scripts/prisma-generate.mjs` only after schema validates.
- [ ] **Step 4: Implement repository transaction boundaries and `PaymentAttemptService`**. Use parameterized SQL; persist attempt before provider call; lock attempts/refund totals during state mutation; never store secrets/raw webhook credentials.
- [ ] **Step 5: Run green unit tests and isolated MySQL tests**

Run from `server/`: `node ./node_modules/vitest/vitest.mjs run src/payments/__tests__/payment-attempt.service.test.ts`; then `node ./node_modules/vitest/vitest.mjs run --config vitest.integration.config.ts --testNamePattern=integration src/payments/__tests__/payment-attempt.integration.test.ts`.
Expected: unit PASS; integration PASS against isolated test DB, or explicitly report unavailable isolated DB without substituting production/local developer DB.

- [ ] **Step 6: Commit** `feat(payments): persist resumable PayOS attempts`.

## Task 2: Idempotent PayOS link creation and callback-safe identity

**Files:**
- Modify: `server/src/orders/orders.payos.service.ts`, `server/src/orders/checkout-reservation.service.ts`, `server/src/orders/checkout-reservation.repository.ts`, `server/src/payments/payos.service.ts`, order and provider tests from Task 1.

**Interfaces:**
- `OrdersPayOSService.create...` accepts validated owner identity and optional UUID idempotency key; returns existing response fields plus `attemptId`, `sessionState` and nullable URL.
- PayOS create uses persisted attempt `providerOrderCode`, saved amount and immutable expiry; it never creates a second provider code for retry.
- Provider create call is capped at 10 seconds; disable SDK create retries where supported, otherwise apply timeout at the adapter boundary and always GET by saved code before another create. Creation lease token fences concurrent callers; lease duration is 30 seconds.

- [ ] **Step 1: Write failing tests** for key replay with expired quote; same key/different body 409; concurrent duplicate sends one SDK create; early verified callback binds code before create returns; timeout performs GET before any retry; authoritative not-found retries same code; provider/network unknown retains reservation; malformed URL/code/amount/currency rejected; live URL origin allowlist; mock URL allowed only in mock mode.
- [ ] **Step 2: Run red tests**

Run from `server/`: `node ./node_modules/vitest/vitest.mjs run src/orders/__tests__/orders.payos.service.test.ts src/payments/payos.service.test.ts`
Expected: new cases FAIL on current non-idempotent create behavior.

- [ ] **Step 3: Implement claim and create lease** by composing Task 1 service with checkout reservation transaction; persist order code and expected amount before outbound PayOS request; enqueue first reconciliation generation in the same DB transaction.
- [ ] **Step 4: Implement create/recover decision**: look up existing provider code after ambiguous create; retry only on authoritative not-found plus payable state; bind/validate early callback link ID; validate provider URL origin; never release on uncertain outcome.
- [ ] **Step 5: Run green targeted tests**

Run from `server/`: `node ./node_modules/vitest/vitest.mjs run src/orders/__tests__/orders.payos.service.test.ts src/payments/payos.service.test.ts src/orders/__tests__/checkout-reservation.service.test.ts`.
Expected: all targeted tests PASS; existing mock/live environment behavior remains covered.

- [ ] **Step 6: Commit** `fix(orders): make PayOS link creation idempotent`.

## Task 3: One durable processor for webhook and provider lookup

**Files:**
- Modify: `server/src/payments/payment-reconciliation.service.ts`, `server/src/payments/payment-reconciliation.repository.ts`, `server/src/payments/payos-webhook.controller.ts`, `server/src/payments/payment-reconciliation.constants.ts`
- Test: `server/src/payments/__tests__/payment-reconciliation.service.test.ts`, `server/src/payments/__tests__/payment-reconciliation.pending-checkout.test.ts`, `server/src/payments/payos-webhook.controller.test.ts`

**Interfaces:**
- Add `PaymentReconciliationService.processAttemptObservation(input) -> Promise<PaymentAttemptStatus>` as the sole path from verified webhook/PayOS lookup to payment state and finalization request.
- Extend candidate projection with attempt ID and lifecycle state; include expired, released, cancellation-pending and unresolved-paid attempts.
- Existing signed webhook claim/fencing and response contract remain intact.

- [ ] **Step 1: Write failing tests** for exact order code/link ID/whole VND/amountPaid/status comparison; GET response HTTP/API code 00 with status pending never paid; webhook early-arrival binding; duplicate webhook+GET idempotency; partial/overpayment and identity/currency conflict retained as review; expired paid observation survives reservation failure; webhook database failure returns 5xx; durable inbox accepted then processing crash can resume.
- [ ] **Step 2: Run red tests**

Run from `server/`: `node ./node_modules/vitest/vitest.mjs run src/payments/__tests__/payment-reconciliation.service.test.ts src/payments/__tests__/payment-reconciliation.pending-checkout.test.ts src/payments/payos-webhook.controller.test.ts`
Expected: new attempt and early/expired recovery cases FAIL.

- [ ] **Step 3: Implement exact comparison and append-only observation** shared by webhook and GET; keep request-success separate from payment status; do not treat normalized GET VND as independent provider currency evidence.
- [ ] **Step 4: Route verified success through an idempotent finalization command** after observation transaction commits. Keep order-transaction errors retryable without losing paid evidence. Preserve unknown registration-probe acknowledgement and conflict auditing.
- [ ] **Step 5: Run green reconciliation and webhook suites**

Run from `server/`: same command as Step 2.
Expected: all PASS including current signature, duplicate, fencing and payment-order contract tests.

- [ ] **Step 6: Commit** `fix(payments): preserve and reconcile verified PayOS receipts`.

## Task 4: Durable PayOS retry and safe order finalization

**Files:**
- Modify: `server/src/operations/tasks.types.ts`, `server/src/operations/tasks.policy.ts`, `server/src/operations/task-runner.service.ts`, `server/src/operations/task-runner.module.ts`, `server/src/orders/orders.service.ts`, `server/src/orders/checkout-reservation.repository.ts`, `server/src/orders/checkout-reservation.service.ts`
- Test: `server/src/operations/__tests__/task-runner.test.ts`, `server/src/operations/__tests__/tasks.service.test.ts`, `server/src/orders/__tests__/orders.payos.finalization.test.ts`, `server/src/orders/__tests__/orders.integration.test.ts`

**Interfaces:**
- Extend `TaskKind` with `PAYOS_RECONCILE`; inject a focused `PAYOS_TASK_PROCESSOR` whose `process(lease: TaskLease): Promise<TaskResult>` invokes the Task 3 reconciliation API.
- Extend `OrdersService.finalizePayOSCheckout` to accept verified attempt identity; result is `{ orderId, created } | { reviewRequired: true, reason }`.
- Task generation keys are `payos:<attemptId>:<generation>`; continuation task is enqueued transactionally before finishing prior generation.

- [ ] **Step 1: Write failing tests** for task-kind-specific dispatch (never send PayOS to shipping), one provider call/task under 10s within existing 20s budget, existing email/shipping behavior, retry delay progression 15/30/60/120/240/300s respecting Retry-After, lease fencing, next-generation pending task, max-eight review escalation, expiration follow-up 24h and restart after receipt commit.
- [ ] **Step 2: Write failing finalization/concurrency tests** for two concurrent processors -> one order/payment/stock/promo/email; stock available after own hold expiry but excludes other holds; insufficient stock retains receipt + review; original snapshots/discount remain; cancellation intent and refunded attempt cannot finalize; late webhook can re-open a review case.
- [ ] **Step 3: Run red tests**

Run from `server/`: `node ./node_modules/vitest/vitest.mjs run src/operations/__tests__/task-runner.test.ts src/orders/__tests__/orders.payos.finalization.test.ts`
Expected: new PAYOS dispatch/recovery/finalization tests FAIL.

- [ ] **Step 4: Implement explicit processor dispatch and retry continuation**; do not change task runner bounds, lease fencing or shipment/email dispatch semantics. Keep an unknown provider outcome in `READY` with `retryable` results and the specified delay; reserve `REVIEW_REQUIRED` for the eighth exhausted attempt or a durable business mismatch, since current generic `ambiguous` policy moves directly to review.
- [ ] **Step 5: Implement finalization transaction and inventory accounting**; commit order/payment/stock/promotion/timeline/email atomically after receipt fact is durable; on insufficient stock create exception without losing receipt.
- [ ] **Step 6: Run green focused tests and isolated integration**

Run from `server/`: `node ./node_modules/vitest/vitest.mjs run src/operations/__tests__/task-runner.test.ts src/operations/__tests__/tasks.service.test.ts src/orders/__tests__/orders.payos.finalization.test.ts`; then isolated integration for `orders.integration.test.ts`.
Expected: targeted suites PASS; DB integration PASS or is reported as environment-blocked.

- [ ] **Step 7: Main wires the processor in the composition root**

Main Codex alone modifies `server/src/app.module.ts` to register the Task 4 `PAYOS_TASK_PROCESSOR` implementation through the existing `TaskRunnerModule` composition. Add or extend the focused app composition test for the provider binding. Run from `server/`: `node ./node_modules/vitest/vitest.mjs run src/operations/__tests__/task-runner.test.ts`; expected: the app resolves the PayOS processor and existing shipment/email processors remain registered.

- [ ] **Step 8: Commit** `feat(operations): recover pending PayOS attempts durably`.

## Task 5: Owner-scoped status, reconcile and cancel API

**Files:**
- Modify: `server/src/orders/orders.controller.ts`, `server/src/orders/guest-orders.controller.ts`, `server/src/orders/orders.module.ts`, `server/src/orders/orders.validator.ts`, `server/src/orders/orders.dto.ts`, `server/src/config/cors.config.ts` (or current CORS owner found by search)
- Test: `server/src/orders/__tests__/orders.controller.test.ts`, `server/src/orders/__tests__/guest-orders.controller.test.ts`, create `server/src/orders/__tests__/payment-attempt.controller.test.ts`

**Interfaces:**
- `GET /api/orders/payment-attempts/:attemptId`; cookie-authenticated guest `POST /api/orders/guest/payment-attempts/:attemptId/status`.
- Owner POST reconcile and cancel counterparts enqueue intent and return 202 with `retryAfterSeconds`; CSRF applies. Creation accepts additive UUID `Idempotency-Key` header; preserve response legacy fields.
- Wrong owner and unknown attempt return identical 404; status returns DB projection and `Cache-Control: no-store`.

- [ ] **Step 1: Write failing route tests** for authenticated owner, guest cookie owner, cross-user/guest/cart rejection, missing CSRF, rate limits, body user-ID spoof, no personal data, same 404 privacy, legacy routes, idempotency header, 202 coalescing and cache-control.
- [ ] **Step 2: Run red tests**

Run from `server/`: `node ./node_modules/vitest/vitest.mjs run src/orders/__tests__/payment-attempt.controller.test.ts src/orders/__tests__/orders.controller.test.ts src/orders/__tests__/guest-orders.controller.test.ts`
Expected: additive endpoint tests FAIL before registration.

- [ ] **Step 3: Implement thin authenticated/guest controllers** with existing guards, guest cookie identity and CSRF; delegate authorization/state to service; apply 60/min status and 6/min reconcile/cancel caps with 15-second coalescing and Retry-After.
- [ ] **Step 4: Update `server/src/main.ts` CORS `allowedHeaders`** to include `Idempotency-Key` while preserving credentials and existing origins; no broad CSRF exceptions.
- [ ] **Step 5: Run green controller and webhook route tests**

Run from `server/`: Step 2 command plus `node ./node_modules/vitest/vitest.mjs run src/payments/payos-webhook.controller.test.ts`.
Expected: all PASS; existing route response shapes and narrow webhook exception remain.

- [ ] **Step 6: Commit** `feat(orders): add owner-scoped PayOS attempt recovery`.

## Task 6: Truthful checkout return and resumable customer UI

**Files:**
- Modify: `client/src/features/orders/api.ts`, `client/src/features/orders/types.ts`, `client/src/features/orders/components/CheckoutPaymentPage.tsx`, `client/src/features/orders/pages/checkoutSuccessStorage.ts`, `client/src/features/orders/pages/CheckoutSuccessPage.tsx`, existing colocated tests and locale files located through existing translation pattern.

**Interfaces:**
- `PaymentAttemptStatus` frontend type mirrors only safe API projection. API functions: `getPaymentAttempt(id)`, `getGuestPaymentAttempt(id)`, `reconcilePaymentAttempt(id)`, `cancelPaymentAttempt(id)`, guest equivalents; all use shared HTTP client and CSRF.
- Pending storage version includes attempt ID and provider order code and is never an authority. Poll states and timing follow spec.

- [ ] **Step 1: Write failing UI/API/storage tests** for stale success cache/new attempt, no-cache refresh, URL query tamper, pending without false receipt, PAID+FINALIZING, committed order only confirmation, all terminal states, auth/not-found/offline errors, retry-after, stop at 120s, pause hidden/offline, no parallel polling, preserve cart edits, server totals, guest status cookie route, EN/VI state copy, live-region/focus semantics and accessible buttons.
- [ ] **Step 2: Run red tests**

Run from `client/`: `node ./node_modules/vitest/vitest.mjs run src/features/orders/api.test.ts src/features/orders/pages/checkoutSuccessStorage.test.ts src/features/orders/pages/CheckoutSuccessPage.test.tsx src/features/orders/components/CheckoutPaymentPage.test.tsx`
Expected: new status-bound tests FAIL against cache-driven current behavior.

- [ ] **Step 3: Implement UUID idempotency key for one checkout submission**; persist it in the existing pending checkout session storage before the first network request, bind it to that navigation's checkout draft, and reuse it after a timeout/refresh. If server returns 409 for a changed canonical body, discard the stale key and require a newly validated submission. Pass key on authenticated/guest create without changing current cart, quote or price validation.
- [ ] **Step 4: Implement versioned attempt-bound cache and backend API wrappers**; reject malformed identifiers and never persist personal contact fields.
- [ ] **Step 5: Implement status-driven page**; status projection drives display, explicit check/resume actions; only `PAID + CREATED + orderId` shows confirmation; clear only purchased snapshot rows after committed order; localize all states and announce meaningful changes once.
- [ ] **Step 6: Run green focused client tests**

Run from `client/`: same command as Step 2.
Expected: all PASS, including existing checkout submission and order-token behavior.

- [ ] **Step 7: Commit** `fix(client): render PayOS checkout from backend status`.

## Task 7: Operator paid-exception and evidence-backed refund

**Files:**
- Modify: `server/src/payments/admin-payments.controller.ts`, focused payment admin service/repository/validator/types, `server/src/operations/financial-operations.module.ts`, `server/src/operations/evidence.service.ts` only where existing access helpers support it.
- Test: `server/src/payments/__tests__/admin-payments.controller.test.ts`, `server/src/payments/__tests__/admin-payment-reconciliation.service.test.ts`, existing financial evidence/refund tests; add targeted paid-attempt exception tests.

**Interfaces:**
- Admin queue bounded page default 25/max 100; detail, retry, resolution endpoints role-guarded. Refund record accepts attempt ID, positive integer `amountVnd`, globally unique `transferReference`, idempotency UUID, transfer date, evidence ID and reason.
- Attempts with committed orders must use existing order refund workflow. Orphan attempt refund may not exceed verified unrefunded funds.

- [ ] **Step 1: Write failing tests** for non-admin rejection before service call, pagination bounds, evidence private access, unique transfer/idempotency replay, amount cap under concurrency, partial refund remains open, total refund closes case, cancellation/no-order case not fulfillable and audit actor/reason recorded.
- [ ] **Step 2: Run red tests**

Run from `server/`: `node ./node_modules/vitest/vitest.mjs run src/payments/__tests__/admin-payments.controller.test.ts src/after-sales/__tests__/manual-refund.test.ts src/operations/__tests__/evidence.test.ts`
Expected: new attempt-refund tests FAIL; existing order refund behavior remains passing.

- [ ] **Step 3: Implement admin-only exception service** reusing private evidence storage and existing guards; transact attempt lock + refund cap + operation insert; do not fabricate after-sales request/order rows.
- [ ] **Step 4: Run green server/admin and isolated financial integration tests**

Run from `server/`: targeted command from Step 2; run new isolated MySQL payment-attempt integration suite from Task 1.
Expected: all targeted tests PASS, concurrent refund cap is DB proven.

- [ ] **Step 5: Commit** `feat(payments): resolve paid PayOS attempts with audit evidence`.

## Task 8: Admin paid-exception interface

**Files:**
- Modify: `client/src/features/admin/api.ts`, `client/src/features/admin/operations.api.ts`, `client/src/features/admin/operations.types.ts`, `client/src/features/admin/pages/AdminPaymentReconciliationPage.tsx`, `client/src/features/admin/pages/AdminPaymentReconciliationPage.test.tsx`, `client/src/styles/features/admin/_payments.scss`.
- Test: `client/src/features/admin/api.test.ts`, `client/src/features/admin/pages/AdminPaymentReconciliationPage.test.tsx`.

**Interfaces:** Consume only Task 7's frozen admin queue/detail/retry/refund API contract. Backend owns the endpoints and validation; Frontend owns React/client wrappers and presentation. Reuse existing private evidence upload component and admin payment page patterns.

- [ ] **Step 1: Write failing client tests** for paid-without-order queue rows, safe detail fields, retry action, evidence upload/refund form, explicit confirmation, partial-refund state, role-hidden controls and error/loading/empty states.
- [ ] **Step 2: Run red tests**

Run from `client/`: `node ./node_modules/vitest/vitest.mjs run src/features/admin/api.test.ts src/features/admin/pages/AdminPaymentReconciliationPage.test.tsx`.
Expected: new exception-queue tests FAIL before the client contract is added.

- [ ] **Step 3: Implement typed wrappers and minimal admin queue UI** against Task 7 contract. Do not call transfer providers, expose private evidence publicly, or put business logic in React.
- [ ] **Step 4: Run green focused admin tests**

Run from `client/`: same command as Step 2.
Expected: all PASS with existing payment-reconciliation behavior preserved.

- [ ] **Step 5: Commit** `feat(admin): manage paid PayOS checkout exceptions`.

## Task 9: Browser acceptance, docs and rollout

**Files:**
- Create: `client/e2e/payos-checkout.spec.ts` and local fixture additions only if needed; modify `client/playwright.config.ts` only for an isolated PayOS project if required.
- Modify: `docs/API.md`, `docs/DEVELOPMENT.md`, `Wiki/entities/payment.md`, `Wiki/concepts/durable-operations.md`, `Wiki/index.md`, `Wiki/log.md`, `docs/backlog/README.md`.

**Interfaces:** Browser fixture must use backend PayOS simulator/test seam and never issue real money. Production setup docs name required existing PayOS credentials and public webhook plus authenticated operations runner; no values/secrets committed.

- [ ] **Step 1: Add browser cases** for mocked verified pending->paid/finalizing->created and cancel/error states across existing 8 EN/VI, light/dark, mobile/desktop projects; include keyboard focus and status live-region checks. Do not assert a real provider success from a local mock.
- [ ] **Step 2: Run browser suite**

Run from `client/`: `node ./node_modules/@playwright/test/cli.js test e2e/payos-checkout.spec.ts`.
Expected: all configured variants PASS using the local simulator fixture.

- [ ] **Step 3: Update API and operations docs** with owner/guest routes, state contract, status polling limits, CSRF, retry schedule, webhook durability, task runner scheduler requirement and safe redacted diagnostics.
- [ ] **Step 4: Update Wiki current facts only after code is merged in this branch**; bump `Wiki/index.md` Last updated date and append one `Wiki/log.md` entry. Link this proposed design from the backlog without labeling implementation/live acceptance complete.
- [ ] **Step 5: Run final verification**

Run from `server/`: `corepack pnpm@12.4.2 typecheck`, `corepack pnpm@12.4.2 test -- --run`, `corepack pnpm@12.4.2 build`, `corepack pnpm@12.4.2 lint`.
Run from `client/`: `corepack pnpm@12.4.2 exec tsc -p tsconfig.json --noEmit`, `corepack pnpm@12.4.2 build`, `corepack pnpm@12.4.2 lint`, `corepack pnpm@12.4.2 test -- --run`, `corepack pnpm@12.4.2 test:e2e -- e2e/payos-checkout.spec.ts`.
Run isolated DB suite for payment attempts, orders and task recovery. Expected: all available checks PASS; report DB/browser/provider infrastructure gaps separately.

- [ ] **Step 6: Review migration and compatibility**: additive DDL; verified legacy lookups; no secrets; no broadened webhook CSRF exemption; no duplicated refunds; no auto confirmation from query/cache; rollback retains paid facts.
- [ ] **Step 7: Commit** `docs(payments): document PayOS checkout recovery and operations`.

## Coverage map and handoff

Tasks 1–2 cover AC01 and the schema/provider portions of AC12. Task 3 covers AC02–04 and the evidence part of AC03. Task 4 covers AC04–06 and AC09, with Main-owned app composition wiring. Task 5 covers AC07 and API/CSRF/rate-limit parts of AC01. Task 6 covers AC08 and customer-facing AC11. Task 7 covers AC10 and the financial-exception portion of AC06. Task 8 covers admin access to AC10. Task 9 covers browser acceptance, remaining AC11–12, package verification and rollout evidence. Require actual configured PayOS test acceptance for the external gate in AC12; local simulator is not a substitute.

## Self-review

- **Spec coverage:** every AC01–AC12 maps to at least one implementation task and explicit tests/evidence above.
- **Review Focus:** all five cases are pinned to Tasks 2–7 and have named tests; no operational edge is silently left to the implementer.
- **Type consistency:** `PaymentAttemptStatus`, `PaymentAttemptService`, `processAttemptObservation`, `PAYOS_TASK_PROCESSOR`, `TaskKind.PAYOS_RECONCILE`, and `OrdersService.finalizePayOSCheckout` are defined once above. Before execution, reconcile optional return variants with actual checkout DTO types, keep exact field names identical across layers.
- **Scope:** one payment-attempt workflow using existing MySQL, provider adapter, webhook inbox and task runner. Admin refund addresses paid/no-order exceptions only. No replacement of retail P0, no new queue, no general payment rewrite.
- **Execution gate:** plan is for owner review. Recommended execution is Subagent-driven: backend persistence, provider recovery, frontend and verification have distinct ownership, while payment invariants still require Main Codex integration. Implementation begins only after owner review of spec/plan and confirmation of the execution method, as required by `superpowers:brainstorming` and `superpowers:writing-plans`.
