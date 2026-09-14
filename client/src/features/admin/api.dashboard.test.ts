import { beforeEach, describe, expect, it, vi } from "vitest";
import http from "../../lib/http";
import { fetchAnalyticsSummary, fetchAllOrders, fetchOrderItems } from "./api";

vi.mock("../../lib/http", () => ({
    default: {
        get: vi.fn(),
    },
}));

describe("dashboard analytics API", () => {
    beforeEach(() => vi.clearAllMocks());

    it("passes the selected range to the analytics endpoint", async () => {
        vi.mocked(http.get).mockResolvedValue({ data: { summary: {} } } as never);

        await fetchAnalyticsSummary("7d");

        expect(http.get).toHaveBeenCalledWith("/api/analytics/summary", { params: { range: "7d" } });
    });

    it("loads every limited order-item page for complete dashboard fallback aggregation", async () => {
        vi.mocked(http.get)
            .mockResolvedValueOnce({ data: { orderItems: [{ order_id: 1 }], pagination: { page: 1, limit: 100, total: 101, totalPages: 2 } } } as never)
            .mockResolvedValueOnce({ data: { orderItems: [{ order_id: 2 }], pagination: { page: 2, limit: 100, total: 101, totalPages: 2 } } } as never);

        await expect(fetchOrderItems(1, 100)).resolves.toEqual([{ order_id: 1 }, { order_id: 2 }]);
        expect(http.get).toHaveBeenNthCalledWith(1, "/api/orders/item?page=1&limit=100");
        expect(http.get).toHaveBeenNthCalledWith(2, "/api/orders/item?page=2&limit=100");
    });

    it("keeps paginated admin order loading bounded by the server total", async () => {
        vi.mocked(http.get)
            .mockResolvedValueOnce({ data: { orders: [{ id: 1 }], pagination: { page: 1, limit: 100, total: 1, totalPages: 1 } } } as never);

        await expect(fetchAllOrders()).resolves.toEqual([{ id: 1 }]);
        expect(http.get).toHaveBeenCalledWith("/api/orders?page=1&limit=100");
    });
});
