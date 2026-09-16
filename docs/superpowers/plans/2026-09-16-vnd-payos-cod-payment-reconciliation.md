# VND PayOS and COD Payment Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Make new checkout VND-only with PayOS and COD, remove Stripe and bank transfer from the active runtime surface, and add durable PayOS webhook processing plus admin reconciliation.

**Architecture:** Keep MySQL-first repositories and the existing NestJS order/payment boundaries. PayOS webhook ingestion will persist a normalized idempotency record before calling the existing transactional PayOS reservation finalizer; reconciliation will call the official PayOS payment-link lookup and reuse that same finalizer. The admin reconciliation controller is registered with OrdersModule to avoid a PaymentsModule-to-OrdersModule cycle, while provider-specific SDK code remains inside PayOSService.

**Tech Stack:** NestJS 11, Express 5, TypeScript 6, MySQL/mysql2, Prisma 7 schema and forward migrations, Zod, @payos/node, React 19, React Router 7, Axios, SCSS, Vitest, Playwright, pnpm 12.3.4.

**Spec:** docs/superpowers/specs/2026-09-16-vnd-payos-cod-payment-reconciliation-design.md

## Global Constraints

- New checkout accepts exactly payos and cash; stripe, card, and bank_transfer are rejected before persistence.
- VND is the store, order, and provider currency for every new record; PayOS receives whole-number VND unchanged and new ledger rows use FX rate 1 only for compatibility.
- No new code writes Stripe identifiers or creates a bank-transfer payment row.
- Historical Stripe columns, historical Stripe SQL/Prisma migrations, historical payment rows, and read-only historical labels remain intact.
- PayOS signature verification happens before webhook event persistence or business mutation.
- The browser return URL only polls status; it never proves payment or creates an order.
- Every webhook, finalization, reconciliation, COD confirmation, and delivery transition is idempotent and transaction-safe.
- Do not add a new payment provider, queue, cron worker, refund API call, or full Prisma persistence rewrite.
- Preserve authentication, CSRF, rate-limit, request-correlation, ownership, admin-role, route-local response, and guest-token boundaries.
- Keep client and server independent and update only client/pnpm-lock.yaml or server/pnpm-lock.yaml from the owning package.
- Do not stage or modify the existing unrelated client/src/i18n/en.ts worktree change.

## File map

Create:

- server/src/database/prisma/migrations/20260916100000_vnd_payment_reconciliation/migration.sql — additive delivery, payment-ledger, webhook-event, and reconciliation-attempt schema.
- server/src/payments/payment-reconciliation.repository.ts — MySQL reads/writes for webhook events, reconciliation candidates, attempts, and ledger projection.
- server/src/payments/payment-reconciliation.service.ts — PayOS webhook orchestration, provider lookup comparison, bounded admin reconciliation, and COD confirmation.
- server/src/payments/admin-payments.controller.ts — admin-only reconciliation routes.
- server/src/payments/__tests__/payment-reconciliation.service.test.ts — idempotency, mismatch, retry, lookup, and COD unit coverage.
- server/src/payments/__tests__/admin-payments.controller.test.ts — admin route response and guard-boundary coverage.
- client/src/features/admin/pages/AdminPaymentReconciliationPage.tsx — admin reconciliation queue and actions.
- client/src/features/admin/pages/AdminPaymentReconciliationPage.test.tsx — loading, filters, mismatch, retry, and COD action coverage.
- client/src/styles/features/admin/_payments.scss — reconciliation page styles using existing admin tokens.

Modify:

- server/src/database/prisma/schema.prisma
- server/src/payments/payment.types.ts
- server/src/payments/currency.ts and server/src/payments/currency.test.ts
- server/src/payments/payos.service.ts and server/src/payments/payos.service.test.ts
- server/src/payments/payment-provider.service.ts and its test
- server/src/payments/payosWebhook.controller.ts and its test
- server/src/orders/orders.dto.ts, orders.validator.ts, orders.types.ts
- server/src/orders/orders.controller.ts, orders.service.ts, orders.repository.ts
- server/src/orders/checkout-reservation.repository.ts and checkout-reservation.service.ts
- server/src/orders/orders.payos.service.ts and focused tests
- server/src/orders/orders.module.ts and app.module.ts
- server/src/auth/auth.module.ts and auth.module.test.ts
- server/src/main.ts
- server/src/database/__tests__/integration-database.ts and affected order integration fixtures
- server/src/config/env.config.ts, server/.env.example, and server/.env.docker.example
- server/package.json and server/pnpm-lock.yaml
- docs/API.md, docs/ARCHITECTURE.md, docs/DEVELOPMENT.md
- Wiki/index.md, Wiki/overview.md, Wiki/architecture.md, Wiki/concepts/order-lifecycle-and-support.md, Wiki/concepts/guest-checkout.md, Wiki/concepts/authentication-and-email-verification.md, Wiki/decisions/0003-payment-ledger-and-usd-canonical-currency.md, Wiki/decisions/0005-vietnam-first-vnd-catalog-and-mock-payos.md, and Wiki/log.md
- client/src/features/orders/api.ts, types.ts, CheckoutPaymentPage.tsx, CheckoutSuccessPage.tsx, OrderHistoryPage.tsx, and their focused tests
- client/src/features/admin/api.ts, client/src/components/layout/AdminSidebar.tsx, AdminSidebar.test.tsx, client/src/routes/router.tsx, and router.test.tsx
- client/src/styles/index.scss

Delete active runtime files and their tests:

- server/src/config/stripe.config.ts
- server/src/orders/orders.stripe.service.ts
- server/src/orders/__tests__/orders.stripe.service.test.ts
- server/src/stripe/stripe.service.ts
- server/src/stripe/stripeWebhook.controller.ts
- server/src/stripe/stripeWebhook.module.ts
- server/src/stripe/stripe-webhook-flow.spec.ts
- server/src/stripe/__tests__/stripe.service.test.ts
- server/src/stripe/__tests__/stripeWebhook.controller.test.ts

