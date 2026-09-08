# Commerce Operations and Payments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver safe, database-backed order cancellation/refund behavior, multi-provider payment records with USD/VND conversion, Done-only reviews, real support tickets, Firebase account recovery, and database-backed promotion/admin alerts while deferring product comparison.

**Architecture:** Keep MySQL as the operational source of truth and preserve existing NestJS feature boundaries. Add a small payments module for currency conversion/provider seams, a support module, and an admin-alert query service; use additive migrations and keep existing order status and response keys compatible.

**Tech Stack:** NestJS 11, TypeScript, MySQL/mysql2, Prisma 7 schema/client generation, Stripe 22 adapter boundary, React 19, Vite, Firebase Web Auth, Vitest, Zod.

**Spec:** `docs/superpowers/specs/2026-09-07-commerce-operations-and-payments-design.md`

## Global Constraints

- Use Node.js `24.20.0` and pnpm `12.3.4`.
- Run package commands from the owning package with `pnpm --dir client ...` or `pnpm --dir server ...`.
- Keep USD as the canonical order currency; only PayOS settlement quotes use integer VND.
- Keep `0=Pending`, `1=Done`, `2=Canceled`; only Pending can transition to Done or Canceled.
- Preserve auth, CSRF, CORS, ownership, admin authorization, and route-local response shapes.
- Use `PAYMENT_PROVIDER_MODE=mock` for local symbolic Stripe/PayOS behavior; never commit credentials or claim a real payment succeeded without a provider result.
- Do not implement product comparison in this plan.
- Do not reset, seed, migrate, commit, push, or modify `main` as part of execution.

---

### Task 1: Currency and payment ledger foundation

**Files:**
- Create: `server/src/payments/currency.ts`
- Test: `server/src/payments/currency.test.ts`
- Create: `server/src/payments/payment.types.ts`
- Create: `server/src/payments/payment-provider.service.ts`
- Test: `server/src/payments/payment-provider.service.test.ts`
- Create: `server/src/payments/payments.module.ts`
- Modify: `server/src/config/env.config.ts`
- Modify: `server/.env.example`
- Modify: `server/.env.docker.example`
- Modify: `server/src/database/prisma/schema.prisma`
- Create: `server/src/database/prisma/migrations/20260907100000_order_payments_and_operations/migration.sql`
- Modify: `server/src/orders/orders.module.ts`
- Modify: `server/src/orders/orders.service.ts`
- Modify: `server/src/orders/orders.stripe.service.ts`
- Modify: `server/src/orders/orders.types.ts`
- Modify: `server/src/app.module.ts`

**Interfaces:**
- Produces `convertUsdToVnd(amountUsd: number, rate: number): number` and `buildPaymentQuote(baseAmountUsd: number, provider: PaymentProviderName, rate?: number): PaymentQuote`.
- Produces `PaymentProviderService.createPayment(input)` and `PaymentProviderService.refundPayment(input)`.
- Produces a `order_payments` row for cash, bank transfer, Stripe, and PayOS-compatible checkout paths.

- [ ] **Step 1: Write the failing currency tests**

```ts
it("rounds a USD amount to integer VND for PayOS", () => {
    expect(convertUsdToVnd(19.99, 25_000)).toBe(499_750);
});

it("rejects PayOS quotes without an explicit FX rate", () => {
    expect(() => buildPaymentQuote(10, "payos")).toThrow("PAYOS_USD_TO_VND_RATE");
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `pnpm --dir server exec vitest run src/payments/currency.test.ts`

Expected: FAIL because the currency module does not exist.

- [ ] **Step 3: Implement the conversion and provider types**

```ts
export type PaymentProviderName = "cash" | "bank_transfer" | "stripe" | "payos";
export type PaymentCurrency = "USD" | "VND";

export function convertUsdToVnd(amountUsd: number, rate: number): number {
    if (!Number.isFinite(amountUsd) || amountUsd < 0 || !Number.isFinite(rate) || rate <= 0) {
        throw new Error("Invalid USD/VND conversion inputs");
    }
    return Math.round(amountUsd * rate);
}
```

`buildPaymentQuote` returns `{ baseAmount, baseCurrency: "USD", amount, currency, fxRate }`; cash, bank transfer, and Stripe return USD, while PayOS requires a positive configured rate and returns integer VND.

- [ ] **Step 4: Run currency tests and verify GREEN**

Run: `pnpm --dir server exec vitest run src/payments/currency.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing provider-mode tests**

