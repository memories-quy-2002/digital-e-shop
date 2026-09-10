import { beforeEach, describe, expect, it, vi } from "vitest";
import http from "../../lib/http";
import { markAllCustomerNotificationsRead, markCustomerNotificationRead } from "./api";

vi.mock("../../lib/http", () => ({
    default: {
        post: vi.fn(),
    },
}));

describe("customer users API", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(http.post).mockResolvedValue({ data: { result: { updated: 3 } } } as never);
    });

    it("marks all notifications as read and returns the updated count", async () => {
        await expect(markAllCustomerNotificationsRead("demo-user")).resolves.toEqual({ updated: 3 });

        expect(http.post).toHaveBeenCalledWith("/api/users/demo-user/notifications/read-all");
    });

    it("marks one notification as read and returns the updated count", async () => {
        vi.mocked(http.post).mockResolvedValueOnce({ data: { result: { updated: 1 } } } as never);

        await expect(markCustomerNotificationRead("demo-user", 7)).resolves.toEqual({ updated: 1 });

        expect(http.post).toHaveBeenCalledWith("/api/users/demo-user/notifications/7/read");
    });
});
