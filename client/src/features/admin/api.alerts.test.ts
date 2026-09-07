import { beforeEach, describe, expect, it, vi } from "vitest";
import http from "../../lib/http";
import { fetchAdminAlerts } from "./api";

vi.mock("../../lib/http", () => ({
    default: {
        get: vi.fn(),
    },
}));

describe("admin alerts API", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("loads database-backed alerts from the admin endpoint", async () => {
        vi.mocked(http.get).mockResolvedValue({
            data: { alerts: [{ id: "order-42", type: "order" }], unread: 1 },
        } as never);

        await expect(fetchAdminAlerts()).resolves.toMatchObject({
            alerts: [{ id: "order-42", type: "order" }],
            unread: 1,
        });
        expect(http.get).toHaveBeenCalledWith("/api/admin/alerts");
    });
});
