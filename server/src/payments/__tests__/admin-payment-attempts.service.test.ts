import { beforeEach, describe, expect, it, vi } from "vitest";

const { withTransaction } = vi.hoisted(() => ({ withTransaction: vi.fn() }));
vi.mock("../../database/transaction", () => ({ withTransaction }));

import { AdminPaymentAttemptsService } from "../admin-payment-attempts.service";

describe("AdminPaymentAttemptsService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        withTransaction.mockImplementation(async (work: (tx: unknown) => Promise<unknown>) => work({}));
    });

    it("bounds queue pagination to 25 by default and 100 maximum", async () => {
        const repository = { listExceptions: vi.fn().mockResolvedValue({ items: [], total: 0 }) };
        const service = new AdminPaymentAttemptsService(repository as never, {} as never, {} as never, {} as never);

        await service.listExceptions({});
        expect(repository.listExceptions).toHaveBeenLastCalledWith(expect.anything(), { page: 1, limit: 25 });

        await service.listExceptions({ page: 3, limit: 500 });
        expect(repository.listExceptions).toHaveBeenLastCalledWith(expect.anything(), { page: 3, limit: 100 });
    });

    it("does not retry fulfillment when the attempt has cancellation intent", async () => {
        const repository = {
            lockAttemptForResolution: vi.fn().mockResolvedValue({
                id: "attempt-1", provider: "payos", paymentState: "PAID", orderState: "REVIEW_REQUIRED", orderId: null,
                cancelRequestedAt: new Date(), providerOrderCode: "123", providerLinkId: "link-1", verifiedReceivedAmountVnd: 100,
                pendingCheckoutId: 7, expectedAmountVnd: 100,
            }),
            recordAdminRetry: vi.fn(),
        };
        const orders = { finalizePayOSCheckout: vi.fn() };
        const service = new AdminPaymentAttemptsService(repository as never, {} as never, {} as never, orders as never);

        await expect(service.retryFulfillment("attempt-1", "admin-1", "operator retry"))
            .rejects.toMatchObject({ status: 409, response: { statusCode: 409 } });
        expect(orders.finalizePayOSCheckout).not.toHaveBeenCalled();
        expect(repository.recordAdminRetry).not.toHaveBeenCalled();
    });

    it("audits and invokes the guarded order finalizer for an eligible paid attempt", async () => {
        const attempt = {
            id: "attempt-1", provider: "payos", paymentState: "PAID", orderState: "REVIEW_REQUIRED", resolutionState: "OPEN", orderId: null,
            cancelRequestedAt: null, providerOrderCode: "123", providerLinkId: "link-1", verifiedReceivedAmountVnd: 100,
            pendingCheckoutId: 7, expectedAmountVnd: 100,
        };
        const repository = {
            lockAttemptForResolution: vi.fn().mockResolvedValue(attempt),
            lockRefundSummary: vi.fn().mockResolvedValue({ orderId: null, refundedAmountVnd: 0 }),
            recordAdminRetry: vi.fn(),
        };
        const orders = { finalizePayOSCheckout: vi.fn().mockResolvedValue({ orderId: 99, created: true }) };
        const service = new AdminPaymentAttemptsService(repository as never, {} as never, {} as never, orders as never);

        await expect(service.retryFulfillment("attempt-1", "admin-1", "  retry after review  ")).resolves.toEqual({ orderId: 99, created: true });
        expect(repository.recordAdminRetry).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ pendingCheckoutId: 7 }), "admin-1", "retry after review");
        expect(orders.finalizePayOSCheckout).toHaveBeenCalledWith(123, "link-1", 100, "attempt-1");
    });

    it("requires admin-owned evidence before recording a refund", async () => {
        const evidence = { readForAdmin: vi.fn().mockRejectedValue(Object.assign(new Error("forbidden"), { statusCode: 403 })) };
        const attempts = { recordRefund: vi.fn() };
        const service = new AdminPaymentAttemptsService({} as never, attempts as never, evidence as never, {} as never);

        await expect(service.recordRefund("attempt-1", "admin-1", {
            amountVnd: 50, transferReference: "bank-1", idempotencyKey: "00000000-0000-4000-8000-000000000001",
            transferredAt: new Date("2026-10-15T00:00:00Z"), evidenceId: 4, reason: "manual bank transfer",
        })).rejects.toMatchObject({ statusCode: 403 });
        expect(attempts.recordRefund).not.toHaveBeenCalled();
    });

    it("leaves a partially refunded paid exception open", async () => {
        const evidence = { readForAdmin: vi.fn().mockResolvedValue({ id: 4 }) };
        const attempts = { recordRefund: vi.fn().mockResolvedValue({ operationId: "refund-1", amountVnd: 50, replayed: false }) };
        const repository = {
            getRefundByIdempotency: vi.fn().mockResolvedValue(null),
            lockRefundSummary: vi.fn()
                .mockResolvedValueOnce({ provider: "payos", paymentState: "PAID", orderId: null, receivedAmountVnd: 100, refundedAmountVnd: 0 })
                .mockResolvedValueOnce({ provider: "payos", paymentState: "PAID", orderId: null, receivedAmountVnd: 100, refundedAmountVnd: 50 }),
            setResolutionState: vi.fn(),
        };
        const service = new AdminPaymentAttemptsService(repository as never, attempts as never, evidence as never, {} as never);

        await expect(service.recordRefund("attempt-1", "admin-1", {
            amountVnd: 50, transferReference: "bank-1", idempotencyKey: "00000000-0000-4000-8000-000000000001",
            transferredAt: new Date("2026-10-15T00:00:00Z"), evidenceId: 4, reason: "manual bank transfer",
        })).resolves.toMatchObject({ resolutionState: "OPEN", replayed: false });
        expect(repository.setResolutionState).toHaveBeenCalledWith(expect.anything(), "attempt-1", "OPEN");
    });

    it("keeps a concurrent replay of a partial refund open without counting its amount twice", async () => {
        const evidence = { readForAdmin: vi.fn().mockResolvedValue({ id: 4 }) };
        const attempts = { recordRefund: vi.fn().mockResolvedValue({ operationId: "refund-1", amountVnd: 50, replayed: true }) };
        const repository = {
            getRefundByIdempotency: vi.fn().mockResolvedValue(null),
            lockRefundSummary: vi.fn()
                .mockResolvedValueOnce({ provider: "payos", paymentState: "PAID", orderId: null, receivedAmountVnd: 100, refundedAmountVnd: 0 })
                .mockResolvedValueOnce({ provider: "payos", paymentState: "PAID", orderId: null, receivedAmountVnd: 100, refundedAmountVnd: 50 }),
            setResolutionState: vi.fn(),
        };
        const service = new AdminPaymentAttemptsService(repository as never, attempts as never, evidence as never, {} as never);

        await expect(service.recordRefund("attempt-1", "admin-1", {
            amountVnd: 50, transferReference: "bank-1", idempotencyKey: "00000000-0000-4000-8000-000000000001",
            transferredAt: new Date("2026-10-15T00:00:00Z"), evidenceId: 4, reason: "manual bank transfer",
        })).resolves.toMatchObject({ operationId: "refund-1", amountVnd: 50, replayed: true, resolutionState: "OPEN" });
        expect(repository.lockRefundSummary).toHaveBeenCalledTimes(2);
        expect(repository.setResolutionState).toHaveBeenCalledWith(expect.anything(), "attempt-1", "OPEN");
    });

    it("closes the exception only when recorded refunds reach verified receipt funds", async () => {
        const evidence = { readForAdmin: vi.fn().mockResolvedValue({ id: 4 }) };
        const attempts = { recordRefund: vi.fn().mockResolvedValue({ operationId: "refund-2", amountVnd: 50, replayed: false }) };
        const repository = {
            getRefundByIdempotency: vi.fn().mockResolvedValue(null),
            lockRefundSummary: vi.fn()
                .mockResolvedValueOnce({ provider: "payos", paymentState: "PAID", orderId: null, receivedAmountVnd: 100, refundedAmountVnd: 50 })
                .mockResolvedValueOnce({ provider: "payos", paymentState: "PAID", orderId: null, receivedAmountVnd: 100, refundedAmountVnd: 100 }),
            setResolutionState: vi.fn(),
        };
        const service = new AdminPaymentAttemptsService(repository as never, attempts as never, evidence as never, {} as never);

        await expect(service.recordRefund("attempt-1", "admin-1", {
            amountVnd: 50, transferReference: "bank-2", idempotencyKey: "00000000-0000-4000-8000-000000000002",
            transferredAt: new Date("2026-10-15T00:00:00Z"), evidenceId: 4, reason: "remaining balance",
        })).resolves.toMatchObject({ resolutionState: "RESOLVED", replayed: false });
        expect(repository.setResolutionState).toHaveBeenCalledWith(expect.anything(), "attempt-1", "RESOLVED");
    });

    it("rejects an idempotency replay when its evidence or reason changed", async () => {
        const evidence = { readForAdmin: vi.fn().mockResolvedValue({ id: 4 }) };
        const attempts = { recordRefund: vi.fn() };
        const repository = {
            getRefundByIdempotency: vi.fn().mockResolvedValue({
                operationId: "refund-1", attemptId: "attempt-1", amountVnd: 50, transferReference: "bank-1",
                transferredAt: "2026-10-15", evidenceId: 4, actorId: "admin-1", reason: "original reason",
            }),
        };
        const service = new AdminPaymentAttemptsService(repository as never, attempts as never, evidence as never, {} as never);

        await expect(service.recordRefund("attempt-1", "admin-1", {
            amountVnd: 50, transferReference: "bank-1", idempotencyKey: "00000000-0000-4000-8000-000000000001",
            transferredAt: new Date("2026-10-15T00:00:00Z"), evidenceId: 4, reason: "changed reason",
        })).rejects.toMatchObject({ status: 409, response: { statusCode: 409 } });
        expect(attempts.recordRefund).not.toHaveBeenCalled();
    });
});
