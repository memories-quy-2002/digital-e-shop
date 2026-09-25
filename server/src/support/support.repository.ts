import { Injectable } from "@nestjs/common";
import pool from "#src/config/database.config";
import type { InsertResult, QueryCallback, UpdateResult } from "#src/shared/interfaces/domain";
import {
    SUPPORT_DEFAULT_CATEGORY,
    SUPPORT_PRIORITY,
    SUPPORT_STATUS,
    type CreateSupportTicketInput,
    type SupportTicket,
    type UpdateSupportTicketInput,
} from "./support.types";
import { SUPPORT_TICKETS_LIMIT } from "#src/shared/constants/operational-limits";

const ticketColumns = `id, user_id, order_id, category, subject, message, status, priority,
    admin_note, DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%s.000Z') AS created_at,
    DATE_FORMAT(updated_at, '%Y-%m-%dT%H:%i:%s.000Z') AS updated_at`;

@Injectable()
export class SupportTicketRepository {
    create(userId: string, input: CreateSupportTicketInput, callback: QueryCallback<InsertResult>) {
        if (input.orderId) {
            pool.query(
                `INSERT INTO support_tickets
                    (user_id, order_id, category, subject, message, status, priority, created_at, updated_at)
                 SELECT ?, id, ?, ?, ?, '${SUPPORT_STATUS.OPEN}', '${SUPPORT_PRIORITY.NORMAL}', UTC_TIMESTAMP(), UTC_TIMESTAMP()
                 FROM orders WHERE id = ? AND user_id = ?`,
                [userId, input.category || SUPPORT_DEFAULT_CATEGORY, input.subject, input.message, input.orderId, userId],
                callback,
            );
            return;
        }

        pool.query(
            `INSERT INTO support_tickets
                (user_id, category, subject, message, status, priority, created_at, updated_at)
             VALUES (?, ?, ?, ?, '${SUPPORT_STATUS.OPEN}', '${SUPPORT_PRIORITY.NORMAL}', UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
            [userId, input.category || SUPPORT_DEFAULT_CATEGORY, input.subject, input.message],
            callback,
        );
    }

    findById(id: number, callback: QueryCallback<SupportTicket[]>) {
        pool.query(`SELECT ${ticketColumns} FROM support_tickets WHERE id = ? LIMIT 1`, [id], callback);
    }

    findByUser(userId: string, status: string | undefined, callback: QueryCallback<SupportTicket[]>) {
        const values: unknown[] = [userId];
        const statusClause = status ? " AND status = ?" : "";
        if (status) values.push(status);
        pool.query(
            `SELECT ${ticketColumns} FROM support_tickets WHERE user_id = ?${statusClause} ORDER BY created_at DESC`,
            values,
            callback,
        );
    }

    findAll(status: string | undefined, callback: QueryCallback<SupportTicket[]>) {
        const values: unknown[] = [];
        const statusClause = status ? " WHERE status = ?" : "";
        if (status) values.push(status);
        pool.query(
            `SELECT ${ticketColumns} FROM support_tickets${statusClause} ORDER BY created_at DESC LIMIT ${SUPPORT_TICKETS_LIMIT}`,
            values,
            callback,
        );
    }

    update(id: number, input: UpdateSupportTicketInput, callback: QueryCallback<UpdateResult>) {
        const updates: string[] = [];
        const values: unknown[] = [];
        if (input.status !== undefined) {
            updates.push("status = ?");
            values.push(input.status);
        }
        if (input.priority !== undefined) {
            updates.push("priority = ?");
            values.push(input.priority);
        }
        if (input.adminNote !== undefined) {
            updates.push("admin_note = ?");
            values.push(input.adminNote || null);
        }
        updates.push("updated_at = UTC_TIMESTAMP()");
        values.push(id);
        pool.query(`UPDATE support_tickets SET ${updates.join(", ")} WHERE id = ?`, values, callback);
    }
}