Keep historical database artifacts and archived historical plans/specs untouched:

- server/src/database/migrations/2026-07-07-add-stripe-payment-support.sql
- server/src/database/prisma/migrations/20260824053250_enforce_stripe_checkout_idempotency
- older docs/superpowers/plans and docs/superpowers/specs that describe the historical Stripe rollout

---

### Task 1: Establish the VND-only payment contract

**Files:**
- Modify: server/src/payments/payment.types.ts
- Modify: server/src/payments/currency.ts
- Test: server/src/payments/currency.test.ts
- Test: server/src/payments/payment-provider.service.test.ts

**Interfaces:**
- Produces PaymentProviderName = "cash" | "payos", PaymentCurrency = "VND", PaymentStatus including pending, paid, failed, refund_pending, partially_refunded, and refunded.
- Produces buildPaymentQuote(baseAmount: number, provider: PaymentProviderName): PaymentQuote with whole-number VND amount and fxRate 1.
- Produces assertNewPaymentProvider(value: unknown): PaymentProviderName, throwing a 400-shaped domain error for stripe, card, bank_transfer, or any other value.

- [ ] **Step 1: Write failing currency and allowlist tests**

~~~ts
it("keeps a VND PayOS amount unchanged and sets FX to one", () => {
    expect(buildPaymentQuote(1_399_000, "payos")).toEqual({
        baseAmount: 1_399_000,
        baseCurrency: "VND",
        amount: 1_399_000,
        currency: "VND",
        fxRate: 1,
    });
});

it("rounds a fractional compatibility input to a whole VND amount", () => {
    expect(buildPaymentQuote(10.6, "cash").amount).toBe(11);
});

it("rejects legacy providers before a payment is created", () => {
    expect(() => assertNewPaymentProvider("stripe")).toThrow("Unsupported payment method");
    expect(() => assertNewPaymentProvider("card")).toThrow("Unsupported payment method");
    expect(() => assertNewPaymentProvider("bank_transfer")).toThrow("Unsupported payment method");
});
~~~

Run: pnpm --dir server exec vitest run src/payments/currency.test.ts src/payments/payment-provider.service.test.ts

Expected: FAIL because the current quote requires an FX argument for some PayOS paths and the provider type still includes legacy values.

- [ ] **Step 2: Implement the VND-only quote**

Replace the conversion branch in currency.ts with:

~~~ts
export function buildPaymentQuote(
    baseAmount: number,
    _provider: PaymentProviderName,
): PaymentQuote {
    if (!Number.isFinite(baseAmount) || baseAmount < 0) {
        throw new Error("Invalid VND base amount");
    }
    const amount = Math.round(baseAmount);
    if (!Number.isSafeInteger(amount)) {
        throw new Error("VND amount must be a safe integer");
    }
    return {
        baseAmount: amount,
        baseCurrency: "VND",
        amount,
        currency: "VND",
        fxRate: 1,
    };
}
~~~

Remove convertUsdToVnd and the usdToVndRate/baseCurrency arguments from the new quote API. Keep only a separate read-only formatter for historical non-VND rows.

- [ ] **Step 3: Make PaymentProviderService accept only new providers**

Remove Stripe refund creation and make createPayment validate assertNewPaymentProvider before mock/live branching. Keep deterministic mock references, fail closed when live PayOS credentials are absent, and return pending for cash and PayOS creation.

- [ ] **Step 4: Run and commit the contract**

Run: pnpm --dir server exec vitest run src/payments/currency.test.ts src/payments/payment-provider.service.test.ts

Expected: PASS with all new payment quotes in VND and no conversion-rate dependency.

~~~text
git add server/src/payments/payment.types.ts server/src/payments/currency.ts server/src/payments/currency.test.ts server/src/payments/payment-provider.service.ts server/src/payments/payment-provider.service.test.ts
git commit -m "refactor(payments): enforce VND payment contract"
~~~

### Task 2: Add the additive payment and delivery schema

**Files:**
- Create: server/src/database/prisma/migrations/20260916100000_vnd_payment_reconciliation/migration.sql
- Modify: server/src/database/prisma/schema.prisma

**Interfaces:**
- Produces orders.delivered_at as the authoritative delivery timestamp.
- Produces order_payments reconciliation_status, provider_status, last_reconciled_at, and last_reconciliation_error.
- Produces payment_webhook_events with unique provider/event_key and normalized non-secret payload storage.
- Produces payment_reconciliation_attempts with exactly one pending-checkout or order-payment target.

- [ ] **Step 1: Write the additive SQL migration**

Create the migration with this SQL:

~~~sql
ALTER TABLE orders
    ADD COLUMN delivered_at DATETIME NULL,
    ADD INDEX orders_delivered_at_idx (delivered_at);

UPDATE orders
SET delivered_at = date_added
WHERE status = 1 AND delivered_at IS NULL;

ALTER TABLE order_payments
    ADD COLUMN reconciliation_status VARCHAR(24) NOT NULL DEFAULT 'PENDING',
    ADD COLUMN provider_status VARCHAR(32) NULL,
    ADD COLUMN last_reconciled_at DATETIME NULL,
    ADD COLUMN last_reconciliation_error TEXT NULL,
    ADD INDEX order_payments_reconciliation_idx (reconciliation_status, last_reconciled_at);

