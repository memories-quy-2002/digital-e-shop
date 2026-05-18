import type { AppRequest, AppResponse } from "../types/domain";
import type { CustomerNotificationRow } from "../types/domain";
const notificationService = require("../services/customerNotificationService");

async function getNotifications(req: AppRequest, res: AppResponse) {
    try {
        const notifications = await notificationService.getNotifications(req.params.id, req.query.limit);
        const unread = notifications.filter((notification: CustomerNotificationRow & { is_read?: boolean }) => !notification.is_read).length;
        return res.status(200).json({ notifications, unread, msg: "Notifications retrieved successfully" });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Unable to load notifications" });
    }
}

async function markNotificationRead(req: AppRequest, res: AppResponse) {
    try {
        const result = await notificationService.markRead(req.params.id, req.params.notificationId);
        return res.status(200).json({ result, msg: "Notification marked as read" });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Unable to update notification" });
    }
}

async function markAllNotificationsRead(req: AppRequest, res: AppResponse) {
    try {
        const result = await notificationService.markAllRead(req.params.id);
        return res.status(200).json({ result, msg: "Notifications marked as read" });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Unable to update notifications" });
    }
}

module.exports = {
    getNotifications,
    markNotificationRead,
    markAllNotificationsRead,
};
