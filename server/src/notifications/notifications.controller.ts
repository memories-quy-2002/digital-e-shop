import { Controller, Get, HttpException, Param, Post, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../guards/auth.guard";
import { OwnerParam, RolesGuard } from "../guards/roles.guard";
import { ZodValidationPipe } from "../pipes/zod-validation.pipe";
import { NestNotificationsService } from "./notifications.service";
import type { CustomerNotificationRow } from "./notifications.types";
import { notificationRouteParamsSchema, notificationsQuerySchema } from "./notifications.validator";

function toHttpException(fallbackMessage: string): HttpException {
    return new HttpException({ msg: fallbackMessage }, 500);
}

@Controller(["users/:id/notifications", "user/:id/notifications"])
@UseGuards(AuthGuard, RolesGuard)
@OwnerParam("id")
export class NotificationsController {
    constructor(private readonly notificationsService: NestNotificationsService) {}

    @Get()
    async getNotifications(
        @Param(new ZodValidationPipe(notificationRouteParamsSchema)) params: { id: string },
        @Query(new ZodValidationPipe(notificationsQuerySchema)) query: { limit?: number },
    ) {
        try {
            const notifications = await this.notificationsService.getNotifications(params.id, query.limit);
            const unread = notifications.filter(
                (notification: CustomerNotificationRow & { is_read?: boolean }) => !notification.is_read,
            ).length;
            return { notifications, unread, msg: "Notifications retrieved successfully" };
        } catch (err) {
            if (err instanceof HttpException) throw err;
            throw toHttpException("Unable to load notifications");
        }
    }

    @Post("read-all")
    async markAllNotificationsRead(@Param(new ZodValidationPipe(notificationRouteParamsSchema)) params: { id: string }) {
        try {
            const result = await this.notificationsService.markAllRead(params.id);
            return { result, msg: "Notifications marked as read" };
        } catch (err) {
            if (err instanceof HttpException) throw err;
            throw toHttpException("Unable to update notifications");
        }
    }

    @Post(":notificationId/read")
    async markNotificationRead(
        @Param(new ZodValidationPipe(notificationRouteParamsSchema)) params: { id: string; notificationId: number },
    ) {
        try {
            const result = await this.notificationsService.markRead(params.id, params.notificationId);
            return { result, msg: "Notification marked as read" };
        } catch (err) {
            if (err instanceof HttpException) throw err;
            throw toHttpException("Unable to update notification");
        }
    }
}