CREATE TABLE payment_webhook_events (
    id INT NOT NULL AUTO_INCREMENT,
    provider VARCHAR(32) NOT NULL,
    event_key VARCHAR(255) NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    payload_hash CHAR(64) NOT NULL,
    normalized_payload JSON NOT NULL,
    order_code BIGINT NULL,
    payment_link_id VARCHAR(255) NULL,
    amount DECIMAL(14,0) NULL,
    currency CHAR(3) NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'RECEIVED',
    attempt_count INT NOT NULL DEFAULT 0,
    last_error TEXT NULL,
    received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processed_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY payment_webhook_events_provider_key (provider, event_key),
    INDEX payment_webhook_events_status_received_idx (status, received_at),
    INDEX payment_webhook_events_provider_order_idx (provider, order_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE payment_reconciliation_attempts (
    id INT NOT NULL AUTO_INCREMENT,
    provider VARCHAR(32) NOT NULL,
    pending_checkout_id INT NULL,
    order_payment_id INT NULL,
    requested_by VARCHAR(255) NULL,
    outcome VARCHAR(24) NOT NULL,
    local_status VARCHAR(24) NULL,
    provider_status VARCHAR(32) NULL,
    expected_amount DECIMAL(14,0) NULL,
    provider_amount DECIMAL(14,0) NULL,
    expected_currency CHAR(3) NULL,
    provider_currency CHAR(3) NULL,
    provider_reference VARCHAR(255) NULL,
    mismatch_reason TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX payment_reconciliation_attempts_pending_idx (pending_checkout_id),
    INDEX payment_reconciliation_attempts_payment_idx (order_payment_id),
    INDEX payment_reconciliation_attempts_outcome_idx (outcome, created_at),
    CONSTRAINT payment_reconciliation_target_chk
        CHECK ((pending_checkout_id IS NULL) <> (order_payment_id IS NULL)),
    CONSTRAINT fk_reconciliation_pending_checkout
        FOREIGN KEY (pending_checkout_id) REFERENCES pending_checkouts (id),
    CONSTRAINT fk_reconciliation_order_payment
        FOREIGN KEY (order_payment_id) REFERENCES order_payments (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
~~~

Do not drop or rename existing Stripe columns, legacy migrations, or historical payment values. Backfill only status-1 orders.

- [ ] **Step 2: Align Prisma models and relations**

Add deliveredAt to Order and the four reconciliation fields to OrderPayment. Add PaymentWebhookEvent and PaymentReconciliationAttempt models with mapped snake_case fields, indexes, and relations to PendingCheckout and OrderPayment. Use String status fields rather than Prisma enums so the MySQL-first runtime and historical values remain compatible.

~~~prisma
deliveredAt DateTime? @map("delivered_at") @db.DateTime(0)

reconciliationStatus    String    @default("PENDING") @map("reconciliation_status") @db.VarChar(24)
providerStatus          String?   @map("provider_status") @db.VarChar(32)
lastReconciledAt        DateTime? @map("last_reconciled_at") @db.DateTime(0)
lastReconciliationError String?   @map("last_reconciliation_error") @db.Text
~~~

- [ ] **Step 3: Validate and commit the schema**

Run:

~~~text
pnpm --dir server prisma:format
pnpm --dir server prisma:validate
git diff --check
~~~

Expected: Prisma validation succeeds, the migration is forward-only, and no whitespace errors are reported.

~~~text
git add server/src/database/prisma/schema.prisma server/src/database/prisma/migrations/20260916100000_vnd_payment_reconciliation/migration.sql
git commit -m "feat(payments): add reconciliation event schema"
~~~

### Task 3: Record delivery and confirm COD atomically

**Files:**
- Modify: server/src/orders/orders.service.ts
- Modify: server/src/orders/orders.repository.ts
- Modify: server/src/orders/orders.controller.ts
- Modify: server/src/orders/orders.types.ts
- Test: server/src/orders/__tests__/orders.lifecycle.test.ts
- Test: server/src/orders/__tests__/orders.controller.test.ts

**Interfaces:**
- Changes changeOrderStatus(orderId: number, status: number, actorId?: string | number | null) to pass the authenticated admin actor into the transaction.
- Adds delivered_at to order summary/detail projections.
- Keeps status values 0, 1, and 2 unchanged.

- [ ] **Step 1: Write delivery and COD tests**

~~~ts
it("sets delivered_at and marks a pending COD ledger paid once", async () => {
    const result = await service.changeOrderStatus(41, 1, "admin-1");

    expect(result.status).toBe(1);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("delivered_at"), expect.any(Array));
    expect(query).toHaveBeenCalledWith(
        expect.stringContaining("provider = 'cash'"),
        expect.arrayContaining([41]),
    );
});

it("does not complete an unpaid PayOS order as delivered", async () => {
    await expect(service.changeOrderStatus(42, 1, "admin-1"))
        .rejects.toMatchObject({ statusCode: 409 });
});

it("repeating Done does not add a second delivery event", async () => {
    await service.changeOrderStatus(41, 1, "admin-1");
    await service.changeOrderStatus(41, 1, "admin-1");
    expect(createTimelineEventInTransaction).toHaveBeenCalledTimes(1);
});
~~~

Run: pnpm --dir server exec vitest run src/orders/__tests__/orders.lifecycle.test.ts src/orders/__tests__/orders.controller.test.ts

Expected: FAIL because the current Done transaction updates only status.

- [ ] **Step 2: Implement the locked Done transition**

Inside the existing withTransaction callback, lock the order and latest payment, reject canceled orders and unpaid PayOS payments, and apply:

~~~ts
await tx.query(
    "UPDATE orders SET status = 1, delivered_at = COALESCE(delivered_at, UTC_TIMESTAMP()) WHERE id = ? AND status = 0",
    [orderId],
);

if (payment?.provider === "cash" && payment.status === "pending") {
    await tx.query(
        "UPDATE order_payments SET status = 'paid', paid_at = COALESCE(paid_at, UTC_TIMESTAMP()), reconciliation_status = 'MANUAL_CONFIRMED', last_reconciled_at = UTC_TIMESTAMP(), provider_status = 'COLLECTED', updated_at = UTC_TIMESTAMP() WHERE id = ? AND provider = 'cash' AND status = 'pending'",
        [payment.id],
    );
}
~~~

Write the status-1 timeline event only when the order changes from pending. Return the existing order for a repeated Done command, while ensuring a missing legacy delivery timestamp is populated. Never mark a pending PayOS payment paid from an admin delivery action.

- [ ] **Step 3: Update projections and pass the actor**

Add DATE_FORMAT(o.delivered_at, '%Y-%m-%dT%H:%i:%s.000Z') to order summary/detail queries and map it through OrderSummaryRow, OrderDetailRow, and OrderDetail. Update OrdersController.changeOrderStatus to pass String(req.user?.id || "").

- [ ] **Step 4: Run and commit**

Run: pnpm --dir server exec vitest run src/orders/__tests__/orders.lifecycle.test.ts src/orders/__tests__/orders.controller.test.ts

Expected: PASS with one delivery timestamp, one COD payment confirmation, and one timeline event.

~~~text
git add server/src/orders/orders.service.ts server/src/orders/orders.repository.ts server/src/orders/orders.controller.ts server/src/orders/orders.types.ts server/src/orders/__tests__/orders.lifecycle.test.ts server/src/orders/__tests__/orders.controller.test.ts
git commit -m "feat(orders): record delivery and confirm COD"
~~~

### Task 4: Remove Stripe and bank transfer from the active server runtime

**Files:**
- Modify: server/src/orders/orders.dto.ts
- Modify: server/src/orders/orders.validator.ts
- Modify: server/src/orders/orders.types.ts
- Modify: server/src/orders/orders.controller.ts
- Modify: server/src/orders/orders.service.ts
- Modify: server/src/orders/checkout-reservation.repository.ts
- Modify: server/src/orders/checkout-reservation.service.ts
- Modify: server/src/orders/orders.module.ts
- Modify: server/src/payments/payments.module.ts
- Modify: server/src/payments/payment-provider.service.ts
- Modify: server/src/auth/auth.module.ts and auth.module.test.ts
- Modify: server/src/app.module.ts and server/src/main.ts
- Modify: server/src/database/__tests__/integration-database.ts and affected tests
- Delete: active Stripe files listed in the file map
- Test: server/src/orders/__tests__/guest-purchase.test.ts
- Test: server/src/orders/__tests__/orders.integration.test.ts

**Interfaces:**
- New purchase validators accept only cash and payos.
- Authenticated and guest PayOS checkout continue to use their existing PayOS-specific routes.
- No Stripe checkout, Stripe session lookup, or Stripe webhook route remains active.
- Historical columns and migration artifacts remain in the database schema.

- [ ] **Step 1: Add rejection tests**

~~~ts
for (const paymentMethod of ["stripe", "card", "bank_transfer"]) {
    it("rejects " + paymentMethod + " before persistence", async () => {
        await expect(controller.makePurchase("user-1", {
            totalPrice: 100_000,
            cart: [{ productId: 7, quantity: 1, price: 100_000 }],
            discount: 0,
            shippingAddress: "Test address",
            paymentMethod,
        } as never)).rejects.toMatchObject({ status: 400 });
    });
}
~~~

Run: pnpm --dir server exec vitest run src/orders/__tests__/orders.controller.test.ts src/orders/__tests__/guest-purchase.test.ts

Expected: FAIL until schemas and controller no longer contain legacy choices.

- [ ] **Step 2: Remove active legacy routes and DTOs**

Delete Stripe checkout handlers and session lookup handlers that exist only for the redirect. Remove GuestStripePaymentMethod, Stripe checkout payloads, the card branch, and every bank_transfer validator value. Keep PayOS order-code lookup and mock confirmation.

- [ ] **Step 3: Remove Stripe identifiers from new writes**

Remove stripeCheckoutSessionId and stripePaymentIntentId from CreateOrderFromCartInput and new order INSERT statements. Omit stripe_session_id from new pending-checkout INSERTs so it remains NULL. Keep the legacy columns in Prisma and MySQL.

- [ ] **Step 4: Remove providers and bootstrap wiring**

Remove StripeService and NestOrdersStripeService providers/imports, remove StripeWebhookModule from AppModule, remove the Stripe path from the auth-module public webhook allowlist, and remove rawBody: true from NestFactory.create. Delete only active Stripe source/tests listed in the file map. Convert integration fixtures that use stripeSessionId into provider-neutral PayOS fixtures.

- [ ] **Step 5: Run the server scan and commit**

Run:

~~~text
pnpm --dir server exec vitest run src/orders/__tests__/orders.controller.test.ts src/orders/__tests__/guest-purchase.test.ts src/orders/__tests__/orders.integration.test.ts
rg -n "Stripe|stripe|bank_transfer|GuestStripe|checkout-session|by-session" server/src server/api --glob "*.ts" --glob "*.js" --glob "*.mjs"
~~~

Expected: tests pass; the scan returns only explicitly retained legacy compatibility field names, if any, and no active Stripe route/provider code.

~~~text
git add server/src/orders server/src/payments server/src/auth/auth.module.ts server/src/auth/auth.module.test.ts server/src/app.module.ts server/src/main.ts server/src/database/__tests__
git rm server/src/config/stripe.config.ts server/src/orders/orders.stripe.service.ts server/src/orders/__tests__/orders.stripe.service.test.ts server/src/stripe/stripe.service.ts server/src/stripe/stripeWebhook.controller.ts server/src/stripe/stripeWebhook.module.ts server/src/stripe/stripe-webhook-flow.spec.ts server/src/stripe/__tests__/stripe.service.test.ts server/src/stripe/__tests__/stripeWebhook.controller.test.ts
git commit -m "refactor(payments): remove Stripe and bank transfer runtime"
~~~

### Task 5: Normalize PayOS lookup and reconciliation provider contracts

**Files:**
- Modify: server/src/payments/payos.service.ts
- Modify: server/src/payments/payos.service.test.ts
- Modify: server/src/payments/payment.types.ts
- Create: server/src/payments/payment-reconciliation.repository.ts
- Test: server/src/payments/__tests__/payment-reconciliation.service.test.ts

**Interfaces:**
- Produces PayOSService.getPaymentLink(identifier: { paymentLinkId?: string; orderCode?: number }): Promise<PayOSPaymentLookup>.
- PayOSPaymentLookup contains orderCode, paymentLinkId, amount, amountPaid, status, and currency: "VND".
- Produces repository methods insertWebhookEvent, claimWebhookEvent, completeWebhookEvent, listCandidates, getPendingCheckoutForUpdate, getOrderPaymentForUpdate, recordAttempt, projectReconciliation, and listWebhookEvents.
- The repository uses parameterized SQL and TransactionContext for every mutation.

- [ ] **Step 1: Write the provider lookup test**

~~~ts
it("retrieves a PayOS payment link by order code", async () => {
    payosMocks.client.paymentRequests.get.mockResolvedValue({
        id: "link-123",
        orderCode: 123456,
        amount: 250000,
        amountPaid: 250000,
        status: "PAID",
        transactions: [],
    });

    await expect(service.getPaymentLink({ orderCode: 123456 })).resolves.toEqual({
        orderCode: 123456,
        paymentLinkId: "link-123",
        amount: 250000,
        amountPaid: 250000,
        status: "PAID",
        currency: "VND",
    });
    expect(payosMocks.client.paymentRequests.get).toHaveBeenCalledWith(123456);
});
~~~

Run: pnpm --dir server exec vitest run src/payments/payos.service.test.ts

Expected: FAIL because PayOSService has no lookup method.

- [ ] **Step 2: Implement the PayOS lookup adapter**

Call paymentRequests.get with the numeric order code or payment-link string, normalize the SDK PaymentLink into PayOSPaymentLookup, and reject identifiers where neither field is present. Treat PayOS settlement currency as VND in this boundary.

- [ ] **Step 3: Implement the reconciliation repository**

Add parameterized queries for the schema from Task 2. claimWebhookEvent inserts the unique provider/event_key, returns inserted=false for an existing event with the same payload hash, and returns a conflict result when the same key has a different payload hash. listCandidates paginates at most 100 rows and joins pending checkout/order payment data without exposing token hashes.

- [ ] **Step 4: Run and commit**

Run: pnpm --dir server exec vitest run src/payments/payos.service.test.ts src/payments/__tests__/payment-reconciliation.service.test.ts

Expected: PASS for PayOS lookup normalization and repository idempotency contracts.

~~~text
git add server/src/payments/payos.service.ts server/src/payments/payos.service.test.ts server/src/payments/payment.types.ts server/src/payments/payment-reconciliation.repository.ts server/src/payments/__tests__/payment-reconciliation.service.test.ts
git commit -m "feat(payments): add PayOS reconciliation boundary"
~~~

### Task 6: Make PayOS webhooks durable and retry-safe

**Files:**
- Create: server/src/payments/payment-reconciliation.service.ts
- Modify: server/src/payments/payosWebhook.controller.ts
- Modify: server/src/payments/payosWebhook.controller.test.ts
- Modify: server/src/orders/orders.payos.service.ts and focused tests
- Modify: server/src/orders/orders.module.ts
- Modify: server/src/payments/payosWebhook.module.ts
- Test: server/src/payments/__tests__/payment-reconciliation.service.test.ts

**Interfaces:**
- Produces handleVerifiedPayOSWebhook(input: VerifiedPayOSWebhook): Promise<PayOSWebhookOutcome>.
- Produces buildPayOSEventKey(data): string using data.reference when present, otherwise SHA-256 of canonical orderCode, paymentLinkId, amount, currency, code, status, and transactionDateTime.
- PayOSWebhookOutcome is processed, duplicate, ignored, mismatch, or retryable and contains a safe HTTP status.
- The service calls NestOrdersService.finalizePayOSCheckout(orderCode, paymentLinkId, amount) as the only order-creation finalizer.

- [ ] **Step 1: Write failing durability tests**

~~~ts
it("does not finalize a duplicate processed event", async () => {
    repository.claimWebhookEvent.mockResolvedValue({
        inserted: false,
        status: "PROCESSED",
        payloadHashMatches: true,
        eventId: 7,
    });

    await expect(service.handleVerifiedPayOSWebhook(validInput)).resolves.toMatchObject({
        kind: "duplicate",
        httpStatus: 200,
    });
    expect(ordersService.finalizePayOSCheckout).not.toHaveBeenCalled();
});

it("records a mismatched reservation without creating an order", async () => {
    ordersService.finalizePayOSCheckout.mockRejectedValue(
        Object.assign(new Error("PayOS payment amount or reference does not match the checkout reservation."), { statusCode: 409 }),
    );

    await expect(service.handleVerifiedPayOSWebhook(validInput)).resolves.toMatchObject({
        kind: "mismatch",
        httpStatus: 200,
    });
    expect(repository.completeWebhookEvent).toHaveBeenCalledWith(expect.anything(), "MISMATCH", expect.any(String));
});

it("returns a retryable result when finalization fails transiently", async () => {
    ordersService.finalizePayOSCheckout.mockRejectedValue(new Error("database unavailable"));

    await expect(service.handleVerifiedPayOSWebhook(validInput)).resolves.toMatchObject({
        kind: "retryable",
        httpStatus: 500,
    });
});
~~~

Run: pnpm --dir server exec vitest run src/payments/__tests__/payment-reconciliation.service.test.ts src/payments/payosWebhook.controller.test.ts

Expected: FAIL because event claiming and status projection do not exist.

- [ ] **Step 2: Implement event normalization and claiming**

Verify the signature in PayOSWebhookController before calling the service. Pass only verified WebhookData plus a normalized outer envelope. Store order code, link ID, amount, VND currency, reference, transaction time, provider code, and derived provider status; never store account numbers, checksum keys, raw guest tokens, or raw payload.

Claim the event in a transaction. A processed, ignored, or mismatch duplicate returns HTTP 200. A PROCESSING event returns retryable HTTP 500 so PayOS can retry if the first worker failed. A same-key/different-hash conflict is durable MISMATCH and never finalizes.

- [ ] **Step 3: Implement the finalization state machine**

For a signed successful PayOS event, require outer success/code 00, verified data code 00, safe positive order code and amount, currency VND, and paymentLinkId. Mark the event PROCESSING, call the existing finalizer, and mark PROCESSED only after finalization resolves. Map a domain 409 from exact order/reference/amount validation to durable MISMATCH with HTTP 200. Map an unknown reservation to IGNORED only when no local reservation/order matches; map database/provider failures to FAILED and HTTP 500.

- [ ] **Step 4: Replace direct controller finalization**

PayOSWebhookController must no longer call NestOrdersPayOSService.handlePaymentWebhook directly. It verifies PayOS, delegates to PaymentReconciliationService, and returns the existing request-correlated envelope with HTTP 200, 400, or 500. Keep invalid signatures unpersisted and HTTP 400.

- [ ] **Step 5: Run and commit**

Run: pnpm --dir server exec vitest run src/payments/__tests__/payment-reconciliation.service.test.ts src/payments/payosWebhook.controller.test.ts src/orders/__tests__/orders.payos.finalization.test.ts

Expected: PASS for duplicate, mismatch, retry, signature, exact VND amount, and one-finalization behavior.

~~~text
git add server/src/payments/payment-reconciliation.service.ts server/src/payments/payosWebhook.controller.ts server/src/payments/payosWebhook.controller.test.ts server/src/payments/__tests__/payment-reconciliation.service.test.ts server/src/orders/orders.payos.service.ts server/src/orders/__tests__/orders.payos.finalization.test.ts server/src/orders/orders.module.ts server/src/payments/payosWebhook.module.ts
git commit -m "feat(payments): harden PayOS webhook processing"
~~~

### Task 7: Add admin reconciliation and COD confirmation APIs

**Files:**
- Modify: server/src/payments/payment-reconciliation.service.ts
- Modify: server/src/payments/payment-reconciliation.repository.ts
- Create: server/src/payments/admin-payments.controller.ts
- Create: server/src/payments/__tests__/admin-payments.controller.test.ts
- Modify: server/src/orders/orders.module.ts

**Interfaces:**
- GET /api/admin/payments/reconciliation accepts provider, reconciliationStatus, page, and limit and returns candidates, pagination, and msg.
- POST /api/admin/payments/reconciliation/run accepts limit and returns results; the service clamps limit to 100.
- POST /api/admin/payments/:paymentId/reconcile returns one reconciliation result.
- POST /api/admin/payments/:paymentId/confirm-cod accepts optional note and returns the confirmed payment.
- GET /api/admin/payments/:paymentId/webhook-events returns events and msg.
- AdminPaymentsController is registered in OrdersModule and every route uses AuthGuard, RolesGuard, and Roles("admin").

- [ ] **Step 1: Write controller contract tests**

~~~ts
it("clamps a reconciliation run to one hundred candidates", async () => {
    await controller.runReconciliation({ limit: 999 }, adminRequest);
    expect(service.runReconciliation).toHaveBeenCalledWith({ limit: 100, requestedBy: "admin-1" });
});

it("returns route-local admin payment data", async () => {
    service.listCandidates.mockResolvedValue({
        candidates: [],
        pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
    });
    await expect(controller.listReconciliation({ page: 1, limit: 50 }, adminRequest))
        .resolves.toMatchObject({
            candidates: [],
            msg: "Payment reconciliation candidates retrieved successfully",
        });
});
~~~

Run: pnpm --dir server exec vitest run src/payments/__tests__/admin-payments.controller.test.ts

Expected: FAIL because the controller and service methods do not exist.

- [ ] **Step 2: Implement PayOS reconciliation lookup**

For a pending checkout, load the locked local provider order code/link ID and expected integer VND amount. For an order payment, load its PayOS reference and amount. Call PayOSService.getPaymentLink, compare provider status, order code, link ID, amount, and VND, and record MATCHED, MISMATCH, UNAVAILABLE, or FAILED in an append-only attempt. A matching PAID result invokes finalizePayOSCheckout and projects MATCHED after the transaction completes.

- [ ] **Step 3: Implement COD confirmation**

Lock the order payment, require provider cash and status pending or paid, update pending cash to paid with reconciliation_status MANUAL_CONFIRMED, provider_status COLLECTED, paid_at, and an audit attempt. Never accept amount, provider, or payment status from the request body; accept only an optional trimmed operator note.

- [ ] **Step 4: Add guarded routes**

Implement the five route methods with request IDs and existing response conventions. Return 404 for hidden/nonexistent payment IDs, 409 for local conflicts, 400 for malformed query/body, and 503/500 for unavailable provider or retryable database errors. Register controller, service, and repository providers in OrdersModule and export the service for PayOSWebhookModule.

- [ ] **Step 5: Run and commit**

Run: pnpm --dir server exec vitest run src/payments/__tests__/admin-payments.controller.test.ts src/payments/__tests__/payment-reconciliation.service.test.ts

Expected: PASS with admin-only contracts, a 100-item bound, PayOS recovery, mismatch persistence, and COD audit confirmation.

~~~text
git add server/src/payments/admin-payments.controller.ts server/src/payments/__tests__/admin-payments.controller.test.ts server/src/payments/payment-reconciliation.service.ts server/src/payments/payment-reconciliation.repository.ts server/src/orders/orders.module.ts
git commit -m "feat(admin): add payment reconciliation operations"
~~~

### Task 8: Remove legacy payment choices from the client checkout

**Files:**
- Modify: client/src/features/orders/types.ts
- Modify: client/src/features/orders/api.ts
- Modify: client/src/features/orders/components/CheckoutPaymentPage.tsx
- Modify: client/src/features/orders/components/CheckoutPaymentPage.test.tsx
- Modify: client/src/features/orders/pages/CheckoutSuccessPage.tsx
- Modify: client/src/features/orders/pages/CheckoutSuccessPage.test.tsx
- Modify: client/src/features/orders/pages/OrderHistoryPage.tsx
- Modify: client/src/features/orders/api.test.ts

**Interfaces:**
- CheckoutPaymentPage payment_method is "payos" | "cash".
- GuestPurchaseRequest.paymentMethod is "payos" | "cash".
- There is no client method or route call for Stripe/card checkout, Stripe session polling, or bank-transfer instructions.
- Historical order display may map legacy strings to a read-only label without exposing a new checkout option.

- [ ] **Step 1: Write client regression tests**

~~~tsx
it("renders only PayOS and cash on delivery", () => {
    renderCheckout();
    expect(screen.getByRole("radio", { name: /PayOS/i })).toBeVisible();
    expect(screen.getByRole("radio", { name: /cash on delivery/i })).toBeVisible();
    expect(screen.queryByRole("radio", { name: /bank transfer/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /card|stripe/i })).not.toBeInTheDocument();
});
~~~

Remove the Stripe success-page test and replace it with a PayOS-only polling assertion. Run: pnpm --dir client exec vitest run src/features/orders/components/CheckoutPaymentPage.test.tsx src/features/orders/pages/CheckoutSuccessPage.test.tsx

Expected: FAIL while the card and bank-transfer branches still render.

- [ ] **Step 2: Simplify order types and API methods**

Remove GuestCardPaymentMethod, Stripe checkout request types, createGuestCheckoutSession, and session-id fetchers. Keep createGuestPayOSCheckoutSession, createPayOSCheckoutSession, cash purchase, PayOS order-code lookup, and mock PayOS confirmation. Keep payment_method as string-compatible only on historical response types.

- [ ] **Step 3: Simplify the checkout component**

Set CheckoutForm.payment_method to "payos" | "cash", keep PayOS as the default, remove the bank-transfer detail panel, remove the card branch, and submit cash through the existing purchase endpoint. Preserve server-authoritative cart/discount totals and guest-token handling. Never create a client amount for PayOS.

- [ ] **Step 4: Simplify success polling and historical labels**

CheckoutSuccessPage should poll only by PayOS order code for a PayOS redirect. Immediate cash success remains unchanged. OrderHistoryPage may display PayOS, Cash on delivery, Historical card payment, or Historical bank transfer based on stored data, but those labels must not render an actionable payment choice.

- [ ] **Step 5: Run and commit**

Run:

~~~text
pnpm --dir client exec vitest run src/features/orders/components/CheckoutPaymentPage.test.tsx src/features/orders/pages/CheckoutSuccessPage.test.tsx src/features/orders/api.test.ts
pnpm --dir client exec tsc -p tsconfig.json --noEmit
~~~

Expected: PASS with no client Stripe/card/bank-transfer checkout branch.

~~~text
git add client/src/features/orders
git commit -m "refactor(checkout): keep PayOS and COD only"
~~~

### Task 9: Build the admin reconciliation page

**Files:**
- Modify: client/src/features/admin/api.ts
- Create: client/src/features/admin/pages/AdminPaymentReconciliationPage.tsx
- Test: client/src/features/admin/pages/AdminPaymentReconciliationPage.test.tsx
- Modify: client/src/components/layout/AdminSidebar.tsx
- Modify: client/src/components/layout/AdminSidebar.test.tsx
- Modify: client/src/routes/router.tsx and router.test.tsx
- Create: client/src/styles/features/admin/_payments.scss
- Modify: client/src/styles/index.scss

**Interfaces:**
- Client API functions are fetchPaymentReconciliationCandidates, runPaymentReconciliation, reconcileAdminPayment, confirmAdminCodPayment, and fetchPaymentWebhookEvents.
- The page uses route /admin/payments/reconciliation and existing RequireAdmin/AdminLayout/AdminStatusPanel/admin__card/admin__table patterns.
- The page renders provider, local status, expected amount, provider amount, order code/link ID, last event state, mismatch reason, retry, and COD confirmation.

- [ ] **Step 1: Write page/API tests**

~~~ts
expect(http.get).toHaveBeenCalledWith("/api/admin/payments/reconciliation", { params: { page: 1, limit: 50 } });
expect(http.post).toHaveBeenCalledWith("/api/admin/payments/reconciliation/run", { limit: 100 });
expect(http.post).toHaveBeenCalledWith("/api/admin/payments/77/confirm-cod", { note: "Collected at delivery" });
~~~

~~~tsx
it("shows a retryable error instead of an empty reconciliation queue", async () => {
    mocks.fetchPaymentReconciliationCandidates.mockRejectedValue(new Error("network"));
    render(<AdminPaymentReconciliationPage />);
    expect(await screen.findByText(/reconciliation unavailable/i)).toBeVisible();
    expect(screen.getByRole("button", { name: /retry/i })).toBeVisible();
});
~~~

Run: pnpm --dir client exec vitest run src/features/admin/pages/AdminPaymentReconciliationPage.test.tsx src/features/admin/api.test.ts

Expected: FAIL because API functions and the page do not exist.

- [ ] **Step 2: Implement typed admin API wrappers**

Normalize response data into typed candidate, pagination, reconciliation result, and webhook-event records. Pass query values with Axios params; do not concatenate untrusted filter values into URLs.

- [ ] **Step 3: Implement page states and actions**

Load candidates on mount, keep provider/status filters local, expose Refresh and Run reconciliation controls, disable action buttons while their request is pending, refresh after success, and show a non-blocking toast while keeping API errors visible.

- [ ] **Step 4: Wire route and navigation**

Add a lazy page import and a RequireAdmin route at /admin/payments/reconciliation. Add Payment reconciliation to AdminSidebar with a payment-oriented icon and a match key active for nested paths. Update sidebar/router tests.

- [ ] **Step 5: Add responsive styles and commit**

Import _payments.scss from styles/index.scss. Use existing admin variables, table scroll wrappers, compact action buttons, status pills, and the existing mobile breakpoint. Do not introduce a second admin shell.

Run: pnpm --dir client exec vitest run src/features/admin/pages/AdminPaymentReconciliationPage.test.tsx src/features/admin/api.test.ts src/components/layout/AdminSidebar.test.tsx src/routes/router.test.tsx

Expected: PASS with admin route protection, loading/error/empty/success states, filters, retry actions, and responsive table markup.

~~~text
git add client/src/features/admin/api.ts client/src/features/admin/pages/AdminPaymentReconciliationPage.tsx client/src/features/admin/pages/AdminPaymentReconciliationPage.test.tsx client/src/components/layout/AdminSidebar.tsx client/src/components/layout/AdminSidebar.test.tsx client/src/routes/router.tsx client/src/routes/router.test.tsx client/src/styles/features/admin/_payments.scss client/src/styles/index.scss
git commit -m "feat(admin): add payment reconciliation workspace"
~~~

### Task 10: Remove active configuration references and update knowledge

**Files:**
- Modify: server/src/config/env.config.ts
- Modify: server/.env.example and server/.env.docker.example
- Modify: server/package.json and server/pnpm-lock.yaml
- Modify: docs/API.md, docs/ARCHITECTURE.md, docs/DEVELOPMENT.md
- Modify: Wiki/index.md, Wiki/overview.md, Wiki/architecture.md, Wiki/concepts/order-lifecycle-and-support.md, Wiki/concepts/guest-checkout.md, Wiki/concepts/authentication-and-email-verification.md, Wiki/decisions/0003-payment-ledger-and-usd-canonical-currency.md, Wiki/decisions/0005-vietnam-first-vnd-catalog-and-mock-payos.md, Wiki/log.md

**Interfaces:**
- env.storeCurrency is the constant VND for new runtime records.
- STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_TEST_MODE, STORE_CURRENCY, and PAYOS_USD_TO_VND_RATE are absent from maintained runtime templates and env.config.
- Historical SQL import remains documented as a baseline compatibility operation, not an active provider integration.

- [ ] **Step 1: Define the cleanup scan**

~~~powershell
rg -n "Stripe|stripe|bank_transfer|PAYOS_USD_TO_VND_RATE|STORE_CURRENCY" server/src client/src server/package.json server/.env.example server/.env.docker.example docs/API.md docs/ARCHITECTURE.md docs/DEVELOPMENT.md Wiki --glob "!docs/superpowers/**" --glob "!server/src/database/migrations/2026-07-07-add-stripe-payment-support.sql"
~~~

Only legacy database column names or explicit historical compatibility notes may remain. Active controllers, services, validators, client checkout, package dependencies, and environment templates must not match.

- [ ] **Step 2: Remove configuration and dependency references**

Set storeCurrency to VND, remove Stripe and FX environment fields, delete the stripe dependency with the package-local pnpm command, and keep the historical docker baseline import unchanged because it loads the legacy schema.

Run: pnpm --dir server remove stripe

- [ ] **Step 3: Update current docs and Wiki**

Document PayOS and COD as the only new payment methods, exact VND amounts, durable webhook states, bounded admin reconciliation, manual COD confirmation, manual PayOS/COD refunds, delivered_at, and historical compatibility. Update Wiki/index.md Last updated and append one line to Wiki/log.md. Do not rewrite archived historical rollout plans/specs.

- [ ] **Step 4: Run full verification**

Run:

~~~text
pnpm --dir server prisma:validate
pnpm --dir server typecheck
pnpm --dir server build
pnpm --dir server lint
pnpm --dir server test -- --run
pnpm --dir client exec tsc -p tsconfig.json --noEmit
pnpm --dir client build
pnpm --dir client lint
pnpm --dir client test -- --run
git diff --check
~~~

If the MySQL integration target is available, also run pnpm --dir server test:integration and pnpm --dir server prisma:migrate:status. For browser verification, exercise authenticated and guest PayOS mock checkout, cash checkout, duplicate/mismatch webhook tests, the admin reconciliation route, and mobile/desktop table layouts. Do not run destructive reset/seed commands against production or shared data.

- [ ] **Step 5: Review scope and commit**

Confirm git status still shows only the unrelated client/src/i18n/en.ts modification outside the feature commits, inspect staged names, and confirm no secrets or environment files with real credentials are staged.

~~~text
git status --short --branch
git diff --stat main...HEAD
git diff --check main...HEAD
git commit -m "docs(payments): document VND reconciliation operations"
~~~

Expected: the feature branch contains only the approved VND/PayOS/COD implementation and documentation changes; main remains untouched until an explicit PR/merge request.
