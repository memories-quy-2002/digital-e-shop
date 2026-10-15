import { beforeEach, describe, expect, it, vi } from "vitest";
import { PaymentReconciliationRepository } from "../payment-reconciliation.repository";
import { PaymentReconciliationService } from "../payment-reconciliation.service";

type Query = ReturnType<typeof vi.fn>;
const buildTx = (query: Query) => ({ query });

describe("PaymentReconciliationRepository", () => {
    it("looks up a payment attempt by the persisted PayOS order code", async () => {
        const tx = buildTx(vi.fn().mockResolvedValue([{
            id: "attempt-1", pending_checkout_id: 11, provider_order_code: "123456", provider_link_id: null, expected_amount_vnd: 250000,
        }]));
        const repository = new PaymentReconciliationRepository();

        await expect(repository.findPaymentAttemptByProviderOrderCode(tx as never, "123456")).resolves.toEqual({
            id: "attempt-1", pendingCheckoutId: 11, providerOrderCode: "123456", providerLinkId: null, expectedAmountVnd: 250000,
            cancelRequestedAt: null,
        });
        expect(String(tx.query.mock.calls[0][0])).toContain("provider_order_code = ?");
        expect(tx.query.mock.calls[0][1]).toEqual(["payos", "123456"]);
    });

    it("claims a new event and returns a same-payload duplicate without conflicting", async () => {
        const tx = buildTx(vi.fn().mockResolvedValueOnce({ insertId: 7, affectedRows: 1 }).mockResolvedValueOnce([{ id: 7, status: "RECEIVED", payload_hash: "hash-1" }]));
        const repository = new PaymentReconciliationRepository();
        await expect(repository.claimWebhookEvent(tx as never, { provider: "payos", eventKey: "event-1", eventType: "PAYMENT_SUCCESS", payloadHash: "hash-1", normalizedPayload: { orderCode: 123456 }, orderCode: 123456, paymentLinkId: "link-123", amount: 250000, currency: "VND" })).resolves.toEqual({ inserted: true, eventId: 7, status: "RECEIVED", payloadHashMatches: true, attemptCount: 0 });

        const duplicate = buildTx(vi.fn().mockResolvedValueOnce({ affectedRows: 0 }).mockResolvedValueOnce([{ id: 7, status: "PROCESSED", payload_hash: "hash-1" }]));
        await expect(repository.claimWebhookEvent(duplicate as never, { provider: "payos", eventKey: "event-1", eventType: "PAYMENT_SUCCESS", payloadHash: "hash-1", normalizedPayload: { orderCode: 123456 } })).resolves.toMatchObject({ inserted: false, eventId: 7, status: "PROCESSED", payloadHashMatches: true, attemptCount: 0 });
        expect(duplicate.query.mock.calls[0][0]).toContain("ON DUPLICATE KEY UPDATE");
    });

    it("returns a payload conflict for a reused event key with a different hash", async () => {
        const tx = buildTx(vi.fn().mockResolvedValueOnce({ affectedRows: 0 }).mockResolvedValueOnce([{ id: 7, status: "PROCESSED", payload_hash: "different-hash" }]));
        const repository = new PaymentReconciliationRepository();
        await expect(repository.claimWebhookEvent(tx as never, { provider: "payos", eventKey: "event-1", eventType: "PAYMENT_SUCCESS", payloadHash: "hash-1", normalizedPayload: {} })).resolves.toMatchObject({ inserted: false, conflict: true, payloadHashMatches: false, attemptCount: 0 });
    });

    it("opens the attempt review resolution when cancellation recovery sees paid evidence", async () => {
        const tx = buildTx(vi.fn().mockResolvedValue({ affectedRows: 1 }));
        const repository = new PaymentReconciliationRepository();

        await repository.markPaymentAttemptReviewRequired(tx as never, "attempt-1");

        expect(String(tx.query.mock.calls[0][0])).toContain("order_state = 'REVIEW_REQUIRED'");
        expect(String(tx.query.mock.calls[0][0])).toContain("resolution_state = 'OPEN'");
        expect(tx.query.mock.calls[0][1]).toEqual(["attempt-1"]);
    });

    it("reclaims a stale PROCESSING event with a new lease generation", async () => {
        const tx = buildTx(vi.fn()
            .mockResolvedValueOnce({ affectedRows: 0 })
            .mockResolvedValueOnce([{
                id: 7,
                status: "PROCESSING",
                payload_hash: "hash-1",
                attempt_count: 3,
                updated_at: "2026-09-16 10:00:00",
            }])
            .mockResolvedValueOnce({ affectedRows: 1 }));
        const repository = new PaymentReconciliationRepository();

        await expect(repository.claimWebhookEvent(tx as never, {
            provider: "payos",
            eventKey: "event-1",
            eventType: "PAYMENT_SUCCESS",
            payloadHash: "hash-1",
            normalizedPayload: {},
        })).resolves.toMatchObject({
            inserted: false,
            eventId: 7,
            status: "PROCESSING",
            payloadHashMatches: true,
            attemptCount: 4,
            reclaimed: true,
        });
        expect(String(tx.query.mock.calls[2][0])).toContain("updated_at <= UTC_TIMESTAMP() - INTERVAL ? SECOND");
        expect(String(tx.query.mock.calls[2][0])).toContain("attempt_count = attempt_count + 1");
    });

    it("does not reclaim a fresh PROCESSING event", async () => {
        const tx = buildTx(vi.fn()
            .mockResolvedValueOnce({ affectedRows: 0 })
            .mockResolvedValueOnce([{
                id: 7,
                status: "PROCESSING",
                payload_hash: "hash-1",
                attempt_count: 3,
                updated_at: "2099-09-16 10:00:00",
            }])
            .mockResolvedValueOnce({ affectedRows: 0 }));
        const repository = new PaymentReconciliationRepository();

        await expect(repository.claimWebhookEvent(tx as never, {
            provider: "payos",
            eventKey: "event-1",
            eventType: "PAYMENT_SUCCESS",
            payloadHash: "hash-1",
            normalizedPayload: {},
        })).resolves.toMatchObject({
            inserted: false,
            status: "PROCESSING",
            payloadHashMatches: true,
            attemptCount: 3,
            reclaimed: false,
        });
        expect(tx.query).toHaveBeenCalledTimes(3);
        expect(tx.query.mock.calls[2][1]).toEqual([7, "hash-1", 3, expect.any(Number)]);
    });

    it("reports a failed conditional terminal transition instead of assuming it committed", async () => {
        const tx = buildTx(vi.fn().mockResolvedValue({ affectedRows: 0 }));
        const repository = new PaymentReconciliationRepository();

        await expect(repository.completeWebhookEvent(
            tx as never,
            7,
            "PROCESSED",
            null,
            { expectedStatus: "PROCESSING", expectedAttemptCount: 4 },
        )).resolves.toBe(false);
        expect(String(tx.query.mock.calls[0][0])).toContain("AND status = ?");
        expect(String(tx.query.mock.calls[0][0])).toContain("AND attempt_count = ?");
        expect(tx.query.mock.calls[0][1]).toEqual(["PROCESSED", null, "PROCESSED", "PROCESSED", 7, "PROCESSING", 4]);
    });

    it("bounds candidate pagination and does not select guest token hashes", async () => {
        const tx = buildTx(vi.fn().mockResolvedValueOnce([{ total: 101 }]).mockResolvedValueOnce([]));
        const repository = new PaymentReconciliationRepository();
        await expect(repository.listCandidates({ page: 3, limit: 999, provider: "payos" }, tx as never)).resolves.toMatchObject({ candidates: [], pagination: { page: 3, limit: 100, total: 101, totalPages: 2 } });
        const sql = String(tx.query.mock.calls[1][0]);
        expect(sql).toContain("LIMIT ? OFFSET ?");
        expect(sql).not.toContain("guest_order_token_hash");
        expect(tx.query.mock.calls[1][1]).toEqual(["payos", "payos", 100, 200]);
    });

    it("excludes terminal MATCHED PayOS order payments by default", async () => {
        const tx = buildTx(vi.fn().mockResolvedValueOnce([{ total: 0 }]).mockResolvedValueOnce([]));
        const repository = new PaymentReconciliationRepository();

        await repository.listCandidates({ provider: "payos" }, tx as never);

        const sql = String(tx.query.mock.calls[0][0]);
        expect(sql).toContain("op.provider <> 'payos' OR op.reconciliation_status <> 'MATCHED'");
        expect(sql).not.toContain("op.reconciliation_status = ?");
    });

    it("keeps an explicit MATCHED filter available for inspection", async () => {
        const tx = buildTx(vi.fn().mockResolvedValueOnce([{ total: 1 }]).mockResolvedValueOnce([]));
        const repository = new PaymentReconciliationRepository();

        await repository.listCandidates({ provider: "payos", reconciliationStatus: "MATCHED" }, tx as never);

        const sql = String(tx.query.mock.calls[0][0]);
        expect(sql).toContain("op.reconciliation_status = ?");
        expect(sql).not.toContain("op.provider <> 'payos' OR op.reconciliation_status <> 'MATCHED'");
    });

    it("repairs pending and paid cash rows while preserving paid_at and reading back the row", async () => {
        const tx = buildTx(vi.fn()
            .mockResolvedValueOnce({ affectedRows: 1 })
            .mockResolvedValueOnce([{ id: 42, status: "paid", paid_at: "2026-09-16 10:00:00" }]));
        const repository = new PaymentReconciliationRepository();

        await expect(repository.confirmCashPayment(tx as never, 42)).resolves.toEqual({ id: 42, status: "paid", paid_at: "2026-09-16 10:00:00" });
        expect(String(tx.query.mock.calls[0][0])).toContain("status IN ('pending', 'paid')");
        expect(String(tx.query.mock.calls[0][0])).toContain("paid_at = COALESCE(paid_at, UTC_TIMESTAMP())");
        expect(tx.query.mock.calls[0][1]).toEqual([42]);
    });

    it("matches finalized PayOS payments by webhook order code and payment-link ID", async () => {
        const tx = buildTx(vi.fn().mockResolvedValue([{ id: 9, order_code: 123456, payment_link_id: "link-123" }]));
        const repository = new PaymentReconciliationRepository();
        await expect(repository.listWebhookEvents(tx as never, 42)).resolves.toEqual([{ id: 9, order_code: 123456, payment_link_id: "link-123" }]);
        const sql = String(tx.query.mock.calls[0][0]);
        expect(sql).toContain("op.provider_reference = CAST(e.order_code AS CHAR)");
        expect(sql).toContain("op.provider_payment_id = e.payment_link_id");
        expect(sql).not.toContain("op.provider_reference = e.payment_link_id");
        expect(tx.query.mock.calls[0][1]).toEqual([42]);
    });

    it("keeps payment-link IDs as string lookup values", async () => {
        const tx = buildTx(vi.fn().mockResolvedValue([{ id: 10, payment_link_id: "000123" }]));
        const repository = new PaymentReconciliationRepository();
        await expect(repository.listWebhookEvents(tx as never, 43)).resolves.toEqual([{ id: 10, payment_link_id: "000123" }]);
        expect(tx.query.mock.calls[0][1]).toEqual([43]);
        expect(String(tx.query.mock.calls[0][0])).toContain("e.payment_link_id");
    });

    it.each([
        { name: "an absent reconciliation status", reconciliationStatus: undefined, expectedValues: ["cash", "cash", 50, 0] },
        { name: "PENDING", reconciliationStatus: "PENDING", expectedValues: ["cash", "PENDING", "cash", 50, 0] },
        { name: "CONSUMED", reconciliationStatus: "CONSUMED", expectedValues: ["cash", "CONSUMED", "cash", 50, 0] },
        { name: "PAID", reconciliationStatus: "PAID", expectedValues: ["cash", "PAID", "cash", 50, 0] },
    ])("keeps pending candidates restricted to PENDING for $name while filtering order payments by reconciliation status", async ({ reconciliationStatus, expectedValues }) => {
        const tx = buildTx(vi.fn().mockResolvedValueOnce([{ total: 0 }]).mockResolvedValueOnce([]));
        const repository = new PaymentReconciliationRepository();
        await repository.listCandidates({ provider: "cash", ...(reconciliationStatus ? { reconciliationStatus } : {}) }, tx as never);
        const countSql = String(tx.query.mock.calls[0][0]);
        const listSql = String(tx.query.mock.calls[1][0]);
        for (const sql of [countSql, listSql]) {
            expect(sql).toContain("op.provider = ?");
            expect(sql).toContain("pc.payment_provider = ?");
            expect(sql).toContain("pc.status = 'PENDING'");
            expect(sql).toContain("FROM order_payments op");
            expect(sql).toContain("FROM pending_checkouts pc");
            expect(sql).not.toContain("pc.payment_provider = 'payos'");
            if (reconciliationStatus) {
                expect(sql).toContain("op.reconciliation_status = ?");
            } else {
                expect(sql).not.toContain("op.reconciliation_status = ?");
            }
            if (reconciliationStatus && reconciliationStatus !== "PENDING") {
                expect(sql).toContain("1 = 0");
                expect(sql).not.toContain("pc.status = ?");
            } else {
                expect(sql).not.toContain("1 = 0");
            }
        }
        expect(tx.query.mock.calls[0][1]).toEqual(expectedValues.slice(0, -2));
        expect(tx.query.mock.calls[1][1]).toEqual(expectedValues);
    });
});


