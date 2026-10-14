import { ConflictException, Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import pool from "#src/config/database.config";
import type { TaskLease } from "../operations/tasks.types";
import { withTransaction, type TransactionContext } from "../database/transaction";
import { hashTaskPayload } from "../operations/tasks.policy";
import type { AdminEmailRow, DeliveryEventInput, DeliveryEventResult, EmailBusinessEvent, EmailMessage, EmailRepository, PersistedEmail, ResendSource } from "./email.types";

type EmailRow = {
    id: number; event_key: string; recipient: string; locale: "en" | "vi"; subject: string;
    text_body: string; html_body: string; state: string; provider_message_id: string | null;
};
type EmailWriteResult = { insertId: number; affectedRows: number };
type DeliveryRow = { id: number; payload_hash: string; email_id: number };
type QueryCallback = (error: Error | null, results?: unknown) => void;
type QueryPool = { query: (sql: string, values: unknown[], callback: QueryCallback) => unknown };

const query = <T>(sql: string, values: unknown[]): Promise<T> => new Promise((resolve, reject) => {
    (pool as unknown as QueryPool).query(sql, values, (error, rows) => error ? reject(error) : resolve(rows as T));
});

function contentHash(event: EmailBusinessEvent, message: EmailMessage): string {
    return createHash("sha256").update(hashTaskPayload({ eventKey: event.eventKey, type: event.type, recipient: event.recipient, locale: event.locale, snapshot: event.snapshot, subject: message.subject, text: message.text, html: message.html })).digest("hex");
}

@Injectable()
export class TransactionalEmailRepository implements EmailRepository {
    withTransaction<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T> { return withTransaction(work); }

    async enqueue(tx: TransactionContext, event: EmailBusinessEvent, message: EmailMessage, audit?: { resendOfId: number; createdByAdminId: string; unknownOutcomeAcknowledged: boolean }): Promise<{ id: number; created: boolean }> {
        const digest = contentHash(event, message);
        const result = await tx.query<EmailWriteResult>(
            `INSERT INTO transactional_emails
                (event_key, event_type, recipient, locale, subject, text_body, html_body, snapshot, content_hash, state,
                 resend_of_id, created_by_admin_id, unknown_outcome_acknowledged)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)
             ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
            [event.eventKey, event.type, event.recipient, event.locale, message.subject, message.text, message.html, JSON.stringify(event.snapshot), digest,
                audit?.resendOfId ?? null, audit?.createdByAdminId ?? null, audit?.unknownOutcomeAcknowledged ? 1 : 0],
        );
        const [row] = await tx.query<Array<{ id: number; content_hash: string }>>(
            "SELECT id, content_hash FROM transactional_emails WHERE event_key = ? FOR UPDATE", [event.eventKey],
        );
        if (!row || row.content_hash !== digest) throw new ConflictException("Email event key already has different facts");
        return { id: Number(row.id || result.insertId), created: result.affectedRows === 1 };
    }

    async listAdminMessages(limit: number, afterId?: number): Promise<AdminEmailRow[]> {
        const rows = await query<Array<{ id: number; event_type: string; recipient: string; locale: "en" | "vi"; state: string; provider_message_id: string | null; created_at: Date; updated_at: Date; last_error_code: string | null }>>(
            `SELECT email.id, email.event_type, email.recipient, email.locale,
                    CASE WHEN task.state = 'REVIEW_REQUIRED' AND email.state = 'PENDING' THEN 'REVIEW_REQUIRED' ELSE email.state END AS state,
                    email.provider_message_id, email.created_at, email.updated_at, email.last_error_code
             FROM transactional_emails email
             LEFT JOIN operations_tasks task ON task.kind = 'EMAIL_SEND' AND task.business_key = email.event_key
             WHERE (? IS NULL OR email.id < ?) ORDER BY email.id DESC LIMIT ?`,
            [afterId ?? null, afterId ?? null, limit],
        );
        return rows.map((row) => ({ id: Number(row.id), eventType: row.event_type, recipientMasked: maskRecipient(row.recipient),
            locale: row.locale, state: row.state, providerMessageId: row.provider_message_id,
            createdAt: row.created_at, updatedAt: row.updated_at, lastErrorCode: safeCode(row.last_error_code) }));
    }

    async getForResend(tx: TransactionContext, id: number): Promise<ResendSource | null> {
        const [row] = await tx.query<Array<{ id: number; event_key: string; event_type: EmailBusinessEvent["type"]; recipient: string; locale: "en" | "vi"; snapshot: string | object; state: string }>>(
            `SELECT email.id, email.event_key, email.event_type, email.recipient, email.locale, email.snapshot,
                    CASE WHEN task.state = 'REVIEW_REQUIRED' AND email.state = 'PENDING' THEN 'REVIEW_REQUIRED' ELSE email.state END AS state
             FROM transactional_emails email
             LEFT JOIN operations_tasks task ON task.kind = 'EMAIL_SEND' AND task.business_key = email.event_key
             WHERE email.id = ? FOR UPDATE`, [id],
        );
        if (!row) return null;
        const snapshot = typeof row.snapshot === "string" ? JSON.parse(row.snapshot) : row.snapshot;
        return { id: Number(row.id), state: row.state, event: { eventKey: row.event_key, type: row.event_type, recipient: row.recipient, locale: row.locale, snapshot } as EmailBusinessEvent };
    }

    async recordDeliveryEvent(input: DeliveryEventInput): Promise<DeliveryEventResult> {
        return withTransaction(async (tx) => {
            const [email] = await tx.query<Array<{ id: number }>>(
                "SELECT id FROM transactional_emails WHERE provider_message_id = ? FOR UPDATE", [input.providerMessageId],
            );
            if (!email) return { kind: "ignored" };
            const insert = await tx.query<{ affectedRows: number }>(
                `INSERT IGNORE INTO email_delivery_events
                    (provider_event_id, email_id, provider_message_id, event_type, payload_hash, received_at)
                 VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP(3))`,
                [input.providerEventId, email.id, input.providerMessageId, input.eventType, input.payloadHash],
            );
            const [stored] = await tx.query<DeliveryRow[]>(
                "SELECT id, payload_hash, email_id FROM email_delivery_events WHERE provider_event_id = ? FOR UPDATE", [input.providerEventId],
            );
            if (!stored || Number(stored.email_id) !== Number(email.id) || stored.payload_hash !== input.payloadHash) {
                throw new ConflictException("Provider event identity conflicts with stored facts");
            }
            if (insert.affectedRows === 0) {
                return { kind: "duplicate", eventId: Number(stored.id) };
            }
            const state = input.eventType === "email.delivered" ? "DELIVERED" : input.eventType === "email.bounced" ? "BOUNCED" : "FAILED";
            await tx.query(
                `UPDATE transactional_emails SET state = ?,
                    delivered_at = CASE WHEN ? = 'DELIVERED' THEN COALESCE(delivered_at, UTC_TIMESTAMP(3)) ELSE delivered_at END,
                    bounced_at = CASE WHEN ? = 'BOUNCED' THEN COALESCE(bounced_at, UTC_TIMESTAMP(3)) ELSE bounced_at END,
                    updated_at = UTC_TIMESTAMP(3)
                 WHERE id = ? AND provider_message_id = ? AND state = 'ACCEPTED'`,
                [state, state, state, email.id, input.providerMessageId],
            );
            return { kind: "queued", eventId: Number(stored.id) };
        });
    }

    async findForSend(id: number): Promise<PersistedEmail | null> {
        const rows = await query<EmailRow[]>(
            `SELECT id, event_key, recipient, locale, subject, text_body, html_body, state, provider_message_id
             FROM transactional_emails WHERE id = ? LIMIT 1`, [id],
        );
        const row = rows[0];
        if (!row) return null;
        return { id: Number(row.id), state: row.state, providerMessageId: row.provider_message_id,
            message: { eventKey: row.event_key, locale: row.locale, to: [row.recipient], subject: row.subject, text: row.text_body, html: row.html_body } };
    }

    markAccepted(id: number, providerMessageId: string, lease: TaskLease): Promise<boolean> {
        return this.updateFenced(id, lease, "ACCEPTED", providerMessageId, null);
    }

    markSandbox(id: number, fixtureId: string, lease: TaskLease): Promise<boolean> {
        return this.updateFenced(id, lease, "SANDBOX", null, null);
    }

    markFailed(id: number, reason: string, lease: TaskLease): Promise<boolean> {
        return this.updateFenced(id, lease, "FAILED", null, reason);
    }

    markReviewRequired(id: number, reason: string, lease: TaskLease): Promise<boolean> {
        return this.updateFenced(id, lease, "REVIEW_REQUIRED", null, reason);
    }

    private async updateFenced(id: number, lease: TaskLease, state: string, providerMessageId: string | null, reason: string | null): Promise<boolean> {
        const result = await query<{ affectedRows: number }>(
            `UPDATE transactional_emails AS email SET state = ?,
                provider_message_id = COALESCE(?, provider_message_id),
                accepted_at = CASE WHEN ? IN ('ACCEPTED', 'SANDBOX') THEN COALESCE(accepted_at, UTC_TIMESTAMP(3)) ELSE accepted_at END,
                last_error_code = ?, updated_at = UTC_TIMESTAMP(3)
             WHERE email.id = ? AND EXISTS (
                SELECT 1 FROM operations_tasks AS task
                WHERE task.kind = 'EMAIL_SEND' AND task.business_key = email.event_key
                  AND task.id = ? AND task.state = 'RUNNING' AND task.lease_token = ?
                  AND task.lease_expires_at > UTC_TIMESTAMP(3)
             )`,
            [state, providerMessageId, state, reason, id, lease.id, lease.token],
        );
        return result.affectedRows === 1;
    }
}

function maskRecipient(value: string): string {
    const [local = "", domain = ""] = value.split("@", 2);
    return `${local.slice(0, 1)}***@${domain}`;
}

function safeCode(value: string | null): string | null {
    return value && /^[a-z0-9_-]{1,80}$/i.test(value) ? value : value ? "provider_error" : null;
}
