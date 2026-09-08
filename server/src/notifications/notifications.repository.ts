import { Injectable } from "@nestjs/common";
import pool from "#src/config/database.config";
import type { QueryCallback, QueryParams, UpdateResult } from "#src/shared/interfaces/domain";
import type { CustomerNotificationRow } from "./notifications.types";

type CustomerNotificationInput = {
    userId: string;
    type?: string;
    title: string;
    message: string;
    link?: string | null;
};

@Injectable()
export class NotificationsRepository {
    private query(sql: string, params?: QueryParams, callback?: QueryCallback) {
        if (typeof params === "function") {
            return pool.query(sql, params);
        }
        return pool.query(sql, params, callback);
    }

    createNotification(notification: CustomerNotificationInput): void {
        this.query(
            `INSERT INTO customer_notifications (user_id, type, title, message, link)
            VALUES (?, ?, ?, ?, ?)`,
            [
                notification.userId,
                notification.type || "order",
                notification.title,
                notification.message,
                notification.link || null,
            ],
        );
    }

    getNotificationsByUserId(uid: string, limit: number): Promise<CustomerNotificationRow[]> {
        return new Promise((resolve, reject) => {
            this.query(
                `SELECT id, user_id, type, title, message, link,
                    DATE_FORMAT(read_at, '%Y-%m-%dT%H:%i:%s.000Z') AS read_at,
                    DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%s.000Z') AS created_at
                FROM customer_notifications
                WHERE user_id = ?
                ORDER BY created_at DESC, id DESC
                LIMIT ?`,
                [uid, limit],
                (queryErr: Error | null, rows: CustomerNotificationRow[]) => {
                    if (queryErr) return reject(queryErr);
                    resolve(rows);
                },
            );
        });
    }

    markNotificationRead(uid: string, notificationId: number): Promise<UpdateResult> {
        return new Promise((resolve, reject) => {
            this.query(
                "UPDATE customer_notifications SET read_at = UTC_TIMESTAMP() WHERE id = ? AND user_id = ?",
                [notificationId, uid],
                (queryErr: Error | null, result: UpdateResult) => {
                    if (queryErr) return reject(queryErr);
                    resolve(result);
                },
            );
        });
    }

    markAllNotificationsRead(uid: string): Promise<UpdateResult> {
        return new Promise((resolve, reject) => {
            this.query(
                "UPDATE customer_notifications SET read_at = UTC_TIMESTAMP() WHERE user_id = ? AND read_at IS NULL",
                [uid],
                (queryErr: Error | null, result: UpdateResult) => {
                    if (queryErr) return reject(queryErr);
                    resolve(result);
                },
            );
        });
    }
}
