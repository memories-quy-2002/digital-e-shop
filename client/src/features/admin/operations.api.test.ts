import { beforeEach, describe, expect, it, vi } from "vitest";
import http from "../../lib/http";
import { fetchEmailOperations, fetchPaymentAttemptException, fetchPaymentAttemptExceptions, recordPaymentAttemptRefund, retryPaymentAttempt, runOperations } from "./operations.api";
import { confirmAdminManualRefund } from "../after-sales/api";

vi.mock("../../lib/http", () => ({ default: { get: vi.fn(), post: vi.fn() } }));

describe("admin operations API", () => {
    beforeEach(() => vi.clearAllMocks());

    it("caps email list bounds and preserves the cursor", async () => {
        vi.mocked(http.get).mockResolvedValue({ data: { messages: [], nextAfterId: null } } as never);
        await fetchEmailOperations({ limit: 500, afterId: 42 });
        expect(http.get).toHaveBeenCalledWith("/api/admin/email", { params: { limit: 100, afterId: 42 } });
    });

    it("caps runner batch size and posts only the bounded limit", async () => {
        vi.mocked(http.post).mockResolvedValue({ data: {} } as never);
        await runOperations(1000);
        expect(http.post).toHaveBeenCalledWith("/api/admin/operations/run", { limit: 100 });
    });

    it("records a manual refund without accepting any client amount", async () => {
        vi.mocked(http.post).mockResolvedValue({ data: { request: { id: 7 } } } as never);
        await confirmAdminManualRefund(7, { idempotencyKey: "manual-refund-7-a", transferReference: "bank-1", transferDate: "2026-10-14", reviewedReason: "Reviewed order", evidenceId: 3, currency: "VND" });
        expect(http.post).toHaveBeenCalledWith("/api/admin/after-sales/requests/7/manual-refund", {
            idempotencyKey: "manual-refund-7-a", transferReference: "bank-1", transferDate: "2026-10-14", reviewedReason: "Reviewed order", evidenceId: 3, currency: "VND",
        });
    });

    it("bounds the payment exception page and unwraps the sanitized detail", async () => {
        vi.mocked(http.get).mockResolvedValueOnce({ data: { items: [], pagination: {}, msg: "ok", requestId: "r" } } as never);
        await fetchPaymentAttemptExceptions(0, 500);
        expect(http.get).toHaveBeenCalledWith("/api/admin/payments/attempt-exceptions", { params: { page: 1, limit: 100 } });
        vi.mocked(http.get).mockResolvedValueOnce({ data: { attempt: { attemptId: "id" } } } as never);
        await fetchPaymentAttemptException("id/unsafe");
        expect(http.get).toHaveBeenLastCalledWith("/api/admin/payments/attempt-exceptions/id%2Funsafe");
    });

    it("posts only the approved retry and refund request shapes", async () => {
        vi.mocked(http.post).mockResolvedValue({ data: { result: { orderId: 4 }, refund: { operationId: "r-1" } } } as never);
        await retryPaymentAttempt("attempt-id", "verified");
        expect(http.post).toHaveBeenNthCalledWith(1, "/api/admin/payments/attempt-exceptions/attempt-id/retry", { reason: "verified" });
        const input = { amountVnd: 1000, transferReference: "bank", idempotencyKey: "uuid", transferredAt: "2026-10-15", evidenceId: 2, reason: "verified transfer" };
        await recordPaymentAttemptRefund("attempt-id", input);
        expect(http.post).toHaveBeenNthCalledWith(2, "/api/admin/payments/attempt-exceptions/attempt-id/refunds", input);
    });
});
