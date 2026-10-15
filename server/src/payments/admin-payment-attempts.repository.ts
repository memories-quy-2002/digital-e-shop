import { Injectable } from "@nestjs/common";
import type { TransactionContext } from "../database/transaction";
import type { AdminPaymentAttemptQueueItem } from "./admin-payment-attempts.types";

type AttemptRow = Record<string, unknown>;

const isoDateTime = (value: unknown): string => value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();

const toQueueItem = (row: AttemptRow): AdminPaymentAttemptQueueItem => ({
    attemptId: String(row.id),
    providerOrderCode: String(row.provider_order_code),
    paymentState: String(row.payment_state),
    orderState: String(row.order_state),
    resolutionState: String(row.resolution_state),
    expectedAmountVnd: Number(row.expected_amount_vnd),
    receivedAmountVnd: Number(row.verified_received_amount_vnd),
    refundedAmountVnd: Number(row.refunded_amount_vnd ?? 0),
    refundableAmountVnd: Math.max(0, Number(row.verified_received_amount_vnd) - Number(row.refunded_amount_vnd ?? 0)),
    pendingCheckoutId: Number(row.pending_checkout_id),
    createdAt: isoDateTime(row.created_at),
    updatedAt: isoDateTime(row.updated_at),
});

@Injectable()
export class AdminPaymentAttemptsRepository {
    async listExceptions(tx: TransactionContext, input: { page: number; limit: number }) {
        const rows = await tx.query<AttemptRow[]>(
            `SELECT a.id, a.provider_order_code, a.payment_state, a.order_state, a.resolution_state,
                    a.expected_amount_vnd, a.verified_received_amount_vnd, a.pending_checkout_id,
                    a.created_at, a.updated_at, COALESCE(r.refunded_amount_vnd, 0) AS refunded_amount_vnd
             FROM payment_attempts a
             LEFT JOIN (SELECT attempt_id, SUM(amount_vnd) AS refunded_amount_vnd
                        FROM payment_attempt_refunds GROUP BY attempt_id) r ON r.attempt_id = a.id
             WHERE a.provider = 'payos' AND a.payment_state IN ('PAID', 'MISMATCH') AND a.order_id IS NULL
               AND a.order_state <> 'CREATED'
               AND a.resolution_state <> 'RESOLVED'
             ORDER BY a.updated_at DESC, a.id DESC LIMIT ? OFFSET ?`,
            [input.limit, (input.page - 1) * input.limit],
        );
        const count = await tx.query<Array<{ total: number | string }>>(
            `SELECT COUNT(*) AS total FROM payment_attempts a
             WHERE a.provider = 'payos' AND a.payment_state IN ('PAID', 'MISMATCH') AND a.order_id IS NULL
               AND a.order_state <> 'CREATED'
               AND a.resolution_state <> 'RESOLVED'`,
        );
        const total = Number(count[0]?.total ?? 0);
        return { items: rows.map(toQueueItem), pagination: { page: input.page, limit: input.limit, total, totalPages: Math.ceil(total / input.limit) } };
    }

    async getExceptionDetail(tx: TransactionContext, attemptId: string) {
        const rows = await tx.query<AttemptRow[]>(
            `SELECT a.id, a.provider_order_code, a.payment_state, a.order_state, a.resolution_state,
                    a.expected_amount_vnd, a.verified_received_amount_vnd, a.pending_checkout_id,
                    a.created_at, a.updated_at, a.currency, a.display_snapshot,
                    COALESCE(r.refunded_amount_vnd, 0) AS refunded_amount_vnd
             FROM payment_attempts a
             LEFT JOIN (SELECT attempt_id, SUM(amount_vnd) AS refunded_amount_vnd
                        FROM payment_attempt_refunds GROUP BY attempt_id) r ON r.attempt_id = a.id
             WHERE a.id = ? AND a.provider = 'payos' AND a.payment_state IN ('PAID', 'MISMATCH') AND a.order_id IS NULL
               AND a.order_state <> 'CREATED'
               AND a.resolution_state <> 'RESOLVED' LIMIT 1`, [attemptId],
        );
        const row = rows[0];
        if (!row) return null;
        const refunds = await tx.query<AttemptRow[]>(
            `SELECT id, amount_vnd, transfer_reference,
                    DATE_FORMAT(transferred_at, '%Y-%m-%d') AS transferred_at, evidence_id, reason,
                    DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%s.000Z') AS created_at
             FROM payment_attempt_refunds WHERE attempt_id = ? ORDER BY created_at DESC, id DESC`, [attemptId],
        );
        const snapshot = typeof row.display_snapshot === "string" ? JSON.parse(row.display_snapshot) : row.display_snapshot;
        const itemSnapshot = snapshot && typeof snapshot === "object" ? snapshot as Record<string, unknown> : {};
        const evidenceUrl = (id: number) => `/api/admin/evidence/${id}`;
        return {
            ...toQueueItem(row),
            currency: String(row.currency || "VND"),
            items: Array.isArray(itemSnapshot.items) ? itemSnapshot.items.map((item) => {
                const value = item && typeof item === "object" ? item as Record<string, unknown> : {};
                return {
                    productId: Number(value.productId), name: String(value.name || ""),
                    quantity: Number(value.quantity), unitPriceVnd: Number(value.unitPriceVnd),
                };
            }) : [],
            subtotalVnd: Number(itemSnapshot.subtotalVnd || 0),
            discountVnd: Number(itemSnapshot.discountVnd || 0),
            shippingVnd: Number(itemSnapshot.shippingVnd || 0),
            payableVnd: Number(row.expected_amount_vnd),
            refunds: refunds.map((refund) => ({
                operationId: String(refund.id), amountVnd: Number(refund.amount_vnd), transferReference: String(refund.transfer_reference),
                transferredAt: String(refund.transferred_at), evidenceId: Number(refund.evidence_id), evidenceUrl: evidenceUrl(Number(refund.evidence_id)),
                reason: String(refund.reason), createdAt: String(refund.created_at),
            })),
        };
    }

