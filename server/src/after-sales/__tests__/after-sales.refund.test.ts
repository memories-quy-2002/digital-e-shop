import { describe, expect, it, vi } from "vitest";
import { AfterSalesService } from "../after-sales.service";
import type { AfterSalesRepositoryPort } from "../after-sales.repository";

const request = {
    id: 15,
    orderId: 42,
    userId: "customer-1",
    kind: "RETURN" as const,
    status: "REFUND_PENDING" as const,
    reason: "damaged",
    adminNote: null,
    refundAmount: null,
    refundCurrency: null,
    refundReference: null,
    createdAt: "2026-09-20T00:00:00.000Z",
    updatedAt: "2026-09-20T00:00:00.000Z",
    approvedAt: "2026-09-19T00:00:00.000Z",
    receivedAt: "2026-09-20T00:00:00.000Z",
    refundedAt: null,
    closedAt: null,
};

function repository(context = { request, requestedAmount: 120000, payment: { id: 4, orderId: 42, provider: "payos", status: "paid", providerPaymentId: "payment-4", providerReference: "order-42", amount: 120000, refundedAmount: 0, currency: "VND" } }) {
    return {
        withTransaction: vi.fn(async (work: (tx: never) => Promise<unknown>) => work({} as never)),
        getRefundContextForUpdate: vi.fn().mockResolvedValue(context),
        confirmRefund: vi.fn().mockResolvedValue({ ...request, status: "REFUNDED", refundAmount: 120000, refundCurrency: "VND", refundReference: "manual-15" }),
        getAdminRequest: vi.fn().mockResolvedValue({ ...request, status: "REFUNDED", refundAmount: 120000, refundCurrency: "VND", refundReference: "manual-15", items: [], events: [] }),
    } as unknown as AfterSalesRepositoryPort;
}

describe("AfterSalesService refunds", () => {
    it("derives the amount from the locked request/payment context and records the provider result", async () => {
        const repo = repository();
        const provider = { refundPayment: vi.fn().mockResolvedValue({ status: "refunded", providerReference: "payment-4", refundReference: "provider-ref-15", simulated: true }) };
        const service = new AfterSalesService(repo, provider as never);

        await expect(service.confirmRefund(15, "admin-1", { refundReference: "manual-15", currency: "VND", idempotencyKey: "refund-15" })).resolves.toMatchObject({ status: "REFUNDED" });
        expect(provider.refundPayment).toHaveBeenCalledWith({ provider: "payos", orderId: 42, paymentId: "payment-4", amount: 120000, currency: "VND", idempotencyKey: "refund-15" });
        expect(repo.confirmRefund).toHaveBeenCalledWith(expect.anything(), 15, expect.objectContaining({ refundReference: "manual-15" }), "admin-1", 4, 120000, expect.objectContaining({ refundReference: "provider-ref-15" }));
    });

    it("fails closed when the payment ledger is missing", async () => {
        const repo = repository({ request, requestedAmount: 120000, payment: null });
        const provider = { refundPayment: vi.fn() };
        const service = new AfterSalesService(repo, provider as never);

        await expect(service.confirmRefund(15, "admin-1", { refundReference: "manual-15", currency: "VND", idempotencyKey: "refund-15" })).rejects.toMatchObject({ statusCode: 409, code: "PAYMENT_LEDGER_NOT_FOUND" });
        expect(provider.refundPayment).not.toHaveBeenCalled();
    });

    it("does not mark the ledger when the configured provider rejects the refund", async () => {
        const repo = repository();
        const provider = { refundPayment: vi.fn().mockRejectedValue(new Error("payos refunds are not configured")) };
        const service = new AfterSalesService(repo, provider as never);

        await expect(service.confirmRefund(15, "admin-1", { refundReference: "manual-15", currency: "VND", idempotencyKey: "refund-15" })).rejects.toMatchObject({ statusCode: 503, code: "REFUND_PROVIDER_UNAVAILABLE" });
        expect(repo.confirmRefund).not.toHaveBeenCalled();
    });

    it("replays a previously confirmed refund only for the same reference", async () => {
        const repo = repository({
            request: { ...request, status: "REFUNDED", refundReference: "manual-15" },
            requestedAmount: 120000,
            payment: { id: 4, orderId: 42, provider: "payos", status: "refunded", providerPaymentId: "payment-4", providerReference: "order-42", amount: 120000, refundedAmount: 120000, currency: "VND" },
        });
        const provider = { refundPayment: vi.fn() };
        const service = new AfterSalesService(repo, provider as never);

        await expect(service.confirmRefund(15, "admin-1", { refundReference: "manual-15", currency: "VND", idempotencyKey: "refund-15" })).resolves.toMatchObject({ status: "REFUNDED" });
        expect(provider.refundPayment).not.toHaveBeenCalled();
    });
});