```ts
it("returns deterministic symbolic references in mock mode", async () => {
    const service = new PaymentProviderService({ paymentProviderMode: "mock" } as never, {} as never);
    await expect(service.createPayment({ provider: "payos", orderId: 12, amount: 250000, currency: "VND" }))
        .resolves.toMatchObject({ status: "pending", providerReference: "mock_payos_order_12" });
});

it("does not simulate a successful refund when live Stripe credentials are absent", async () => {
    const service = new PaymentProviderService({ paymentProviderMode: "live", stripeSecretKey: "" } as never, {} as never);
    await expect(service.refundPayment({ provider: "stripe", paymentId: "pi_123", amount: 10, currency: "USD" }))
        .rejects.toThrow("Stripe payments are not configured");
});
```

- [ ] **Step 6: Run provider tests and verify RED**

Run: `pnpm --dir server exec vitest run src/payments/payment-provider.service.test.ts`

Expected: FAIL because the provider service does not exist.

- [ ] **Step 7: Implement the provider service and Stripe refund wrapper**

Add `StripeService.refundPayment(paymentIntentId: string, amountCents?: number)` that calls Stripe only in live mode. The mock branch returns deterministic `mock_<provider>_order_<id>` references. The service must return `simulated: true` in mock mode so clients/admins can distinguish it from a live settlement.

- [ ] **Step 8: Add additive schema and migration**

Add to `orders`: `currency VARCHAR(3) NOT NULL DEFAULT 'USD'`, `inventory_restored_at DATETIME NULL`, and `cancellation_reason TEXT NULL`.

Create `order_payments` with `id`, `order_id`, `provider`, `status`, `provider_reference`, `provider_payment_id`, `idempotency_key UNIQUE`, `base_amount`, `base_currency`, `amount`, `currency`, `fx_rate`, `paid_at`, `refunded_at`, `refund_reference`, `simulated`, and timestamps plus indexes for order/status.

- [ ] **Step 9: Generate and validate Prisma**

Run: `pnpm --dir server prisma:format` and `pnpm --dir server prisma:validate`.

Expected: PASS. Do not run migration against a production database.

- [ ] **Step 10: Record a payment row during order creation and Stripe finalization**

Insert one pending/paid ledger row in the same transaction as the order. Normalize legacy `card` to `stripe`, preserve USD as `base_amount`, and use the VND quote only for a PayOS row. Expose payment fields in order detail types.

- [ ] **Step 11: Run focused provider/order tests**

Run: `pnpm --dir server exec vitest run src/payments src/orders/__tests__/orders.reservation-finalization.test.ts src/orders/__tests__/orders.stripe.service.test.ts`

Expected: PASS, or report an exact database/config blocker.

---

### Task 2: Order lifecycle, refund, inventory restoration, timeline, and notification

**Files:**
- Test: `server/src/orders/__tests__/orders.lifecycle.test.ts`
- Modify: `server/src/orders/orders.validator.ts`
- Modify: `server/src/orders/orders.controller.ts`
- Modify: `server/src/orders/orders.service.ts`
- Modify: `server/src/orders/orders.repository.ts`
- Modify: `server/src/orders/orders.types.ts`
- Modify: `server/src/notifications/notifications.service.ts`
- Modify: `client/src/features/orders/api.ts`
- Modify: `client/src/features/orders/types.ts`
- Modify: `client/src/features/orders/pages/OrderHistoryPage.tsx`

**Interfaces:**
- Produces `NestOrdersService.cancelOrder(orderId, actorId, isAdmin, reason?)`.
- Adds `POST /api/orders/:oid/cancel` for owner/admin and routes existing admin status changes through the same transition policy.

- [ ] **Step 1: Write failing lifecycle tests**

```ts
it("allows Pending to Canceled and restores stock once", async () => {
    const result = await service.cancelOrder(9, "user-1", false, "Changed my mind");
    expect(result.order.status).toBe(2);
    expect(inventoryService.restoreOrderStock).toHaveBeenCalledTimes(1);
    expect(timelineService.createTimelineEventInTransaction).toHaveBeenCalledTimes(1);
    expect(notificationsService.notifyOrderStatus).toHaveBeenCalledWith("user-1", 9, 2);
});

it("rejects Done to Canceled", async () => {
    await expect(service.cancelOrder(9, "user-1", false)).rejects.toMatchObject({ statusCode: 409 });
});
```

