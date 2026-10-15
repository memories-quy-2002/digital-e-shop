import { describe, expect, it, vi } from "vitest";
import { NestNotificationsService } from "../notifications.service";

describe("NestNotificationsService", () => {
    it("returns the user's unread count independently of the notification list", async () => {
        const repository = {
            getUnreadNotificationCount: vi.fn().mockResolvedValue(37),
        };
        const service = new NestNotificationsService(repository as never);

        await expect(service.getUnreadCount("user-42")).resolves.toBe(37);
        expect(repository.getUnreadNotificationCount).toHaveBeenCalledWith("user-42");
    });
});
