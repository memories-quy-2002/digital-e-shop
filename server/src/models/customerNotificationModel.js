const pool = require("../config/db");

let tableReady = false;

const query = (sql, params, callback) => {
    if (typeof params === "function") {
        return pool.query(sql, params);
    }
    return pool.query(sql, params, callback);
};

const ensureNotificationTable = (callback) => {
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
        (err) => {
            if (err) return callback(err);
            tableReady = true;
            callback();
        }
    );
};

const createNotification = (notification, callback = () => {}) => {
    ensureNotificationTable((err) => {
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

const getNotificationsByUserId = (uid, limit, callback) => {
    ensureNotificationTable((err) => {
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

const markNotificationRead = (uid, notificationId, callback) => {
    ensureNotificationTable((err) => {
        if (err) return callback(err);
        query(
            "UPDATE customer_notifications SET read_at = UTC_TIMESTAMP() WHERE id = ? AND user_id = ?",
            [notificationId, uid],
            callback
        );
    });
};

const markAllNotificationsRead = (uid, callback) => {
    ensureNotificationTable((err) => {
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
