import { Injectable } from "@nestjs/common";
import type { TransactionContext } from "../database/transaction";
import type { InsertResult } from "../shared/interfaces/domain";

export type WebhookEventInput = {
    provider: string; eventKey: string; eventType: string; payloadHash: string;
    normalizedPayload: Record<string, unknown>; orderCode?: number | null;
    paymentLinkId?: string | null; amount?: number | null; currency?: string | null;
};
export type WebhookClaim = { inserted: boolean; eventId: number; status: string; payloadHashMatches: boolean; conflict?: boolean };
export type ReconciliationCandidate = {
    target_type: "pending_checkout" | "order_payment"; target_id: number; provider: string;
    local_status: string; reconciliation_status: string; provider_reference: string | null;
    provider_order_code: number | string | null; payment_amount: number | string | null;
    payment_currency: string | null; reservation_expires_at?: string | Date | null; order_id?: number | null;
};
export type CandidateFilters = { provider?: string; reconciliationStatus?: string; page?: number; limit?: number };
export type CandidatePage = { candidates: ReconciliationCandidate[]; pagination: { page: number; limit: number; total: number; totalPages: number } };
export type ReconciliationAttemptInput = {
    provider: string; pendingCheckoutId?: number | null; orderPaymentId?: number | null;
    requestedBy?: string | null; outcome: string; localStatus?: string | null; providerStatus?: string | null;
    expectedAmount?: number | null; providerAmount?: number | null; expectedCurrency?: string | null;
    providerCurrency?: string | null; providerReference?: string | null; mismatchReason?: string | null;
};
export type ReconciliationProjection = {
    orderPaymentId: number; reconciliationStatus: string; providerStatus?: string | null;
    error?: string | null;
};

@Injectable()
export class PaymentReconciliationRepository {
    async insertWebhookEvent(tx: TransactionContext, input: WebhookEventInput): Promise<InsertResult> {
        return tx.query<InsertResult>(
            `INSERT INTO payment_webhook_events
                (provider, event_key, event_type, payload_hash, normalized_payload, order_code, payment_link_id, amount, currency)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [input.provider, input.eventKey, input.eventType, input.payloadHash, JSON.stringify(input.normalizedPayload), input.orderCode ?? null, input.paymentLinkId ?? null, input.amount ?? null, input.currency ?? null],
        );
    }

    async claimWebhookEvent(tx: TransactionContext, input: WebhookEventInput): Promise<WebhookClaim> {
        const result = await tx.query<InsertResult>(
            `INSERT INTO payment_webhook_events
                (provider, event_key, event_type, payload_hash, normalized_payload, order_code, payment_link_id, amount, currency)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
            [input.provider, input.eventKey, input.eventType, input.payloadHash, JSON.stringify(input.normalizedPayload), input.orderCode ?? null, input.paymentLinkId ?? null, input.amount ?? null, input.currency ?? null],
        );
        const rows = await tx.query<Array<{ id: number; status: string; payload_hash: string }>>(
            `SELECT id, status, payload_hash FROM payment_webhook_events WHERE provider = ? AND event_key = ? LIMIT 1 FOR UPDATE`,
            [input.provider, input.eventKey],
        );
        const event = rows[0];
        if (!event) throw new Error("Webhook event claim disappeared");
        const matches = event.payload_hash === input.payloadHash;
        return { inserted: result.affectedRows === 1, eventId: Number(event.id), status: event.status, payloadHashMatches: matches, ...(matches ? {} : { conflict: true }) };
    }

    async completeWebhookEvent(tx: TransactionContext, eventId: number, status: string, error?: string | null): Promise<void> {
        await tx.query(
            `UPDATE payment_webhook_events
             SET status = ?, last_error = ?, attempt_count = attempt_count + CASE WHEN ? = 'PROCESSING' THEN 1 ELSE 0 END,
                 processed_at = CASE WHEN ? IN ('PROCESSED', 'IGNORED', 'MISMATCH') THEN UTC_TIMESTAMP() ELSE processed_at END,
                 updated_at = UTC_TIMESTAMP()
             WHERE id = ?`,
            [status, error ?? null, status, status, eventId],
        );
    }

