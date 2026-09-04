import { describe, expect, it, vi, beforeEach } from "vitest";
import { Test } from "@nestjs/testing";
import { NotificationsModule } from "../notifications.module";
import { NotificationsController } from "../notifications.controller";
import { NestNotificationsService } from "../notifications.service";
import { AuthModule } from "../../auth/auth.module";
import { NestAuthService } from "../../auth/auth.service";
import { UsersRepository } from "../../users/users.repository";

vi.mock("#src/config/database.config", () => ({
    default: { query: vi.fn() },
}));

describe("NotificationsController", () => {
    let controller: NotificationsController;
    let service: NestNotificationsService;

    beforeEach(async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [NotificationsModule, AuthModule],
        })
            .overrideProvider(NestAuthService)
            .useValue({ verifySessionToken: vi.fn().mockResolvedValue({ valid: true }) })
            .overrideProvider(UsersRepository)
            .useValue({ findById: vi.fn() })
            .compile();

        controller = moduleRef.get(NotificationsController);
        service = moduleRef.get(NestNotificationsService);
    });

    it("module compiles with the guards, pipes, and rate-limit middleware wired without error", () => {
        expect(controller).toBeDefined();
    });

    it("getNotifications computes unread count and returns the existing response shape", async () => {
        vi.spyOn(service, "getNotifications").mockResolvedValue([
            { id: 1, is_read: false },
            { id: 2, is_read: true },
        ] as never);

        const result = await controller.getNotifications({ id: "42" }, {});

        expect(service.getNotifications).toHaveBeenCalledWith("42", undefined);
        expect(result).toEqual({
            notifications: [{ id: 1, is_read: false }, { id: 2, is_read: true }],
            unread: 1,
            msg: "Notifications retrieved successfully",
        });
    });

    it("markAllNotificationsRead delegates to the service and returns { result, msg }", async () => {
        vi.spyOn(service, "markAllRead").mockResolvedValue({ updated: 3 } as never);

        const result = await controller.markAllNotificationsRead({ id: "42" });

        expect(service.markAllRead).toHaveBeenCalledWith("42");
        expect(result).toEqual({ result: { updated: 3 }, msg: "Notifications marked as read" });
    });

    it("markNotificationRead delegates to the service and returns { result, msg }", async () => {
        vi.spyOn(service, "markRead").mockResolvedValue({ updated: 1 } as never);

        const result = await controller.markNotificationRead({ id: "42", notificationId: 7 });

        expect(service.markRead).toHaveBeenCalledWith("42", 7);
        expect(result).toEqual({ result: { updated: 1 }, msg: "Notification marked as read" });
    });
});
