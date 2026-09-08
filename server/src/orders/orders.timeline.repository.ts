import { Injectable } from "@nestjs/common";
import pool from "#src/config/database.config";
import type { QueryCallback, QueryParams, UpdateResult } from "#src/shared/interfaces/domain";
import type { OrderTimelineInput, OrderTimelineRow } from "./orders.types";
import type { TransactionContext } from "../database/transaction";

type OrderTimelineInsert = OrderTimelineInput & {
    label: string;
};

@Injectable()
export class OrderTimelineRepository {
    private query(sql: string, params?: QueryParams, callback?: QueryCallback) {
        if (typeof params === "function") {
            return pool.query(sql, params);
        }
        return pool.query(sql, params, callback);
    }

    createTimelineEvent(event: OrderTimelineInsert, callback: QueryCallback<UpdateResult> = () => {}) {
        this.query(
            `INSERT INTO order_status_events (order_id, status, label, note, actor_id)
            VALUES (?, ?, ?, ?, ?)`,
            [event.orderId, event.status, event.label, event.note || null, event.actorId || null],
            callback,
        );
    }

    async createTimelineEventInTransaction(tx: TransactionContext, event: OrderTimelineInsert): Promise<void> {
        await tx.query(
            `INSERT INTO order_status_events (order_id, status, label, note, actor_id)
            VALUES (?, ?, ?, ?, ?)`,
            [event.orderId, event.status, event.label, event.note || null, event.actorId || null],
        );
    }

    getTimelineByOrderId(orderId: number, callback: QueryCallback<OrderTimelineRow[]>) {
        this.query(
            `SELECT id, order_id, status, label, note, actor_id,
                DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%s.000Z') AS created_at
            FROM order_status_events
            WHERE order_id = ?
            ORDER BY created_at ASC, id ASC`,
            [orderId],
            callback,
        );
    }
}