- [ ] **Step 2: Run lifecycle tests and verify RED**

Run: `pnpm --dir server exec vitest run src/orders/__tests__/orders.lifecycle.test.ts`

Expected: FAIL because cancellation is not implemented.

- [ ] **Step 3: Implement status transition and cancellation validation**

Use `SELECT ... FOR UPDATE`. Return the existing terminal state for an idempotent repeat; throw a 409 for any other terminal transition. Add `cancelOrder` to the controller with `AuthGuard` and runtime owner/admin access check.

- [ ] **Step 4: Implement one-time restoration**

Inside the transaction, when `inventory_restored_at IS NULL`, lock order items/products, increment each product by the snapshot quantity, create one `restock_cancelled_order` movement per product, and set `inventory_restored_at = UTC_TIMESTAMP()`. The timestamp is the retry/concurrency guard.

- [ ] **Step 5: Add paid Stripe refund sequencing**

Read the order payment row before finalization. For `paid` Stripe payment, call `PaymentProviderService.refundPayment` before the cancellation transaction; then mark the payment `refunded`/`refund_reference` and finalize cancellation atomically. If the provider fails, leave order status and stock unchanged.

- [ ] **Step 6: Run lifecycle tests and verify GREEN**

Run: `pnpm --dir server exec vitest run src/orders/__tests__/orders.lifecycle.test.ts src/orders/__tests__/orders.controller.test.ts`

Expected: PASS.

- [ ] **Step 7: Add customer cancel action and payment display**

Show a Cancel action only for Pending orders, call `cancelCustomerOrder`, refresh the list, and render USD amounts with the saved payment currency/amount when present. Keep existing reorder behavior.

- [ ] **Step 8: Run order typecheck**

Run: `pnpm --dir server typecheck` and `pnpm --dir client exec tsc -p tsconfig.json --noEmit`.

Expected: PASS.

---

### Task 3: Done-only reviews

**Files:**
- Test: `server/src/reviews/__tests__/reviews.service.eligibility.test.ts`
- Modify: `server/src/reviews/reviews.service.ts`
- Modify: `server/src/reviews/reviews.repository.ts`
- Modify: `server/src/reviews/reviews.types.ts`
- Modify: `server/src/reviews/reviews.controller.ts`

**Interfaces:**
- Produces `ReviewsRepository.hasCompletedPurchase(uid, pid): Promise<boolean>`.
- Produces a 403/409 domain error with the message `You can review this product after a completed order.` when the predicate is false.

- [ ] **Step 1: Write failing tests for Pending/canceled/Done**

```ts
it.each([0, 2])("rejects review for status %s", async (status) => {
    repository.hasCompletedPurchase = vi.fn().mockResolvedValue(false);
    await expect(service.addReview("u1", 10, 5, "text")).rejects.toThrow("completed order");
});

it("allows review after Done order", async () => {
    repository.hasCompletedPurchase = vi.fn().mockResolvedValue(true);
    await expect(service.addReview("u1", 10, 5, "text")).resolves.toMatchObject({ msg: expect.any(String) });
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm --dir server exec vitest run src/reviews/__tests__/reviews.service.eligibility.test.ts`

Expected: FAIL because the eligibility predicate is not called.

- [ ] **Step 3: Implement one Done-only predicate**

Use `EXISTS (SELECT 1 FROM orders JOIN order_items ... WHERE o.user_id = ? AND oi.product_id = ? AND o.status = 1)`. Call it before create/update and reuse the exact `status = 1` predicate in public verified-purchase queries.

- [ ] **Step 4: Run review tests and verify GREEN**

Run: `pnpm --dir server exec vitest run src/reviews`

Expected: PASS.

---

### Task 4: Persisted support tickets

**Files:**
- Create: `server/src/support/support.types.ts`
- Create: `server/src/support/support.validator.ts`
- Create: `server/src/support/support.repository.ts`
- Create: `server/src/support/support.service.ts`
- Create: `server/src/support/support.controller.ts`
- Create: `server/src/support/support.module.ts`
- Test: `server/src/support/__tests__/support.controller.test.ts`
- Modify: `server/src/database/prisma/schema.prisma`
- Modify: `server/src/database/prisma/migrations/20260907100000_order_payments_and_operations/migration.sql`
- Modify: `server/src/app.module.ts`
- Create: `client/src/features/support/api.ts`
- Modify: `client/src/pages/ContactUsPage.tsx`
- Modify: `client/src/pages/SupportPage.tsx`

