import { beforeEach, describe, expect, it, vi } from "vitest";
import pool from "#src/config/database.config";
import { NotificationsRepository } from "../notifications.repository";

vi.mock("#src/config/database.config", () => ({
    default: { query: vi.fn() },
}));

describe("NotificationsRepository", () => {
    const repository = new NotificationsRepository();

    beforeEach(() => vi.clearAllMocks());

    it("counts every unread notification for the requested user", async () => {
        vi.mocked(pool.query).mockImplementation(((_sql, _params, callback) => {
            callback?.(null, [{ unread: "37" }] as never);
            return {} as never;
        }) as typeof pool.query);

        await expect(repository.getUnreadNotificationCount("user-42")).resolves.toBe(37);
        expect(pool.query).toHaveBeenCalledWith(
            "SELECT COUNT(*) AS unread FROM customer_notifications WHERE user_id = ? AND read_at IS NULL",
            ["user-42"],
            expect.any(Function),
        );
    });
});
