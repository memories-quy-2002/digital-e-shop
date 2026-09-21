import { beforeEach, describe, expect, it, vi } from "vitest";

const http = vi.hoisted(() => ({
    get: vi.fn(),
    put: vi.fn(),
}));

vi.mock("../../lib/http", () => ({ default: http }));

import {
    fetchProductAlert,
    fetchProductAlerts,
    updateProductAlert,
} from "./api";

describe("product alerts API", () => {
    beforeEach(() => vi.clearAllMocks());

    it("fetches a user's alert preferences through the shared HTTP client", async () => {
        http.get.mockResolvedValue({ data: { alerts: [{ productId: 7, priceDropEnabled: true, backInStockEnabled: false }] } });

        await expect(fetchProductAlerts("user-1")).resolves.toEqual([
            { productId: 7, priceDropEnabled: true, backInStockEnabled: false },
        ]);
        expect(http.get).toHaveBeenCalledWith("/api/users/user-1/product-alerts");
    });

    it("fetches one preference and falls back to disabled state when missing", async () => {
        http.get.mockResolvedValue({ data: {} });

        await expect(fetchProductAlert("user-1", 7)).resolves.toEqual({
            productId: 7,
            priceDropEnabled: false,
            backInStockEnabled: false,
        });
        expect(http.get).toHaveBeenCalledWith("/api/users/user-1/product-alerts/7");
    });

    it("updates only the alert flags in the request body", async () => {
        http.put.mockResolvedValue({ data: { alert: { productId: 7, priceDropEnabled: true, backInStockEnabled: true } } });

        await expect(updateProductAlert("user-1", 7, {
            priceDropEnabled: true,
            backInStockEnabled: true,
        })).resolves.toEqual({ productId: 7, priceDropEnabled: true, backInStockEnabled: true });
        expect(http.put).toHaveBeenCalledWith("/api/users/user-1/product-alerts/7", {
            priceDropEnabled: true,
            backInStockEnabled: true,
        });
    });
});
