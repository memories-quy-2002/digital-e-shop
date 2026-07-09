import { Injectable } from "@nestjs/common";
import type { CustomerNotificationRow } from "./notifications.types";
import { NotificationsRepository } from "./notifications.repository";

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

@Injectable()
export class NestNotificationsService {
    constructor(private readonly notificationsRepository: NotificationsRepository) {}

    async getNotifications(uid: string, limit = 30): Promise<ReturnType<typeof normalizeNotification>[]> {
        const safeLimit = Math.min(Math.max(Number(limit) || 30, 1), 100);
        const rows = await this.notificationsRepository.getNotificationsByUserId(uid, safeLimit);
        return (rows || []).map(normalizeNotification);
    }

    async markRead(uid: string, notificationId: number | string) {
        const result = await this.notificationsRepository.markNotificationRead(uid, Number(notificationId));
        return { updated: result.affectedRows || 0 };
    }

    async markAllRead(uid: string) {
        const result = await this.notificationsRepository.markAllNotificationsRead(uid);
        return { updated: result.affectedRows || 0 };
    }

    notifyOrderPlaced(uid: string, orderId: number, total: number): void {
        this.notificationsRepository.createNotification({
            userId: uid,
            type: "order",
            title: `Order #${orderId} was placed`,
            message: `Your order total is $${Number(total || 0).toFixed(2)}. We will update this timeline as the order moves forward.`,
            link: `/orders?order=${orderId}`,
        });
    }

    notifyOrderStatus(uid: string, orderId: number, status: number): void {
        const label = statusLabel(status);
        this.notificationsRepository.createNotification({
            userId: uid,
            type: "order",
            title: `Order #${orderId} is ${label}`,
            message: `The order status changed to ${label}. Open your order history to see the full timeline.`,
            link: `/orders?order=${orderId}`,
        });
    }
}
