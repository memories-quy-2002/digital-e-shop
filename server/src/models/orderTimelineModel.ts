const pool = require("../config/db");
import type { OrderTimelineInput, OrderTimelineRow, QueryCallback, QueryParams, UpdateResult } from "../types/domain";

let tableReady = false;

type OrderTimelineInsert = OrderTimelineInput & {
    label: string;
};

const query = (sql: string, params?: QueryParams, callback?: QueryCallback) => {
    if (typeof params === "function") {
        return pool.query(sql, params);
    }
    return pool.query(sql, params, callback);
};

const ensureOrderTimelineTable = (callback: QueryCallback<void>) => {
    if (tableReady) {
        callback();
        return;
    }

    query(
        `CREATE TABLE IF NOT EXISTS order_status_events (
            id INT NOT NULL AUTO_INCREMENT,
            order_id INT NOT NULL,
            status INT NOT NULL,
            label VARCHAR(80) NOT NULL,
            note VARCHAR(255) NULL,
            actor_id VARCHAR(255) NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            INDEX order_status_events_order_id_idx (order_id),
            INDEX order_status_events_created_at_idx (created_at)
        )`,
        (err: Error | null) => {
            if (err) return callback(err);
            tableReady = true;
            callback();
        }
    );
};

const createTimelineEvent = (event: OrderTimelineInsert, callback: QueryCallback<UpdateResult> = () => {}) => {
    ensureOrderTimelineTable((err: Error | null) => {
        if (err) return callback(err);
        query(
            `INSERT INTO order_status_events (order_id, status, label, note, actor_id)
            VALUES (?, ?, ?, ?, ?)`,
            [event.orderId, event.status, event.label, event.note || null, event.actorId || null],
            callback
        );
    });
};

const getTimelineByOrderId = (orderId: number, callback: QueryCallback<OrderTimelineRow[]>) => {
    ensureOrderTimelineTable((err: Error | null) => {
        if (err) return callback(err);
        query(
            `SELECT id, order_id, status, label, note, actor_id,
                DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%s.000Z') AS created_at
            FROM order_status_events
            WHERE order_id = ?
            ORDER BY created_at ASC, id ASC`,
            [orderId],
            callback
        );
    });
};

module.exports = {
    ensureOrderTimelineTable,
    createTimelineEvent,
    getTimelineByOrderId,
};