const { withTransaction } = vi.hoisted(() => ({ withTransaction: vi.fn() }));

vi.mock("../../database/transaction", () => ({ withTransaction }));

const validInput = {
    data: {
        orderCode: 123456,
        paymentLinkId: "link-123",
        amount: 250000,
        currency: "VND",
        code: "00",
        status: "PAID",
        reference: "reference-123",
        transactionDateTime: "2026-09-16T10:00:00Z",
    },
};

const buildRepository = () => ({
    claimWebhookEvent: vi.fn().mockResolvedValue({
        inserted: true,
        eventId: 7,
        status: "RECEIVED",
        payloadHashMatches: true,
        attemptCount: 0,
    }),
    completeWebhookEvent: vi.fn().mockResolvedValue(true),
});

describe("PaymentReconciliationService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        withTransaction.mockImplementation(async (work: (tx: unknown) => Promise<unknown>) => work({ query: vi.fn() }));
    });

    it("does not finalize a duplicate processed event", async () => {
        const repository = buildRepository();
        repository.claimWebhookEvent.mockResolvedValue({ inserted: false, status: "PROCESSED", payloadHashMatches: true, eventId: 7, attemptCount: 1 });
        const ordersService = { finalizePayOSCheckout: vi.fn() };
        const service = new PaymentReconciliationService(repository as never, ordersService as never);

        await expect(service.handleVerifiedPayOSWebhook(validInput)).resolves.toMatchObject({ kind: "duplicate", httpStatus: 200 });
        expect(ordersService.finalizePayOSCheckout).not.toHaveBeenCalled();
    });

    it("returns retryable for an event left in processing", async () => {
        const repository = buildRepository();
        repository.claimWebhookEvent.mockResolvedValue({ inserted: false, status: "PROCESSING", payloadHashMatches: true, eventId: 7, attemptCount: 1, reclaimed: false });
        const ordersService = { finalizePayOSCheckout: vi.fn() };
        const service = new PaymentReconciliationService(repository as never, ordersService as never);

        await expect(service.handleVerifiedPayOSWebhook(validInput)).resolves.toMatchObject({ kind: "retryable", httpStatus: 500 });
        expect(ordersService.finalizePayOSCheckout).not.toHaveBeenCalled();
    });

    it("records a same-key payload conflict without creating an order", async () => {
        const repository = buildRepository();
        repository.claimWebhookEvent.mockResolvedValue({ inserted: false, status: "PROCESSED", payloadHashMatches: false, conflict: true, eventId: 7, attemptCount: 1 });
        const ordersService = { finalizePayOSCheckout: vi.fn() };
        const service = new PaymentReconciliationService(repository as never, ordersService as never);

        await expect(service.handleVerifiedPayOSWebhook(validInput)).resolves.toMatchObject({ kind: "mismatch", httpStatus: 200 });
        expect(ordersService.finalizePayOSCheckout).not.toHaveBeenCalled();
        expect(repository.completeWebhookEvent).toHaveBeenCalledWith(expect.anything(), 7, "MISMATCH", expect.any(String), { expectedStatus: "PROCESSED", expectedAttemptCount: 1 });
    });

    it("records a mismatched reservation without creating an order", async () => {
        const repository = buildRepository();
        const ordersService = {
            finalizePayOSCheckout: vi.fn().mockRejectedValue(Object.assign(new Error("PayOS payment amount or reference does not match the checkout reservation."), { statusCode: 409 })),
        };
        const service = new PaymentReconciliationService(repository as never, ordersService as never);

        await expect(service.handleVerifiedPayOSWebhook(validInput)).resolves.toMatchObject({ kind: "mismatch", httpStatus: 200 });
        expect(repository.completeWebhookEvent).toHaveBeenCalledWith(expect.anything(), 7, "MISMATCH", expect.any(String), { expectedStatus: "PROCESSING", expectedAttemptCount: 1 });
    });

    it("returns retryable when finalization fails transiently", async () => {
        const repository = buildRepository();
        const ordersService = { finalizePayOSCheckout: vi.fn().mockRejectedValue(new Error("database unavailable")) };
        const service = new PaymentReconciliationService(repository as never, ordersService as never);

        await expect(service.handleVerifiedPayOSWebhook(validInput)).resolves.toMatchObject({ kind: "retryable", httpStatus: 500 });
        expect(repository.completeWebhookEvent).toHaveBeenCalledWith(expect.anything(), 7, "FAILED", "database unavailable", { expectedStatus: "PROCESSING", expectedAttemptCount: 1 });
    });

    it("ignores a successful event when no local reservation is found", async () => {
        const repository = buildRepository();
        const ordersService = { finalizePayOSCheckout: vi.fn().mockResolvedValue(null) };
        const service = new PaymentReconciliationService(repository as never, ordersService as never);

        await expect(service.handleVerifiedPayOSWebhook(validInput)).resolves.toMatchObject({ kind: "ignored", httpStatus: 200 });
        expect(repository.completeWebhookEvent).toHaveBeenCalledWith(expect.anything(), 7, "IGNORED", expect.any(String), { expectedStatus: "PROCESSING", expectedAttemptCount: 1 });
    });

    it("finalizes a verified exact VND event once and marks it processed", async () => {
        const repository = buildRepository();
        const ordersService = { finalizePayOSCheckout: vi.fn().mockResolvedValue({ id: 42, date_added: "2026-09-16T10:00:00.000Z" }) };
        const service = new PaymentReconciliationService(repository as never, ordersService as never);

        await expect(service.handleVerifiedPayOSWebhook(validInput)).resolves.toMatchObject({ kind: "processed", httpStatus: 200, orderId: 42 });
        expect(ordersService.finalizePayOSCheckout).toHaveBeenCalledTimes(1);
        expect(ordersService.finalizePayOSCheckout).toHaveBeenCalledWith(123456, "link-123", 250000);
        expect(repository.completeWebhookEvent).toHaveBeenCalledWith(expect.anything(), 7, "PROCESSED", null, { expectedStatus: "PROCESSING", expectedAttemptCount: 1 });
    });

    it("persists an exact signed receipt before requesting order finalization", async () => {
        const steps: string[] = [];
        const repository = buildRepository() as ReturnType<typeof buildRepository> & { findPaymentAttemptByProviderOrderCode: Query };
        repository.findPaymentAttemptByProviderOrderCode = vi.fn().mockResolvedValue({
            id: "attempt-1", providerOrderCode: "123456", providerLinkId: "link-123", expectedAmountVnd: 250000,
        });
        const ordersService = { finalizePayOSCheckout: vi.fn().mockImplementation(async () => { steps.push("finalize"); return { id: 42 }; }) };
        const attempts = { recordObservation: vi.fn().mockImplementation(async () => {
            steps.push("receipt");
            return { id: "attempt-1", paymentState: "PAID", orderState: "NOT_CREATED", resolutionState: "NONE", verifiedReceivedAmountVnd: 250000, orderId: null, inserted: true, conflicting: false };
        }) };
        const service = new PaymentReconciliationService(repository as never, ordersService as never, undefined, attempts as never);

        await expect(service.handleVerifiedPayOSWebhook(validInput)).resolves.toMatchObject({ kind: "processed", orderId: 42 });
        expect(steps).toEqual(["receipt", "finalize"]);
        expect(attempts.recordObservation).toHaveBeenCalledWith(expect.objectContaining({
            attemptId: "attempt-1", source: "WEBHOOK", providerOrderCode: "123456", providerLinkId: "link-123",
            expectedAmountVnd: 250000, reportedAmountVnd: 250000, paidAmountVnd: 250000, currency: "VND", verified: true,
        }));
    });

    it("acknowledges a verified notification with PENDING status without finalizing", async () => {
        const repository = buildRepository() as ReturnType<typeof buildRepository> & { findPaymentAttemptByProviderOrderCode: Query };
        repository.findPaymentAttemptByProviderOrderCode = vi.fn().mockResolvedValue({
            id: "attempt-1", pendingCheckoutId: 11, providerOrderCode: "123456", providerLinkId: "link-123", expectedAmountVnd: 250000,
        });
        const ordersService = { finalizePayOSCheckout: vi.fn() };
        const attempts = { recordObservation: vi.fn().mockResolvedValue({
            id: "attempt-1", paymentState: "PENDING", orderState: "NOT_CREATED", resolutionState: "NONE", verifiedReceivedAmountVnd: 0, orderId: null, inserted: true, conflicting: false,
        }) };
        const service = new PaymentReconciliationService(repository as never, ordersService as never, undefined, attempts as never);

        await expect(service.handleVerifiedPayOSWebhook({
            ...validInput, data: { ...validInput.data, status: "PENDING" },
        })).resolves.toMatchObject({ kind: "processed", httpStatus: 200 });
        expect(ordersService.finalizePayOSCheckout).not.toHaveBeenCalled();
        expect(repository.completeWebhookEvent).toHaveBeenCalledWith(expect.anything(), 7, "PROCESSED", null, { expectedStatus: "PROCESSING", expectedAttemptCount: 1 });
    });

    it("retains a signed amount mismatch as attempt evidence and does not finalize", async () => {
        const repository = buildRepository() as ReturnType<typeof buildRepository> & { findPaymentAttemptByProviderOrderCode: Query };
        repository.findPaymentAttemptByProviderOrderCode = vi.fn().mockResolvedValue({
            id: "attempt-1", providerOrderCode: "123456", providerLinkId: "link-123", expectedAmountVnd: 250000,
        });
        const ordersService = { finalizePayOSCheckout: vi.fn() };
        const attempts = { recordObservation: vi.fn().mockResolvedValue({
            id: "attempt-1", paymentState: "MISMATCH", orderState: "REVIEW_REQUIRED", resolutionState: "OPEN", inserted: true, conflicting: true,
        }) };
        const service = new PaymentReconciliationService(repository as never, ordersService as never, undefined, attempts as never);

        await expect(service.handleVerifiedPayOSWebhook({ data: { ...validInput.data, amount: 250001 } })).resolves.toMatchObject({ kind: "mismatch", httpStatus: 200 });
        expect(attempts.recordObservation).toHaveBeenCalledWith(expect.objectContaining({ reportedAmountVnd: 250001, paidAmountVnd: 250001 }));
        expect(ordersService.finalizePayOSCheckout).not.toHaveBeenCalled();
    });

    it("reopens durable review recovery when verified PAID arrives after cancellation", async () => {
        const repository = buildRepository() as ReturnType<typeof buildRepository> & Record<string, Query>;
        repository.findPaymentAttemptByProviderOrderCode = vi.fn().mockResolvedValue({
            id: "attempt-1", pendingCheckoutId: 11, providerOrderCode: "123456", providerLinkId: "link-123",
            expectedAmountVnd: 250000, cancelRequestedAt: "2026-10-01T00:00:00.000Z",
        });
        repository.getPaymentAttemptForUpdate = vi.fn().mockResolvedValue({
            id: "attempt-1", pendingCheckoutId: 11, orderId: null, cancelRequestedAt: new Date("2026-10-01T00:00:00.000Z"),
            paymentState: "CANCELLED", verifiedReceivedAmountVnd: 0,
        });
        repository.markPaymentAttemptReviewRequired = vi.fn().mockResolvedValue({ affectedRows: 1 });
        const attempts = { recordObservation: vi.fn().mockResolvedValue({
            id: "attempt-1", paymentState: "PAID", orderState: "NOT_CREATED", resolutionState: "OPEN",
            verifiedReceivedAmountVnd: 250000, orderId: null, inserted: true, conflicting: false,
        }) };
        const tasks = { enqueuePayOSWebhookRecovery: vi.fn().mockResolvedValue({ taskId: 8, dueAt: new Date() }) };
        const ordersService = { finalizePayOSCheckout: vi.fn() };
        const service = new PaymentReconciliationService(repository as never, ordersService as never, undefined, attempts as never, tasks as never);

        await expect(service.handleVerifiedPayOSWebhook(validInput)).resolves.toMatchObject({ kind: "mismatch", httpStatus: 200 });

        expect(repository.markPaymentAttemptReviewRequired).toHaveBeenCalledWith(expect.anything(), "attempt-1");
        expect(tasks.enqueuePayOSWebhookRecovery).toHaveBeenCalledWith(
            expect.anything(), "attempt-1", 7,
            expect.objectContaining({ operation: "CANCEL", verifyOnly: true, expiresAt: expect.any(String) }),
            expect.any(Date),
        );
        const recoveryPayload = tasks.enqueuePayOSWebhookRecovery.mock.calls[0][3];
        expect(Date.parse(recoveryPayload.expiresAt)).toBeGreaterThan(Date.parse("2026-10-01T00:00:00.000Z"));
        expect(ordersService.finalizePayOSCheckout).not.toHaveBeenCalled();
    });

    it.each([
        ["underpayment", { amount: 249999 }, { reportedAmountVnd: 249999 }],
        ["currency conflict", { currency: "USD" }, { currency: "USD" }],
        ["link identity conflict", { paymentLinkId: "other-link" }, { providerLinkId: "other-link" }],
    ])("retains signed %s evidence for review without finalizing", async (_name, dataChanges, observationChanges) => {
        const repository = buildRepository() as ReturnType<typeof buildRepository> & { findPaymentAttemptByProviderOrderCode: Query };
        repository.findPaymentAttemptByProviderOrderCode = vi.fn().mockResolvedValue({
            id: "attempt-1", providerOrderCode: "123456", providerLinkId: "link-123", expectedAmountVnd: 250000,
        });
        const ordersService = { finalizePayOSCheckout: vi.fn() };
        const attempts = { recordObservation: vi.fn().mockResolvedValue({
            id: "attempt-1", paymentState: "MISMATCH", orderState: "REVIEW_REQUIRED", resolutionState: "OPEN", inserted: true, conflicting: true,
        }) };
        const service = new PaymentReconciliationService(repository as never, ordersService as never, undefined, attempts as never);

        await expect(service.handleVerifiedPayOSWebhook({ data: { ...validInput.data, ...dataChanges } })).resolves.toMatchObject({ kind: "mismatch", httpStatus: 200 });
        expect(attempts.recordObservation).toHaveBeenCalledWith(expect.objectContaining(observationChanges));
        expect(ordersService.finalizePayOSCheckout).not.toHaveBeenCalled();
    });

    it("binds an early callback to the attempt by its persisted order code when link ID was not saved yet", async () => {
        const repository = buildRepository() as ReturnType<typeof buildRepository> & { findPaymentAttemptByProviderOrderCode: Query };
        repository.findPaymentAttemptByProviderOrderCode = vi.fn().mockResolvedValue({
            id: "attempt-1", providerOrderCode: "123456", providerLinkId: null, expectedAmountVnd: 250000,
        });
        const ordersService = { finalizePayOSCheckout: vi.fn().mockResolvedValue({ id: 42 }) };
        const attempts = { recordObservation: vi.fn().mockResolvedValue({
            id: "attempt-1", paymentState: "PAID", orderState: "NOT_CREATED", resolutionState: "NONE", verifiedReceivedAmountVnd: 250000, orderId: null, inserted: true, conflicting: false,
        }) };
        const service = new PaymentReconciliationService(repository as never, ordersService as never, undefined, attempts as never);

        await expect(service.handleVerifiedPayOSWebhook(validInput)).resolves.toMatchObject({ kind: "processed" });
        expect(repository.findPaymentAttemptByProviderOrderCode).toHaveBeenCalledWith(expect.anything(), "123456");
        expect(attempts.recordObservation).toHaveBeenCalledWith(expect.objectContaining({ attemptId: "attempt-1", providerLinkId: "link-123" }));
    });

    it("keeps committed receipt evidence when order finalization fails", async () => {
        const repository = buildRepository() as ReturnType<typeof buildRepository> & { findPaymentAttemptByProviderOrderCode: Query };
        repository.findPaymentAttemptByProviderOrderCode = vi.fn().mockResolvedValue({
            id: "attempt-1", providerOrderCode: "123456", providerLinkId: "link-123", expectedAmountVnd: 250000,
        });
        const ordersService = { finalizePayOSCheckout: vi.fn().mockRejectedValue(new Error("database unavailable")) };
        const attempts = { recordObservation: vi.fn().mockResolvedValue({
            id: "attempt-1", paymentState: "PAID", orderState: "NOT_CREATED", resolutionState: "NONE", verifiedReceivedAmountVnd: 250000, orderId: null, inserted: true, conflicting: false,
        }) };
        const service = new PaymentReconciliationService(repository as never, ordersService as never, undefined, attempts as never);

        await expect(service.handleVerifiedPayOSWebhook(validInput)).resolves.toMatchObject({ kind: "retryable", httpStatus: 500 });
        expect(attempts.recordObservation).toHaveBeenCalledTimes(1);
        expect(repository.completeWebhookEvent).toHaveBeenCalledWith(expect.anything(), 7, "FAILED", "database unavailable", { expectedStatus: "PROCESSING", expectedAttemptCount: 1 });
    });

    it("returns 5xx after an observation-store failure and resumes the failed inbox event", async () => {
        const repository = buildRepository() as ReturnType<typeof buildRepository> & { findPaymentAttemptByProviderOrderCode: Query };
        repository.claimWebhookEvent
            .mockResolvedValueOnce({ inserted: true, status: "RECEIVED", payloadHashMatches: true, eventId: 7, attemptCount: 0 })
            .mockResolvedValueOnce({ inserted: false, status: "FAILED", payloadHashMatches: true, eventId: 7, attemptCount: 1 });
        repository.findPaymentAttemptByProviderOrderCode = vi.fn().mockResolvedValue({
            id: "attempt-1", providerOrderCode: "123456", providerLinkId: "link-123", expectedAmountVnd: 250000,
        });
        const ordersService = { finalizePayOSCheckout: vi.fn().mockResolvedValue({ id: 42 }) };
        const attempts = { recordObservation: vi.fn()
            .mockRejectedValueOnce(new Error("attempt database unavailable"))
            .mockResolvedValueOnce({ id: "attempt-1", paymentState: "PAID", orderState: "NOT_CREATED", resolutionState: "NONE", verifiedReceivedAmountVnd: 250000, orderId: null, inserted: true, conflicting: false }) };
        const service = new PaymentReconciliationService(repository as never, ordersService as never, undefined, attempts as never);

        await expect(service.handleVerifiedPayOSWebhook(validInput)).resolves.toMatchObject({ kind: "retryable", httpStatus: 500 });
        await expect(service.handleVerifiedPayOSWebhook(validInput)).resolves.toMatchObject({ kind: "processed", httpStatus: 200, orderId: 42 });
        expect(attempts.recordObservation).toHaveBeenCalledTimes(2);
        expect(ordersService.finalizePayOSCheckout).toHaveBeenCalledTimes(1);
        expect(repository.completeWebhookEvent).toHaveBeenCalledWith(expect.anything(), 7, "PROCESSING", null, { expectedStatus: "FAILED", expectedAttemptCount: 1 });
    });

    it("retries finalization for a stale same-payload PROCESSING event", async () => {
        const repository = buildRepository();
        repository.claimWebhookEvent.mockResolvedValue({
            inserted: false,
            status: "PROCESSING",
            payloadHashMatches: true,
            eventId: 7,
            attemptCount: 4,
            reclaimed: true,
        });
        const ordersService = { finalizePayOSCheckout: vi.fn().mockResolvedValue({ id: 42 }) };
        const service = new PaymentReconciliationService(repository as never, ordersService as never);

        await expect(service.handleVerifiedPayOSWebhook(validInput)).resolves.toMatchObject({ kind: "processed", orderId: 42 });
        expect(ordersService.finalizePayOSCheckout).toHaveBeenCalledTimes(1);
        expect(repository.completeWebhookEvent).toHaveBeenCalledWith(expect.anything(), 7, "PROCESSED", null, { expectedStatus: "PROCESSING", expectedAttemptCount: 4 });
    });

    it("uses verified PayOS data and ignores unsigned envelope fields", async () => {
        const repository = buildRepository();
        const ordersService = { finalizePayOSCheckout: vi.fn().mockResolvedValue({ id: 42 }) };
        const service = new PaymentReconciliationService(repository as never, ordersService as never);
        const webhookWithUntrustedEnvelope = {
            ...validInput,
            envelope: { code: "99", success: false },
        };

        await expect(service.handleVerifiedPayOSWebhook(webhookWithUntrustedEnvelope)).resolves.toMatchObject({
            kind: "processed",
            httpStatus: 200,
            orderId: 42,
        });
        expect(ordersService.finalizePayOSCheckout).toHaveBeenCalledTimes(1);
    });

    it("does not let a stale worker overwrite a same-key payload mismatch", async () => {
        const repository = buildRepository();
        repository.claimWebhookEvent
            .mockResolvedValueOnce({ inserted: true, status: "RECEIVED", payloadHashMatches: true, eventId: 7, attemptCount: 0 })
            .mockResolvedValueOnce({ inserted: false, status: "PROCESSING", payloadHashMatches: false, conflict: true, eventId: 7, attemptCount: 1 });
        repository.completeWebhookEvent
            .mockResolvedValueOnce(true)
            .mockResolvedValueOnce(true)
            .mockResolvedValueOnce(false);
        let releaseFinalization!: () => void;
        let resolveFinalizationStarted!: () => void;
        const finalizationStarted = new Promise<void>((resolve) => { resolveFinalizationStarted = resolve; });
        const ordersService = {
            finalizePayOSCheckout: vi.fn().mockImplementation(() => new Promise((resolveOrder) => {
                resolveFinalizationStarted();
                releaseFinalization = () => resolveOrder({ id: 42 });
            })),
        };
        const service = new PaymentReconciliationService(repository as never, ordersService as never);
        const first = service.handleVerifiedPayOSWebhook(validInput);
        await finalizationStarted;
        const conflict = await service.handleVerifiedPayOSWebhook({
            ...validInput,
            data: { ...validInput.data, amount: 260000 },
        });
        expect(conflict).toMatchObject({ kind: "mismatch", httpStatus: 200 });
        releaseFinalization();
        await expect(first).resolves.toMatchObject({ kind: "retryable", httpStatus: 500 });
        expect(repository.completeWebhookEvent).toHaveBeenCalledWith(expect.anything(), 7, "PROCESSED", null, { expectedStatus: "PROCESSING", expectedAttemptCount: 1 });
    });

    it("builds a deterministic event key from the provider reference or canonical fields", () => {
        const repository = buildRepository();
        const service = new PaymentReconciliationService(repository as never, { finalizePayOSCheckout: vi.fn() } as never);

        expect(service.buildPayOSEventKey(validInput.data)).toBe("payos:reference-123");
        expect(service.buildPayOSEventKey({ ...validInput.data, reference: undefined })).toMatch(/^payos:sha256:[a-f0-9]{64}$/);
    });
});
describe("PaymentReconciliationService error classification", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        withTransaction.mockImplementation(async (work: (tx: unknown) => Promise<unknown>) => work({ query: vi.fn() }));
    });

    it("does not acknowledge unrelated 409 domain conflicts as a provider mismatch", async () => {
        const repository = buildRepository();
        const ordersService = {
            finalizePayOSCheckout: vi.fn().mockRejectedValue(Object.assign(new Error("Checkout reservation is no longer payable."), { statusCode: 409 })),
        };
        const service = new PaymentReconciliationService(repository as never, ordersService as never);

        await expect(service.handleVerifiedPayOSWebhook(validInput)).resolves.toMatchObject({
            kind: "retryable",
            httpStatus: 500,
        });
        expect(repository.completeWebhookEvent).toHaveBeenCalledWith(expect.anything(), 7, "FAILED", "Checkout reservation is no longer payable.", { expectedStatus: "PROCESSING", expectedAttemptCount: 1 });
    });
});
