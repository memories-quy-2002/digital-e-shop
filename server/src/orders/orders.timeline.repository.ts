import { Injectable } from "@nestjs/common";
import pool from "#src/config/database.config";
import type { QueryCallback, QueryParams, UpdateResult } from "#src/shared/interfaces/domain";
import type { OrderTimelineInput, OrderTimelineRow } from "./orders.types";

type OrderTimelineInsert = OrderTimelineInput & {
    label: string;
};

@Injectable()
export class OrderTimelineRepository {
    private tableReady = false;

    private query(sql: string, params?: QueryParams, callback?: QueryCallback) {
        if (typeof params === "function") {
            return pool.query(sql, params);
        }
        return pool.query(sql, params, callback);
    }

    private ensureOrderTimelineTable(callback: QueryCallback<void>) {
        if (this.tableReady) {
            callback();
            return;
        }

        this.query(
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
            undefined,
            (err: Error | null) => {
                if (err) return callback(err);
                this.tableReady = true;
                callback();
            },
        );
    }

    createTimelineEvent(event: OrderTimelineInsert, callback: QueryCallback<UpdateResult> = () => {}) {
        this.ensureOrderTimelineTable((err: Error | null) => {
            if (err) return callback(err);
            this.query(
                `INSERT INTO order_status_events (order_id, status, label, note, actor_id)
                VALUES (?, ?, ?, ?, ?)`,
                [event.orderId, event.status, event.label, event.note || null, event.actorId || null],
                callback,
            );
        });
    }

    getTimelineByOrderId(orderId: number, callback: QueryCallback<OrderTimelineRow[]>) {
        this.ensureOrderTimelineTable((err: Error | null) => {
            if (err) return callback(err);
            this.query(
                `SELECT id, order_id, status, label, note, actor_id,
                    DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%s.000Z') AS created_at
                FROM order_status_events
                WHERE order_id = ?
                ORDER BY created_at ASC, id ASC`,
                [orderId],
                callback,
            );
        });
    }
}