**Interfaces:**
- Produces `POST/GET /api/support/tickets` and admin `PATCH /api/support/tickets/:id`.
- Uses `SupportTicketService.createTicket`, `listTickets`, and `updateTicket`.

- [ ] **Step 1: Write failing validation/controller tests**

```ts
it("creates a ticket with the authenticated owner", async () => {
    vi.spyOn(service, "createTicket").mockResolvedValue({ id: 1, status: "OPEN" } as never);
    await expect(controller.createTicket("user-1", { subject: "Order issue", message: "Please help" }))
        .resolves.toMatchObject({ ticket: { id: 1 } });
});

it("rejects an empty message", () => {
    expect(() => supportTicketCreateSchema.parse({ subject: "x", message: "" })).toThrow();
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm --dir server exec vitest run src/support/__tests__/support.controller.test.ts`

Expected: FAIL because the module and schema do not exist.

- [ ] **Step 3: Implement schema, repository, service, module, and guarded routes**

Create `support_tickets` with owner/order/category/subject/message/status/priority/admin_note/timestamps. Customer list queries `WHERE user_id = ?`; admin list/update uses `Roles("admin")`. Sanitize and length-limit subject/message/admin note with Zod.

- [ ] **Step 4: Run support tests and verify GREEN**

Run: `pnpm --dir server exec vitest run src/support`

Expected: PASS.

- [ ] **Step 5: Wire the contact form to the API**

Call `createSupportTicket` through `client/src/lib/http.ts`, show loading/error/success states, and preserve the existing toast UX. Add a Support page link to the real contact flow; do not claim that a ticket was created when the request failed.

- [ ] **Step 6: Run client support checks**

Run: `pnpm --dir client test -- --run src/pages/__tests__/ContactUsPage.test.tsx` and `pnpm --dir client exec tsc -p tsconfig.json --noEmit`.

Expected: PASS.

---

### Task 5: Firebase password reset and email verification

**Files:**
- Test: `client/src/services/firebase.test.ts`
- Modify: `client/src/services/firebase.ts`
- Modify: `client/src/features/auth/pages/SignupPage.tsx`
- Create: `client/src/features/auth/pages/ForgotPasswordPage.tsx`
- Modify: `client/src/routes/router.tsx`
- Modify: `client/src/features/users/pages/CustomerAccountPage.tsx`

**Interfaces:**
- Produces `sendFirebasePasswordReset(email: string): Promise<void>`.
- Produces `sendFirebaseEmailVerification(): Promise<void>` using the current Firebase user.

- [ ] **Step 1: Write failing helper tests**

```ts
it("exports password reset and verification helpers", () => {
    expect(sendFirebasePasswordReset).toEqual(expect.any(Function));
    expect(sendFirebaseEmailVerification).toEqual(expect.any(Function));
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm --dir client test -- --run src/services/firebase.test.ts`

Expected: FAIL because the helpers do not exist.

- [ ] **Step 3: Implement Firebase helpers using the Web Auth SDK**

Call `sendPasswordResetEmail(auth, email)` and `sendEmailVerification(auth.currentUser)`; throw a clear error when no current user exists for verification. Do not expose account-existence details in the forgot-password UI.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `pnpm --dir client test -- --run src/services/firebase.test.ts`

Expected: PASS.

- [ ] **Step 5: Wire signup, forgot-password route, and account resend action**

After signup registration succeeds, call the verification helper and show a “check your email” state. Add `/forgot-password` linked from login; always show the same neutral success message after submission. Add a resend button on the account page using Firebase’s current user.

- [ ] **Step 6: Run frontend checks**

Run: `pnpm --dir client exec tsc -p tsconfig.json --noEmit`, `pnpm --dir client test -- --run`, `pnpm --dir client build`, and `pnpm --dir client lint`.

Expected: PASS.

---

### Task 6: Real promotion analytics and admin alerts

