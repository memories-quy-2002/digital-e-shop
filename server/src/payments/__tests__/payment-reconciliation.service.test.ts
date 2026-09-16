import { beforeEach, describe, expect, it, vi } from "vitest";
import { PaymentReconciliationRepository } from "../payment-reconciliation.repository";
import { PaymentReconciliationService } from "../payment-reconciliation.service";

type Query = ReturnType<typeof vi.fn>;
const buildTx = (query: Query) => ({ query });

describe("PaymentReconciliationRepository", () => {
    it("claims a new event and returns a same-payload duplicate without conflicting", async () => {
        const tx = buildTx(vi.fn().mockResolvedValueOnce({ insertId: 7, affectedRows: 1 }).mockResolvedValueOnce([{ id: 7, status: "RECEIVED", payload_hash: "hash-1" }]));
        const repository = new PaymentReconciliationRepository();
        await expect(repository.claimWebhookEvent(tx as never, { provider: "payos", eventKey: "event-1", eventType: "PAYMENT_SUCCESS", payloadHash: "hash-1", normalizedPayload: { orderCode: 123456 }, orderCode: 123456, paymentLinkId: "link-123", amount: 250000, currency: "VND" })).resolves.toEqual({ inserted: true, eventId: 7, status: "RECEIVED", payloadHashMatches: true });

        const duplicate = buildTx(vi.fn().mockResolvedValueOnce({ affectedRows: 0 }).mockResolvedValueOnce([{ id: 7, status: "PROCESSED", payload_hash: "hash-1" }]));
        await expect(repository.claimWebhookEvent(duplicate as never, { provider: "payos", eventKey: "event-1", eventType: "PAYMENT_SUCCESS", payloadHash: "hash-1", normalizedPayload: { orderCode: 123456 } })).resolves.toMatchObject({ inserted: false, eventId: 7, status: "PROCESSED", payloadHashMatches: true });
        expect(duplicate.query.mock.calls[0][0]).toContain("ON DUPLICATE KEY UPDATE");
    });

    it("returns a payload conflict for a reused event key with a different hash", async () => {
        const tx = buildTx(vi.fn().mockResolvedValueOnce({ affectedRows: 0 }).mockResolvedValueOnce([{ id: 7, status: "PROCESSED", payload_hash: "different-hash" }]));
        const repository = new PaymentReconciliationRepository();
        await expect(repository.claimWebhookEvent(tx as never, { provider: "payos", eventKey: "event-1", eventType: "PAYMENT_SUCCESS", payloadHash: "hash-1", normalizedPayload: {} })).resolves.toMatchObject({ inserted: false, conflict: true, payloadHashMatches: false });
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
    envelope: { code: "00", success: true },
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
    }),
    completeWebhookEvent: vi.fn().mockResolvedValue(undefined),
});

