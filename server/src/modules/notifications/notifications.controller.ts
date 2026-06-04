import type { AppRequest, AppResponse } from "#src/shared/interfaces/domain";
import type { CustomerNotificationRow } from "./notifications.types";
import { logger } from "#src/shared/utils/logger";
const notificationService = require("./notifications.service");
const { notificationRouteParamsSchema, notificationsQuerySchema } = require("./notifications.validator");
const { getValidationMessage, parseBody } = require("#src/shared/validation/requestSchemas");

async function getNotifications(req: AppRequest, res: AppResponse) {
    try {
        const { id } = parseBody(notificationRouteParamsSchema, req.params);
        const { limit } = parseBody(notificationsQuerySchema, req.query);
        const notifications = await notificationService.getNotifications(id, limit);
        const unread = notifications.filter((notification: CustomerNotificationRow & { is_read?: boolean }) => !notification.is_read).length;
        return res.status(200).json({ notifications, unread, msg: "Notifications retrieved successfully" });
    } catch (err) {
        if (err?.name === "ZodError") {
            return res.status(400).json({ msg: getValidationMessage(err) });
        }
        logger.error(err);
        return res.status(500).json({ msg: "Unable to load notifications" });
    }
}

async function markNotificationRead(req: AppRequest, res: AppResponse) {
    try {
        const { id, notificationId } = parseBody(notificationRouteParamsSchema, req.params);
        const result = await notificationService.markRead(id, notificationId);
        return res.status(200).json({ result, msg: "Notification marked as read" });
    } catch (err) {
        if (err?.name === "ZodError") {
            return res.status(400).json({ msg: getValidationMessage(err) });
        }
        logger.error(err);
        return res.status(500).json({ msg: "Unable to update notification" });
    }
}

async function markAllNotificationsRead(req: AppRequest, res: AppResponse) {
    try {
        const { id } = parseBody(notificationRouteParamsSchema, req.params);
        const result = await notificationService.markAllRead(id);
        return res.status(200).json({ result, msg: "Notifications marked as read" });
    } catch (err) {
        if (err?.name === "ZodError") {
            return res.status(400).json({ msg: getValidationMessage(err) });
        }
        logger.error(err);
        return res.status(500).json({ msg: "Unable to update notifications" });
    }
}

module.exports = {
    getNotifications,
    markNotificationRead,
    markAllNotificationsRead,
};