    async listCandidates(filters: CandidateFilters, tx: TransactionContext): Promise<CandidatePage> {
        const page = Math.max(1, Math.floor(filters.page || 1));
        const limit = Math.min(100, Math.max(1, Math.floor(filters.limit || 50)));
        const orderConditions: string[] = [];
        const orderValues: unknown[] = [];
        const pendingConditions: string[] = ["pc.status = 'PENDING'"];
        const pendingValues: unknown[] = [];

        if (filters.provider) {
            orderConditions.push("op.provider = ?");
            orderValues.push(filters.provider);
            pendingConditions.push("pc.payment_provider = ?");
            pendingValues.push(filters.provider);
        }
        if (filters.reconciliationStatus) {
            orderConditions.push("op.reconciliation_status = ?");
            orderValues.push(filters.reconciliationStatus);
            if (filters.reconciliationStatus !== "PENDING") {
                pendingConditions.push("1 = 0");
            }
        }

        const orderWhere = orderConditions.length ? `WHERE ${orderConditions.join(" AND ")}` : "";
        const pendingWhere = `WHERE ${pendingConditions.join(" AND ")}`;
        const values = [...orderValues, ...pendingValues];
        const countRows = await tx.query<Array<{ total: number | string }>>(
            `SELECT COUNT(*) AS total FROM (
                SELECT op.id FROM order_payments op ${orderWhere}
                UNION ALL
                SELECT pc.id FROM pending_checkouts pc ${pendingWhere}
            ) candidates`, values,
        );
        const total = Number(countRows[0]?.total || 0);
        const rows = await tx.query<ReconciliationCandidate[]>(
            `SELECT * FROM (
                SELECT 'order_payment' AS target_type, op.id AS target_id, op.provider, op.status AS local_status,
                       op.reconciliation_status, op.provider_reference, NULL AS provider_order_code,
                       op.amount AS payment_amount, op.currency AS payment_currency, NULL AS reservation_expires_at, op.order_id
                FROM order_payments op ${orderWhere}
                UNION ALL
                SELECT 'pending_checkout' AS target_type, pc.id AS target_id, pc.payment_provider AS provider, pc.status AS local_status,
                       'PENDING' AS reconciliation_status, pc.provider_reference, pc.provider_order_code,
                       pc.payment_amount, pc.payment_currency, pc.expires_at AS reservation_expires_at, NULL AS order_id
                FROM pending_checkouts pc ${pendingWhere}
            ) candidates ORDER BY target_id DESC LIMIT ? OFFSET ?`, [...values, limit, (page - 1) * limit],
        );
        return { candidates: rows, pagination: { page, limit, total, totalPages: total === 0 ? 0 : Math.ceil(total / limit) } };
    }
    async getPendingCheckoutForUpdate(tx: TransactionContext, pendingCheckoutId: number) {
        const rows = await tx.query<Array<Record<string, unknown>>>(
            `SELECT id, payment_provider, provider_reference, provider_order_code, payment_amount, payment_currency,
                    status, total_price, expires_at, user_id, guest_email, guest_name, guest_phone, cart_json, shipping_address
             FROM pending_checkouts WHERE id = ? LIMIT 1 FOR UPDATE`, [pendingCheckoutId],
        );
        return rows[0] || null;
    }

    async getOrderPaymentForUpdate(tx: TransactionContext, orderPaymentId: number) {
        const rows = await tx.query<Array<Record<string, unknown>>>(
            `SELECT id, order_id, provider, status, provider_reference, provider_payment_id, amount, currency,
                    reconciliation_status, provider_status, paid_at, last_reconciliation_error
             FROM order_payments WHERE id = ? LIMIT 1 FOR UPDATE`, [orderPaymentId],
        );
        return rows[0] || null;
    }

    async recordAttempt(tx: TransactionContext, input: ReconciliationAttemptInput): Promise<InsertResult> {
        if ((input.pendingCheckoutId == null) === (input.orderPaymentId == null)) throw new Error("Exactly one reconciliation target is required");
        return tx.query<InsertResult>(
            `INSERT INTO payment_reconciliation_attempts
                (provider, pending_checkout_id, order_payment_id, requested_by, outcome, local_status, provider_status,
                 expected_amount, provider_amount, expected_currency, provider_currency, provider_reference, mismatch_reason)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [input.provider, input.pendingCheckoutId ?? null, input.orderPaymentId ?? null, input.requestedBy ?? null, input.outcome, input.localStatus ?? null, input.providerStatus ?? null, input.expectedAmount ?? null, input.providerAmount ?? null, input.expectedCurrency ?? null, input.providerCurrency ?? null, input.providerReference ?? null, input.mismatchReason ?? null],
        );
    }

    async projectReconciliation(tx: TransactionContext, input: ReconciliationProjection): Promise<void> {
        await tx.query(
            `UPDATE order_payments SET reconciliation_status = ?, provider_status = ?, last_reconciled_at = UTC_TIMESTAMP(), last_reconciliation_error = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?`,
            [input.reconciliationStatus, input.providerStatus ?? null, input.error ?? null, input.orderPaymentId],
        );
    }

    async listWebhookEvents(tx: TransactionContext, orderPaymentId: number) {
        return tx.query<Array<Record<string, unknown>>>(
            `SELECT e.id, e.provider, e.event_key, e.event_type, e.payload_hash, e.normalized_payload,
                    e.order_code, e.payment_link_id, e.amount, e.currency, e.status, e.attempt_count,
                    e.last_error, e.received_at, e.processed_at, e.created_at, e.updated_at
             FROM payment_webhook_events e
             JOIN order_payments op ON op.provider = e.provider
                 AND op.provider_reference = CAST(e.order_code AS CHAR)
                 AND op.provider_payment_id = e.payment_link_id
             WHERE op.id = ? ORDER BY e.received_at DESC, e.id DESC`, [orderPaymentId],
        );
    }
}
