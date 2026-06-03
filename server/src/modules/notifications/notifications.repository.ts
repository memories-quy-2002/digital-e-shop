import pool from "#/config/database.config";
import type { QueryCallback, QueryParams, UpdateResult } from "#/shared/interfaces/domain";
import type { CustomerNotificationRow } from "./notifications.types";

let tableReady = false;

type CustomerNotificationInput = {
    userId: string;
    type?: string;
    title: string;
    message: string;
    link?: string | null;
};

const query = (sql: string, params?: QueryParams, callback?: QueryCallback) => {
    if (typeof params === "function") {
        return pool.query(sql, params);
    }
    return pool.query(sql, params, callback);
};

const ensureNotificationTable = (callback: QueryCallback<void>) => {
    if (tableReady) {
        callback();
        return;
    }

    query(
        `CREATE TABLE IF NOT EXISTS customer_notifications (
            id INT NOT NULL AUTO_INCREMENT,
            user_id VARCHAR(255) NOT NULL,
            type VARCHAR(40) NOT NULL DEFAULT 'order',
            title VARCHAR(160) NOT NULL,
            message VARCHAR(500) NOT NULL,
            link VARCHAR(255) NULL,
            read_at DATETIME NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            INDEX customer_notifications_user_id_idx (user_id),
            INDEX customer_notifications_created_at_idx (created_at)
        )`,
        (err: Error | null) => {
            if (err) return callback(err);
            tableReady = true;
            callback();
        }
    );
};

const createNotification = (notification: CustomerNotificationInput, callback: QueryCallback = () => {}) => {
    ensureNotificationTable((err: Error | null) => {
        if (err) return callback(err);
        query(
            `INSERT INTO customer_notifications (user_id, type, title, message, link)
            VALUES (?, ?, ?, ?, ?)`,
            [
                notification.userId,
                notification.type || "order",
                notification.title,
                notification.message,
                notification.link || null,
            ],
            callback
        );
    });
};

const getNotificationsByUserId = (uid: string, limit: number, callback: QueryCallback<CustomerNotificationRow[]>) => {
    ensureNotificationTable((err: Error | null) => {
        if (err) return callback(err);
        query(
            `SELECT id, user_id, type, title, message, link,
                DATE_FORMAT(read_at, '%Y-%m-%dT%H:%i:%s.000Z') AS read_at,
                DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%s.000Z') AS created_at
            FROM customer_notifications
            WHERE user_id = ?
            ORDER BY created_at DESC, id DESC
            LIMIT ?`,
            [uid, limit],
            callback
        );
    });
};

const markNotificationRead = (uid: string, notificationId: number, callback: QueryCallback<UpdateResult>) => {
    ensureNotificationTable((err: Error | null) => {
        if (err) return callback(err);
        query(
            "UPDATE customer_notifications SET read_at = UTC_TIMESTAMP() WHERE id = ? AND user_id = ?",
            [notificationId, uid],
            callback
        );
    });
};

const markAllNotificationsRead = (uid: string, callback: QueryCallback<UpdateResult>) => {
    ensureNotificationTable((err: Error | null) => {
        if (err) return callback(err);
        query(
            "UPDATE customer_notifications SET read_at = UTC_TIMESTAMP() WHERE user_id = ? AND read_at IS NULL",
            [uid],
            callback
        );
    });
};

module.exports = {
    ensureNotificationTable,
    createNotification,
    getNotificationsByUserId,
    markNotificationRead,
    markAllNotificationsRead,
};