**Files:**
- Test: `server/src/analytics/__tests__/analytics.service.test.ts`
- Modify: `server/src/analytics/analytics.service.ts`
- Modify: `server/src/analytics/analytics.controller.ts`
- Modify: `server/src/analytics/analytics.module.ts`
- Create: `server/src/admin-alerts/admin-alerts.types.ts`
- Create: `server/src/admin-alerts/admin-alerts.repository.ts`
- Create: `server/src/admin-alerts/admin-alerts.service.ts`
- Create: `server/src/admin-alerts/admin-alerts.controller.ts`
- Create: `server/src/admin-alerts/admin-alerts.module.ts`
- Test: `server/src/admin-alerts/__tests__/admin-alerts.service.test.ts`
- Modify: `server/src/app.module.ts`
- Modify: `client/src/features/admin/pages/AdminNotificationsPage.tsx`
- Modify: `client/src/components/layout/AdminHeader.tsx`

**Interfaces:**
- Produces `GET /api/admin/alerts` returning `{ alerts, unread, msg }`.
- Keeps analytics response keys but calculates promotion metrics from consumed redemption rows and completed/non-canceled orders.

- [ ] **Step 1: Write failing analytics/alert tests**

```ts
it("maps promotion redemptions to actual orders and discount totals", async () => {
    repository.getPromotionPerformance = vi.fn().mockResolvedValue([
        { discount_code: "SAVE10", redemption_count: "3", discount_total: "42.50" },
    ]);
    await expect(service.getPromotionPerformance()).resolves.toEqual([
        expect.objectContaining({ code: "SAVE10", estimated_orders: 3, discount_given: 42.5 }),
    ]);
});

it("returns live alerts from pending orders, low stock, tickets, and users", async () => {
    repository.getAlerts = vi.fn().mockResolvedValue([{ type: "support", priority: "High" }]);
    await expect(service.getAlerts()).resolves.toMatchObject([{ type: "support" }]);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm --dir server exec vitest run src/analytics/__tests__/analytics.service.test.ts src/admin-alerts/__tests__/admin-alerts.service.test.ts`

Expected: FAIL because the real query/service is not implemented.

- [ ] **Step 3: Implement promotion query and mapping**

Join `discount_redemptions` to `discounts` and `orders`, filter `status = 'CONSUMED'` and `orders.status <> 2`, group by discount, and return numeric `estimated_orders`/`discount_given`. Preserve `attachedCodesTracked` as true only when the query is actually backed by redemption rows.

- [ ] **Step 4: Implement admin alert query and guarded endpoint**

Return current pending orders, pending bank transfers, low/out-of-stock products, open/high-priority support tickets, and suspended users. Keep query limits bounded and apply `Roles("admin")`.

- [ ] **Step 5: Run backend tests and verify GREEN**

Run: `pnpm --dir server exec vitest run src/analytics src/admin-alerts`

Expected: PASS.

- [ ] **Step 6: Replace client-side broad fetches with alert endpoint**

The admin page and header call `/api/admin/alerts`, preserve filtering/counts/navigation, and remove local fake dismissal as the source of truth. An alert disappears only after the underlying order/ticket/stock/account state changes.

- [ ] **Step 7: Run full package checks**

Run: `pnpm --dir server typecheck`, `pnpm --dir server build`, `pnpm --dir server lint`, `pnpm --dir client exec tsc -p tsconfig.json --noEmit`, `pnpm --dir client build`, `pnpm --dir client lint`, `pnpm --dir client test -- --run`, and `git diff --check`.

Expected: PASS; report any pre-existing or environment-specific failure separately.

---

### Task 7: Wiki and final review

**Files:**
- Modify: `Wiki/index.md`
- Modify: `Wiki/architecture.md`
- Modify: `Wiki/log.md`
- Create: `Wiki/decisions/0003-payment-ledger-and-usd-canonical-currency.md`
- Create: `Wiki/concepts/order-lifecycle-and-support.md`

- [ ] **Step 1: Document the payment/currency and lifecycle decisions**

Record MySQL ownership, the additive ledger, USD/VND snapshot rule, cancellation idempotency guard, Done-only review predicate, support route ownership, and deferred comparison phase.

- [ ] **Step 2: Update index date and append one log entry**

Set the wiki last-updated date to `2026-09-07` and append a concise entry to `Wiki/log.md`.

- [ ] **Step 3: Review the complete diff**

Run: `git diff --check`, `git status --short`, and `git diff --stat`.

Confirm no `.env` secrets, root workspace files, unrelated user changes, production DB operation, Product comparison implementation, or weakened guard is included.
