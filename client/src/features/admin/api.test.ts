import { beforeEach, describe, expect, it, vi } from "vitest";
import http from "../../lib/http";
import {
    confirmAdminCodPayment,
    fetchPaymentReconciliationCandidates,
    fetchPaymentWebhookEvents,
    reconcileAdminPayment,
    runPaymentReconciliation,
} from "./api";

vi.mock("../../lib/http", () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
    },
}));

describe("admin payment API", () => {
    beforeEach(() => vi.clearAllMocks());

    it("normalizes candidate data and sends filters through Axios params", async () => {
        vi.mocked(http.get).mockResolvedValueOnce({
            data: {
                candidates: [{
                    target_type: "order_payment",
                    target_id: "77",
                    provider: "payos",
                    local_status: "pending",
                    reconciliation_status: "MISMATCH",
                    provider_reference: "payos-link",
                    provider_order_code: "123456",
                    payment_amount: "250000",
                    payment_currency: "VND",
                }],
                pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
            },
        } as never);

        await expect(fetchPaymentReconciliationCandidates({ page: 1, limit: 50, provider: "payos", reconciliationStatus: "MISMATCH" })).resolves.toMatchObject({
            candidates: [{ targetType: "order_payment", targetId: 77, expectedAmount: 250000, providerOrderCode: 123456 }],
            pagination: { total: 1 },
        });
        expect(http.get).toHaveBeenCalledWith("/api/admin/payments/reconciliation", {
            params: { page: 1, limit: 50, provider: "payos", reconciliationStatus: "MISMATCH" },
        });
    });

    it("keeps reconciliation, run, and COD confirmation routes explicit", async () => {
        vi.mocked(http.post)
            .mockResolvedValueOnce({ data: { results: [{ targetType: "order_payment", targetId: 77, outcome: "MATCHED" }], limit: 100 } } as never)
            .mockResolvedValueOnce({ data: { result: { targetType: "order_payment", targetId: 77, paymentId: 77, outcome: "MISMATCH" } } } as never)
            .mockResolvedValueOnce({ data: { payment: { id: 77, status: "paid" } } } as never);

        await expect(runPaymentReconciliation(100)).resolves.toMatchObject({ limit: 100, results: [{ outcome: "MATCHED" }] });
        await expect(reconcileAdminPayment(77)).resolves.toMatchObject({ paymentId: 77, outcome: "MISMATCH" });
        await expect(confirmAdminCodPayment(77, "Collected at delivery")).resolves.toMatchObject({ id: 77, status: "paid" });

        expect(http.post).toHaveBeenNthCalledWith(1, "/api/admin/payments/reconciliation/run", { limit: 100 });
        expect(http.post).toHaveBeenNthCalledWith(2, "/api/admin/payments/77/reconcile");
        expect(http.post).toHaveBeenNthCalledWith(3, "/api/admin/payments/77/confirm-cod", { note: "Collected at delivery" });
    });

    it("normalizes webhook history for the payment detail disclosure", async () => {
        vi.mocked(http.get).mockResolvedValueOnce({
            data: {
                events: [{
                    id: "4",
                    provider: "payos",
                    event_key: "payos:ref-4",
                    event_type: "PAYMENT_SUCCESS",
                    payload_hash: "hash",
                    order_code: "123456",
                    payment_link_id: "link",
                    amount: "250000",
                    currency: "VND",
                    status: "PROCESSED",
                    attempt_count: "1",
                    received_at: "2026-09-17T08:00:00.000Z",
                }],
            },
        } as never);

        await expect(fetchPaymentWebhookEvents(77)).resolves.toMatchObject([{
            id: 4,
            eventKey: "payos:ref-4",
            eventType: "PAYMENT_SUCCESS",
            amount: 250000,
            status: "PROCESSED",
            attemptCount: 1,
        }]);
        expect(http.get).toHaveBeenCalledWith("/api/admin/payments/77/webhook-events");
    });
});
