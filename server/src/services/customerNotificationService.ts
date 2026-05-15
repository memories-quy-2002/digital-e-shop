const Notification = require("../models/customerNotificationModel");
import type { CustomerNotificationRow, DbError, UpdateResult } from "../types/domain";

const normalizeNotification = (notification: CustomerNotificationRow) => ({
    id: Number(notification.id),
    user_id: notification.user_id,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    link: notification.link,
    read_at: notification.read_at,
    created_at: notification.created_at,
    is_read: Boolean(notification.read_at),
});

const statusLabel = (status: number) => {
    if (Number(status) === 1) return "completed";
    if (Number(status) === 2) return "canceled";
    return "pending";
};

async function getNotifications(uid: string, limit = 30): Promise<ReturnType<typeof normalizeNotification>[]> {
    const safeLimit = Math.min(Math.max(Number(limit) || 30, 1), 100);
    return new Promise((resolve, reject) => {
        Notification.getNotificationsByUserId(uid, safeLimit, (err: DbError | null, rows: CustomerNotificationRow[]) => {
            if (err) return reject(err);
            resolve((rows || []).map(normalizeNotification));
        });
    });
}

async function markRead(uid: string, notificationId: number | string) {
    return new Promise((resolve, reject) => {
        Notification.markNotificationRead(uid, notificationId, (err: DbError | null, result: UpdateResult) => {
            if (err) return reject(err);
            resolve({ updated: result.affectedRows || 0 });
        });
    });
}

async function markAllRead(uid: string) {
    return new Promise((resolve, reject) => {
        Notification.markAllNotificationsRead(uid, (err: DbError | null, result: UpdateResult) => {
            if (err) return reject(err);
            resolve({ updated: result.affectedRows || 0 });
        });
    });
}

function notifyOrderPlaced(uid: string, orderId: number, total: number) {
    Notification.createNotification({
        userId: uid,
        type: "order",
        title: `Order #${orderId} was placed`,
        message: `Your order total is $${Number(total || 0).toFixed(2)}. We will update this timeline as the order moves forward.`,
        link: `/orders?order=${orderId}`,
    });
}

function notifyOrderStatus(uid: string, orderId: number, status: number) {
    const label = statusLabel(status);
    Notification.createNotification({
        userId: uid,
        type: "order",
        title: `Order #${orderId} is ${label}`,
        message: `The order status changed to ${label}. Open your order history to see the full timeline.`,
        link: `/orders?order=${orderId}`,
    });
}

module.exports = {
    getNotifications,
    markRead,
    markAllRead,
    notifyOrderPlaced,
    notifyOrderStatus,
};