    async lockAttemptForResolution(tx: TransactionContext, attemptId: string) {
        const rows = await tx.query<AttemptRow[]>(
            `SELECT id, provider, pending_checkout_id, provider_order_code, provider_link_id, expected_amount_vnd,
                    verified_received_amount_vnd, payment_state, order_state, resolution_state, order_id,
                    cancel_requested_at, created_at, updated_at
             FROM payment_attempts WHERE id = ? LIMIT 1 FOR UPDATE`, [attemptId],
        );
        const row = rows[0];
        if (!row) return null;
        return {
            id: String(row.id), provider: String(row.provider), pendingCheckoutId: Number(row.pending_checkout_id), providerOrderCode: String(row.provider_order_code),
            providerLinkId: row.provider_link_id == null ? null : String(row.provider_link_id), expectedAmountVnd: Number(row.expected_amount_vnd),
            verifiedReceivedAmountVnd: Number(row.verified_received_amount_vnd), paymentState: String(row.payment_state),
            orderState: String(row.order_state), resolutionState: String(row.resolution_state), orderId: row.order_id == null ? null : Number(row.order_id),
            cancelRequestedAt: row.cancel_requested_at ?? null,
        };
    }

    async getRefundByIdempotency(tx: TransactionContext, idempotencyKey: string) {
        const rows = await tx.query<AttemptRow[]>(
            `SELECT id, attempt_id, amount_vnd, transfer_reference,
                    DATE_FORMAT(transferred_at, '%Y-%m-%d') AS transferred_at, evidence_id, actor_id, reason
             FROM payment_attempt_refunds WHERE idempotency_key = ? LIMIT 1`, [idempotencyKey],
        );
        const row = rows[0];
        return row ? {
            operationId: String(row.id), attemptId: String(row.attempt_id), amountVnd: Number(row.amount_vnd),
            transferReference: String(row.transfer_reference), transferredAt: String(row.transferred_at),
            evidenceId: Number(row.evidence_id), actorId: String(row.actor_id), reason: String(row.reason),
        } : null;
    }

    async lockRefundSummary(tx: TransactionContext, attemptId: string) {
        const rows = await tx.query<AttemptRow[]>(
            `SELECT id, provider, payment_state, resolution_state, order_id, expected_amount_vnd, verified_received_amount_vnd
             FROM payment_attempts WHERE id = ? LIMIT 1 FOR UPDATE`, [attemptId],
        );
        if (!rows[0]) return null;
        const refundRows = await tx.query<Array<{ id: string; amount_vnd: number | string }>>(
            `SELECT id, amount_vnd FROM payment_attempt_refunds WHERE attempt_id = ? ORDER BY id FOR UPDATE`, [attemptId],
        );
        return {
            provider: String(rows[0].provider), paymentState: String(rows[0].payment_state), resolutionState: String(rows[0].resolution_state),
            orderId: rows[0].order_id == null ? null : Number(rows[0].order_id),
            expectedAmountVnd: Number(rows[0].expected_amount_vnd), receivedAmountVnd: Number(rows[0].verified_received_amount_vnd),
            refundedAmountVnd: refundRows.reduce((total, refund) => total + Number(refund.amount_vnd), 0),
        };
    }

    async setResolutionState(tx: TransactionContext, attemptId: string, state: "OPEN" | "RESOLVED") {
        await tx.query(
            `UPDATE payment_attempts SET resolution_state = ?, updated_at = UTC_TIMESTAMP(3)
             WHERE id = ? AND order_id IS NULL`, [state, attemptId],
        );
    }

    async recordAdminRetry(tx: TransactionContext, attempt: { pendingCheckoutId: number; providerLinkId: string; expectedAmountVnd: number; receivedAmountVnd: number }, actorId: string, reason: string) {
        await tx.query(
            `INSERT INTO payment_reconciliation_attempts
                (provider, pending_checkout_id, requested_by, outcome, local_status, provider_status,
                 expected_amount, provider_amount, expected_currency, provider_currency, provider_reference, mismatch_reason)
             VALUES ('payos', ?, ?, 'ADMIN_RETRY', 'REVIEW_REQUIRED', 'PAID', ?, ?, 'VND', 'VND', ?, ?)`,
            [attempt.pendingCheckoutId, actorId, attempt.expectedAmountVnd, attempt.receivedAmountVnd, attempt.providerLinkId, reason],
        );
    }
}
