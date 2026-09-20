import { beforeEach, describe, expect, it, vi } from "vitest";
import http from "../../lib/http";
import { createGuestAfterSalesRequest, fetchGuestAfterSalesRequests, fetchCustomerAfterSalesRequests, transitionAdminAfterSalesRequest } from "./api";

vi.mock("../../lib/http", () => ({ default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }));

describe("after-sales api", () => {
    beforeEach(() => vi.clearAllMocks());

    it("caps customer pagination at the server limit", async () => {
        vi.mocked(http.get).mockResolvedValue({ data: { requests: [], pagination: { page: 1, limit: 100, total: 0, totalPages: 0 } } } as never);
        await fetchCustomerAfterSalesRequests({ page: 2, limit: 500 });
        expect(http.get).toHaveBeenCalledWith("/api/after-sales/requests", { params: { page: 2, limit: 100 } });
    });

    it("keeps guest capability tokens in POST bodies", async () => {
        vi.mocked(http.post).mockResolvedValue({ data: { requests: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } } } as never);
        await fetchGuestAfterSalesRequests(42, "secret", { page: 1 });
        expect(http.post).toHaveBeenCalledWith("/api/orders/guest/after-sales/requests/lookup", { orderId: 42, guestOrderToken: "secret", page: 1, limit: 50 });
    });

    it("posts guest creation and admin transitions to their dedicated routes", async () => {
        vi.mocked(http.post).mockResolvedValue({ data: { request: { id: 7 } } } as never);
        vi.mocked(http.patch).mockResolvedValue({ data: { request: { id: 7, status: "APPROVED" } } } as never);
        await createGuestAfterSalesRequest({ orderId: 42, guestOrderToken: "secret", kind: "RETURN", reason: "damaged", items: [{ orderItemId: 9, quantity: 1 }], idempotencyKey: "req-7" });
        await transitionAdminAfterSalesRequest(7, "APPROVED");
        expect(http.post).toHaveBeenCalledWith("/api/orders/guest/after-sales/requests", expect.objectContaining({ guestOrderToken: "secret" }));
        expect(http.patch).toHaveBeenCalledWith("/api/admin/after-sales/requests/7/status", { status: "APPROVED" });
    });
});
