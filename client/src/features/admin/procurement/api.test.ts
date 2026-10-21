import { beforeEach, describe, expect, it, vi } from "vitest";
import http from "../../../lib/http";
import { archiveSupplier, fetchPurchaseReceipts, fetchStockCounts, postPurchaseReceipt } from "./api";

vi.mock("../../../lib/http", () => ({ default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }));

describe("procurement API wrappers", () => {
    beforeEach(() => vi.clearAllMocks());

    it("keeps list response keys and pagination while requesting filtered pages", async () => {
        vi.mocked(http.get).mockResolvedValueOnce({ data: { counts: [{ id: 8 }], pagination: { page: 2, limit: 10, total: 12, totalPages: 2 } } } as never);
        await expect(fetchStockCounts({ page: 2, limit: 10, status: "SUBMITTED" })).resolves.toEqual({
            items: [{ id: 8 }], pagination: { page: 2, limit: 10, total: 12, totalPages: 2 },
        });
        expect(http.get).toHaveBeenCalledWith("/api/admin/stock-counts", { params: { page: 2, limit: 10, status: "SUBMITTED" } });
    });

    it("uses the receipt route and forwards the idempotency key unchanged", async () => {
        const receipt = { id: 4, idempotencyKey: "stable-key" };
        vi.mocked(http.post).mockResolvedValueOnce({ data: { msg: "ok", receipt } } as never);
        await expect(postPurchaseReceipt(7, { idempotencyKey: "stable-key", lines: [] })).resolves.toEqual(receipt);
        expect(http.post).toHaveBeenCalledWith("/api/admin/purchase-orders/7/receipts", { idempotencyKey: "stable-key", lines: [] });
    });

    it("sends supplier archive with its concurrency version and audit reason", async () => {
        vi.mocked(http.post).mockResolvedValueOnce({ data: { supplier: { id: 3, active: false } } } as never);
        await archiveSupplier(3, { version: 5, reason: "No longer supplying" });
        expect(http.post).toHaveBeenCalledWith("/api/admin/suppliers/3/archive", { version: 5, reason: "No longer supplying" });
    });

    it("preserves receipt list pagination contract", async () => {
        vi.mocked(http.get).mockResolvedValueOnce({ data: { receipts: [], pagination: { page: 1, limit: 25, total: 0, totalPages: 0 } } } as never);
        await expect(fetchPurchaseReceipts(9)).resolves.toMatchObject({ items: [], pagination: { page: 1, limit: 25 } });
        expect(http.get).toHaveBeenCalledWith("/api/admin/purchase-orders/9/receipts", { params: { page: 1, limit: 25 } });
    });
});