describe("PaymentReconciliationService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        withTransaction.mockImplementation(async (work: (tx: unknown) => Promise<unknown>) => work({ query: vi.fn() }));
    });

    it("does not finalize a duplicate processed event", async () => {
        const repository = buildRepository();
        repository.claimWebhookEvent.mockResolvedValue({ inserted: false, status: "PROCESSED", payloadHashMatches: true, eventId: 7 });
        const ordersService = { finalizePayOSCheckout: vi.fn() };
        const service = new PaymentReconciliationService(repository as never, ordersService as never);

        await expect(service.handleVerifiedPayOSWebhook(validInput)).resolves.toMatchObject({ kind: "duplicate", httpStatus: 200 });
        expect(ordersService.finalizePayOSCheckout).not.toHaveBeenCalled();
    });

    it("returns retryable for an event left in processing", async () => {
        const repository = buildRepository();
        repository.claimWebhookEvent.mockResolvedValue({ inserted: false, status: "PROCESSING", payloadHashMatches: true, eventId: 7 });
        const ordersService = { finalizePayOSCheckout: vi.fn() };
        const service = new PaymentReconciliationService(repository as never, ordersService as never);

        await expect(service.handleVerifiedPayOSWebhook(validInput)).resolves.toMatchObject({ kind: "retryable", httpStatus: 500 });
        expect(ordersService.finalizePayOSCheckout).not.toHaveBeenCalled();
    });

    it("records a same-key payload conflict without creating an order", async () => {
        const repository = buildRepository();
        repository.claimWebhookEvent.mockResolvedValue({ inserted: false, status: "PROCESSED", payloadHashMatches: false, conflict: true, eventId: 7 });
        const ordersService = { finalizePayOSCheckout: vi.fn() };
        const service = new PaymentReconciliationService(repository as never, ordersService as never);

        await expect(service.handleVerifiedPayOSWebhook(validInput)).resolves.toMatchObject({ kind: "mismatch", httpStatus: 200 });
        expect(ordersService.finalizePayOSCheckout).not.toHaveBeenCalled();
        expect(repository.completeWebhookEvent).toHaveBeenCalledWith(expect.anything(), 7, "MISMATCH", expect.any(String));
    });

    it("records a mismatched reservation without creating an order", async () => {
        const repository = buildRepository();
        const ordersService = {
            finalizePayOSCheckout: vi.fn().mockRejectedValue(Object.assign(new Error("PayOS payment amount or reference does not match the checkout reservation."), { statusCode: 409 })),
        };
        const service = new PaymentReconciliationService(repository as never, ordersService as never);

        await expect(service.handleVerifiedPayOSWebhook(validInput)).resolves.toMatchObject({ kind: "mismatch", httpStatus: 200 });
        expect(repository.completeWebhookEvent).toHaveBeenCalledWith(expect.anything(), 7, "MISMATCH", expect.any(String));
    });

    it("returns retryable when finalization fails transiently", async () => {
        const repository = buildRepository();
        const ordersService = { finalizePayOSCheckout: vi.fn().mockRejectedValue(new Error("database unavailable")) };
        const service = new PaymentReconciliationService(repository as never, ordersService as never);

        await expect(service.handleVerifiedPayOSWebhook(validInput)).resolves.toMatchObject({ kind: "retryable", httpStatus: 500 });
        expect(repository.completeWebhookEvent).toHaveBeenCalledWith(expect.anything(), 7, "FAILED", "database unavailable");
    });

    it("ignores a successful event when no local reservation is found", async () => {
        const repository = buildRepository();
        const ordersService = { finalizePayOSCheckout: vi.fn().mockResolvedValue(null) };
        const service = new PaymentReconciliationService(repository as never, ordersService as never);

        await expect(service.handleVerifiedPayOSWebhook(validInput)).resolves.toMatchObject({ kind: "ignored", httpStatus: 200 });
        expect(repository.completeWebhookEvent).toHaveBeenCalledWith(expect.anything(), 7, "IGNORED", expect.any(String));
    });

    it("finalizes a verified exact VND event once and marks it processed", async () => {
        const repository = buildRepository();
        const ordersService = { finalizePayOSCheckout: vi.fn().mockResolvedValue({ id: 42, date_added: "2026-09-16T10:00:00.000Z" }) };
        const service = new PaymentReconciliationService(repository as never, ordersService as never);

        await expect(service.handleVerifiedPayOSWebhook(validInput)).resolves.toMatchObject({ kind: "processed", httpStatus: 200, orderId: 42 });
        expect(ordersService.finalizePayOSCheckout).toHaveBeenCalledTimes(1);
        expect(ordersService.finalizePayOSCheckout).toHaveBeenCalledWith(123456, "link-123", 250000);
        expect(repository.completeWebhookEvent).toHaveBeenCalledWith(expect.anything(), 7, "PROCESSED", null);
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
        expect(repository.completeWebhookEvent).toHaveBeenCalledWith(expect.anything(), 7, "FAILED", "Checkout reservation is no longer payable.");
    });
});