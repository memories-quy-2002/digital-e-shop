import { beforeEach, describe, expect, it, vi } from "vitest";
import http from "../../lib/http";
import { cancelCustomerOrder } from "./api";

vi.mock("../../lib/http", () => ({
    default: {
        post: vi.fn(),
    },
}));

describe("orders API", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(http.post).mockResolvedValue({ data: { order: { id: 42, status: 2 } } } as never);
    });

    it("cancels a customer order with an optional reason", async () => {
        await expect(cancelCustomerOrder(42, "Changed my mind")).resolves.toMatchObject({ id: 42, status: 2 });

        expect(http.post).toHaveBeenCalledWith("/api/orders/42/cancel", { reason: "Changed my mind" });
    });

    it("sends an empty payload when no cancellation reason is provided", async () => {
        await cancelCustomerOrder(42);

        expect(http.post).toHaveBeenCalledWith("/api/orders/42/cancel", {});
    });
});
