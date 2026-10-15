import { ConflictException, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { InsertResult } from "#src/shared/interfaces/domain";
import type { TransactionContext } from "../database/transaction";
import { PAYMENT_ATTEMPT_ORDER_STATE, PAYMENT_ATTEMPT_PAYMENT_STATE, PAYMENT_ATTEMPT_RESOLUTION_STATE } from "./payment-attempt.types";
import type {
    PaymentAttemptClaim,
    PaymentAttemptObservationInput,
    PaymentAttemptObservationResult,
    PaymentAttemptProjection,
    PaymentAttemptRefundInput,
    PaymentAttemptRefundResult,
} from "./payment-attempt.types";

type ClaimInsert = {
    id: string;
    ownerScope: string;
    idempotencyKeyHash: string;
    requestHash: string;
    snapshotHash: string;
    pendingCheckoutId: number;
    providerOrderCode: string;
    expectedAmountVnd: number;
    expiresAt: Date;
    snapshot: unknown;
};

type PaymentAttemptRow = {
    id: string;
    owner_scope: string;
    idempotency_key_hash: string;
    request_hash: string;
    snapshot_hash: string;
    pending_checkout_id: number;
    provider_order_code: string | number | bigint;
    expected_amount_vnd: string | number | bigint;
    payment_state: string;
    order_state: string;
    resolution_state: string;
    provider_link_id?: string | null;
    provider_link_url?: string | null;
    expires_at?: Date | string;
};

type RefundBalance = { verified_received_amount_vnd: string | number | bigint; refunded_amount_vnd: string | number | bigint; order_id: number | null };
type LockedAttemptBinding = { provider_order_code: string | number | bigint; provider_link_id: string | null; expected_amount_vnd: string | number | bigint };

function isDuplicateKey(error: unknown): boolean {
    return (error as { errno?: number; code?: string })?.errno === 1062 || (error as { code?: string })?.code === "ER_DUP_ENTRY";
}

function isSafePositiveVnd(value: number | null | undefined): value is number {
    return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function mapClaim(row: PaymentAttemptRow): PaymentAttemptClaim {
    return {
        id: row.id,
        ownerScope: row.owner_scope,
        idempotencyKeyHash: row.idempotency_key_hash,
        requestHash: row.request_hash,
        snapshotHash: row.snapshot_hash,
        pendingCheckoutId: Number(row.pending_checkout_id),
        providerOrderCode: String(row.provider_order_code),
        expectedAmountVnd: Number(row.expected_amount_vnd),
        paymentState: row.payment_state as PaymentAttemptClaim["paymentState"],
        orderState: row.order_state as PaymentAttemptClaim["orderState"],
        resolutionState: row.resolution_state as PaymentAttemptClaim["resolutionState"],
        providerLinkId: row.provider_link_id == null ? null : String(row.provider_link_id),
        providerLinkUrl: row.provider_link_url == null ? null : String(row.provider_link_url),
        expiresAt: row.expires_at == null ? null : new Date(row.expires_at).toISOString(),
        replayed: false,
    };
}

export class PaymentAttemptOrderCodeCollisionError extends Error {
    constructor() {
        super("Payment attempt provider order code collision");
        this.name = "PaymentAttemptOrderCodeCollisionError";
    }
}

export class PaymentAttemptClaimCollisionError extends Error {
    constructor() {
        super("Payment attempt claim already exists");
        this.name = "PaymentAttemptClaimCollisionError";
    }
}

@Injectable()
export class PaymentAttemptRepository {
    async findClaimByOwnerAndKey(tx: TransactionContext, ownerScope: string, idempotencyKeyHash: string): Promise<PaymentAttemptClaim | null> {
        const rows = await tx.query<PaymentAttemptRow[]>(
            `SELECT id, owner_scope, idempotency_key_hash, request_hash, snapshot_hash, pending_checkout_id,
                    provider_order_code, expected_amount_vnd, payment_state, order_state, resolution_state,
                    provider_link_id, provider_link_url, expires_at
             FROM payment_attempts WHERE owner_scope = ? AND idempotency_key_hash = ? LIMIT 1`,
            [ownerScope, idempotencyKeyHash],
        );
        return rows[0] ? mapClaim(rows[0]) : null;
    }

    async findClaim(tx: TransactionContext, ownerScope: string, idempotencyKeyHash: string): Promise<PaymentAttemptClaim | null> {
        const rows = await tx.query<PaymentAttemptRow[]>(
            `SELECT id, owner_scope, idempotency_key_hash, request_hash, snapshot_hash, pending_checkout_id,
                    provider_order_code, expected_amount_vnd, payment_state, order_state, resolution_state,
                    provider_link_id, provider_link_url, expires_at
             FROM payment_attempts WHERE owner_scope = ? AND idempotency_key_hash = ? LIMIT 1 FOR UPDATE`,
            [ownerScope, idempotencyKeyHash],
        );
        return rows[0] ? mapClaim(rows[0]) : null;
    }

    async insertClaim(tx: TransactionContext, input: ClaimInsert): Promise<PaymentAttemptClaim> {
        try {
            await tx.query<InsertResult>(
                `INSERT INTO payment_attempts
                    (id, owner_scope, idempotency_key_hash, request_hash, snapshot_hash, pending_checkout_id,
                     provider, provider_order_code, expected_amount_vnd, currency, payment_state, order_state,
                     resolution_state, display_snapshot, expires_at)
                 VALUES (?, ?, ?, ?, ?, ?, 'payos', ?, ?, 'VND', ?, ?, ?, ?, ?)`,
                [input.id, input.ownerScope, input.idempotencyKeyHash, input.requestHash, input.snapshotHash, input.pendingCheckoutId,
                    input.providerOrderCode, input.expectedAmountVnd, PAYMENT_ATTEMPT_PAYMENT_STATE.PENDING,
                    PAYMENT_ATTEMPT_ORDER_STATE.NOT_CREATED, PAYMENT_ATTEMPT_RESOLUTION_STATE.NONE, JSON.stringify(input.snapshot), input.expiresAt],
            );
        } catch (error) {
            if (!isDuplicateKey(error)) throw error;
            const message = String((error as { message?: string })?.message || "");
            if (message.includes("uq_payment_attempts_provider_order_code") || message.includes("uq_payment_attempts_provider_code")) {
                throw new PaymentAttemptOrderCodeCollisionError();
            }
            throw new PaymentAttemptClaimCollisionError();
        }
        const rows = await tx.query<PaymentAttemptRow[]>(
            `SELECT id, owner_scope, idempotency_key_hash, request_hash, snapshot_hash, pending_checkout_id,
                    provider_order_code, expected_amount_vnd, payment_state, order_state, resolution_state,
                    provider_link_id, provider_link_url, expires_at
             FROM payment_attempts WHERE id = ? LIMIT 1`, [input.id],
        );
        if (!rows[0]) throw new Error("Payment attempt insert did not persist");
        return mapClaim(rows[0]);
    }

    async acquireCreateLease(tx: TransactionContext, attemptId: string, leaseToken: string, leaseUntil: Date): Promise<boolean> {
        const result = await tx.query<{ affectedRows?: number }>(
            `UPDATE payment_attempts
             SET create_lease_token = ?, create_lease_until = ?, updated_at = UTC_TIMESTAMP(3)
             WHERE id = ? AND provider_link_id IS NULL
               AND (create_lease_until IS NULL OR create_lease_until <= UTC_TIMESTAMP(3))
               AND payment_state IN ('PENDING', 'UNKNOWN')`,
            [leaseToken, leaseUntil, attemptId],
        );
        return result.affectedRows === 1;
    }

    async saveProviderLink(tx: TransactionContext, input: { attemptId: string; leaseToken: string; providerOrderCode: string; providerLinkId: string; providerLinkUrl: string; amountVnd: number }): Promise<boolean> {
        const rows = await tx.query<LockedAttemptBinding[]>(
            `SELECT provider_order_code, provider_link_id, expected_amount_vnd
             FROM payment_attempts WHERE id = ? AND create_lease_token = ? LIMIT 1 FOR UPDATE`, [input.attemptId, input.leaseToken],
        );
        const attempt = rows[0];
        if (!attempt || String(attempt.provider_order_code) !== input.providerOrderCode || Number(attempt.expected_amount_vnd) !== input.amountVnd) return false;
        if (attempt.provider_link_id && attempt.provider_link_id !== input.providerLinkId) return false;
        await tx.query(
            `UPDATE payment_attempts
             SET provider_link_id = ?, provider_link_url = ?, create_lease_token = NULL, create_lease_until = NULL, updated_at = UTC_TIMESTAMP(3)
             WHERE id = ? AND create_lease_token = ? AND provider_order_code = ? AND expected_amount_vnd = ?`,
            [input.providerLinkId, input.providerLinkUrl, input.attemptId, input.leaseToken, input.providerOrderCode, input.amountVnd],
        );
        return true;
    }

    async recordObservation(tx: TransactionContext, input: PaymentAttemptObservationInput & { payloadHash: string }): Promise<PaymentAttemptObservationResult> {
        const locked = await tx.query<Array<{ id: string; payment_state: string; order_state: string; resolution_state: string; order_id: number | null; verified_received_amount_vnd: string | number | bigint; provider_order_code: string | number | bigint; provider_link_id: string | null; expected_amount_vnd: string | number | bigint }>>(
            `SELECT id, payment_state, order_state, resolution_state, order_id, verified_received_amount_vnd,
                    provider_order_code, provider_link_id, expected_amount_vnd
             FROM payment_attempts WHERE id = ? LIMIT 1 FOR UPDATE`, [input.attemptId],
        );
        const attempt = locked[0];
        if (!attempt) throw new ConflictException("Payment attempt not found");
        const matchingKeys = await tx.query<Array<{ payload_hash: string }>>(
            `SELECT payload_hash FROM payment_attempt_observations
             WHERE attempt_id = ? AND source = ? AND source_key = ? FOR UPDATE`,
            [input.attemptId, input.source, input.sourceKey],
        );
        const same = matchingKeys.some((row) => row.payload_hash === input.payloadHash);
        const identityConflict = input.providerOrderCode == null
            || String(attempt.provider_order_code) !== String(input.providerOrderCode)
            || Number(attempt.expected_amount_vnd) !== input.expectedAmountVnd
            || Boolean(attempt.provider_link_id && attempt.provider_link_id !== input.providerLinkId);
        const currencyConflict = input.source === "LOOKUP"
            ? input.currency !== null
            : input.currency !== "VND";
        const currencyVerified = input.source === "LOOKUP"
            ? input.currency === null
            : input.currency === "VND";
        const trustedPaidReceipt = input.verified && input.normalizedStatus.toUpperCase() === PAYMENT_ATTEMPT_PAYMENT_STATE.PAID
            && !identityConflict && currencyVerified && !currencyConflict && Boolean(input.providerLinkId)
            && isSafePositiveVnd(input.reportedAmountVnd) && isSafePositiveVnd(input.paidAmountVnd);
        const exactPaidReceipt = trustedPaidReceipt
            && input.reportedAmountVnd === input.expectedAmountVnd && input.paidAmountVnd === input.expectedAmountVnd;
        const sourceKeyConflict = matchingKeys.length > 0 && !same;
        const normalizedStatus = input.normalizedStatus.toUpperCase();
        const terminalCancellationStatus = [PAYMENT_ATTEMPT_PAYMENT_STATE.CANCELLED, PAYMENT_ATTEMPT_PAYMENT_STATE.EXPIRED, "CANCELED"].includes(normalizedStatus as never);
        const cancellationEvidenceConflict = input.verified && terminalCancellationStatus
            && (identityConflict || currencyConflict || sourceKeyConflict || !input.providerLinkId
                || input.reportedAmountVnd !== input.expectedAmountVnd || input.providerReportsNoPaidFunds !== true
                || (input.paidAmountVnd != null && input.paidAmountVnd !== 0)
                || Number(attempt.verified_received_amount_vnd) > 0 || attempt.payment_state === PAYMENT_ATTEMPT_PAYMENT_STATE.PAID || attempt.order_id != null);
        const conflicting = sourceKeyConflict || identityConflict || currencyConflict
            || cancellationEvidenceConflict
            || (input.verified && normalizedStatus === PAYMENT_ATTEMPT_PAYMENT_STATE.PAID && !exactPaidReceipt);
        const verifiedCancellationIntent = input.verified && !identityConflict && !currencyConflict && !sourceKeyConflict
            && input.providerLinkId != null && input.reportedAmountVnd === input.expectedAmountVnd
            && input.providerReportsNoPaidFunds === true && (input.paidAmountVnd == null || input.paidAmountVnd === 0)
            && attempt.payment_state !== PAYMENT_ATTEMPT_PAYMENT_STATE.PAID
            && attempt.order_id == null
            && terminalCancellationStatus && !cancellationEvidenceConflict;
        if (same) return this.observationProjection(attempt, false, false);

        await tx.query<InsertResult>(
            `INSERT INTO payment_attempt_observations
                (attempt_id, source, source_key, payload_hash, provider_order_code, provider_link_id,
                 expected_amount_vnd, reported_amount_vnd, paid_amount_vnd, currency, normalized_status, verified, verified_at, sanitized_reason)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [input.attemptId, input.source, input.sourceKey, input.payloadHash, input.providerOrderCode ?? null, input.providerLinkId ?? null,
                input.expectedAmountVnd, input.reportedAmountVnd ?? null, input.paidAmountVnd ?? null, input.currency ?? null, input.normalizedStatus,
                input.verified ? 1 : 0, input.verifiedAt ?? null, input.sanitizedReason ?? null],
        );

        const nextState = conflicting
            ? (attempt.payment_state === PAYMENT_ATTEMPT_PAYMENT_STATE.PAID ? PAYMENT_ATTEMPT_PAYMENT_STATE.PAID : PAYMENT_ATTEMPT_PAYMENT_STATE.MISMATCH)
            : this.normalizePaymentState(input.normalizedStatus, input.verified, exactPaidReceipt, attempt.payment_state);
        const verifiedProviderLink = input.verified && !identityConflict && !currencyConflict && !sourceKeyConflict
            && input.providerLinkId && !attempt.provider_link_id
            && input.reportedAmountVnd === input.expectedAmountVnd
            && ["PAID", "PENDING", "CANCELLED", "CANCELED", "EXPIRED"].includes(input.normalizedStatus.toUpperCase());
        if (verifiedProviderLink) {
            await tx.query(
                `UPDATE payment_attempts SET provider_link_id = ?, updated_at = UTC_TIMESTAMP(3)
                 WHERE id = ? AND provider_link_id IS NULL`, [input.providerLinkId, input.attemptId],
            );
        }
        await tx.query(
            `UPDATE payment_attempts
             SET payment_state = ?,
                 order_state = CASE WHEN ? = 1 AND order_state <> '${PAYMENT_ATTEMPT_ORDER_STATE.CREATED}' THEN '${PAYMENT_ATTEMPT_ORDER_STATE.REVIEW_REQUIRED}' ELSE order_state END,
                 resolution_state = CASE WHEN ? = 1 AND resolution_state = '${PAYMENT_ATTEMPT_RESOLUTION_STATE.NONE}' THEN '${PAYMENT_ATTEMPT_RESOLUTION_STATE.OPEN}' ELSE resolution_state END,
                 cancel_requested_at = CASE WHEN ? = 1 THEN COALESCE(cancel_requested_at, ?) ELSE cancel_requested_at END,
                 verified_received_amount_vnd = LEAST(9007199254740991, GREATEST(verified_received_amount_vnd, ?)),
                 last_checked_at = COALESCE(?, UTC_TIMESTAMP()), updated_at = UTC_TIMESTAMP()
             WHERE id = ?`,
            [nextState, conflicting ? 1 : 0, conflicting ? 1 : 0, verifiedCancellationIntent ? 1 : 0, input.verifiedAt ?? new Date(),
                trustedPaidReceipt && !sourceKeyConflict ? input.paidAmountVnd : 0, input.verifiedAt ?? null, input.attemptId],
        );
        const projected = await tx.query<Array<{ id: string; payment_state: string; order_state: string; resolution_state: string; order_id: number | null; verified_received_amount_vnd: string | number | bigint; provider_order_code: string | number | bigint; provider_link_id: string | null; expected_amount_vnd: string | number | bigint }>>(
            `SELECT id, payment_state, order_state, resolution_state, order_id, verified_received_amount_vnd
             FROM payment_attempts WHERE id = ? LIMIT 1`, [input.attemptId],
        );
        return this.observationProjection(projected[0] || attempt, true, conflicting);
    }

    async getOwnedStatus(tx: TransactionContext, attemptId: string, ownerScope: string) {
        const rows = await tx.query<Array<Record<string, unknown>>>(
            `SELECT id, pending_checkout_id, provider_order_code, expected_amount_vnd, payment_state, order_state, resolution_state, order_id,
                    display_snapshot, expires_at, last_checked_at, retry_after_seconds, provider_link_url
             FROM payment_attempts WHERE id = ? AND owner_scope = ? LIMIT 1`, [attemptId, ownerScope],
        );
        const row = rows[0];
        if (!row) return null;
        let snapshot: unknown = row.display_snapshot;
        if (typeof snapshot === "string") snapshot = JSON.parse(snapshot);
        return {
            id: String(row.id),
            pendingCheckoutId: Number(row.pending_checkout_id),
            providerOrderCode: String(row.provider_order_code),
            expectedAmountVnd: Number(row.expected_amount_vnd),
            paymentState: row.payment_state as PaymentAttemptProjection["paymentState"],
            orderState: row.order_state as PaymentAttemptProjection["orderState"],
            resolutionState: row.resolution_state as PaymentAttemptProjection["resolutionState"],
            orderId: row.order_id == null ? null : Number(row.order_id),
            snapshot,
            expiresAt: row.expires_at as Date,
            lastCheckedAt: row.last_checked_at as Date | null,
            retryAfterSeconds: row.retry_after_seconds == null ? null : Number(row.retry_after_seconds),
            providerLinkUrl: row.provider_link_url == null ? null : String(row.provider_link_url),
        };
    }

    async requestOwnedCancellation(tx: TransactionContext, attemptId: string, ownerScope: string) {
        const rows = await tx.query<Array<{
            id: string; owner_scope: string; pending_checkout_id: number; provider_order_code: string | number;
            expected_amount_vnd: string | number; expires_at: Date | string; order_state: string;
            provider_link_id: string | null; cancel_requested_at: Date | string | null; order_id: number | null;
        }>>(
            `SELECT id, owner_scope, pending_checkout_id, provider_order_code, expected_amount_vnd, expires_at,
                    order_state, provider_link_id, cancel_requested_at, order_id
             FROM payment_attempts WHERE id = ? AND owner_scope = ? LIMIT 1 FOR UPDATE`, [attemptId, ownerScope],
        );
        const attempt = rows[0];
        if (!attempt) return null;
        let cancelRequestedAt = attempt.cancel_requested_at;
        if (attempt.order_state !== PAYMENT_ATTEMPT_ORDER_STATE.CREATED) {
            await tx.query(
                `UPDATE payment_attempts SET cancel_requested_at = COALESCE(cancel_requested_at, UTC_TIMESTAMP(3)), updated_at = UTC_TIMESTAMP(3)
                 WHERE id = ? AND order_state <> ?`, [attemptId, PAYMENT_ATTEMPT_ORDER_STATE.CREATED],
            );
            const persisted = await tx.query<Array<{ cancel_requested_at: Date | string | null }>>(
                "SELECT cancel_requested_at FROM payment_attempts WHERE id = ? LIMIT 1", [attemptId],
            );
            cancelRequestedAt = persisted[0]?.cancel_requested_at ?? null;
        }
        return {
            attemptId: String(attempt.id),
            pendingCheckoutId: Number(attempt.pending_checkout_id),
            providerOrderCode: String(attempt.provider_order_code),
            expectedAmountVnd: Number(attempt.expected_amount_vnd),
            expiresAt: new Date(attempt.expires_at).toISOString(),
            orderState: attempt.order_state,
            orderId: attempt.order_id == null ? null : Number(attempt.order_id),
            providerLinkId: attempt.provider_link_id,
            cancelRequestedAt: cancelRequestedAt == null ? null : new Date(cancelRequestedAt).toISOString(),
        };
    }

    async claimOwnedReconciliationRequest(tx: TransactionContext, attemptId: string, ownerScope: string, now: Date) {
        const rows = await tx.query<Array<{
            id: string; pending_checkout_id: number; provider_order_code: string | number;
            expires_at: Date | string; reconcile_requested_at: Date | string | null;
        }>>(
            `SELECT id, pending_checkout_id, provider_order_code, expires_at, reconcile_requested_at
             FROM payment_attempts WHERE id = ? AND owner_scope = ? LIMIT 1 FOR UPDATE`, [attemptId, ownerScope],
        );
        const attempt = rows[0];
        if (!attempt) return null;
        const lastRequestedAt = attempt.reconcile_requested_at == null ? null : new Date(attempt.reconcile_requested_at);
        const remainingMs = lastRequestedAt ? 15_000 - (now.getTime() - lastRequestedAt.getTime()) : 0;
        if (remainingMs > 0) {
            return { coalesced: true, retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1000)) };
        }
        await tx.query("UPDATE payment_attempts SET reconcile_requested_at = ?, updated_at = UTC_TIMESTAMP(3) WHERE id = ?", [now, attemptId]);
        return {
            coalesced: false,
            retryAfterSeconds: 15,
            pendingCheckoutId: Number(attempt.pending_checkout_id),
            providerOrderCode: String(attempt.provider_order_code),
            expiresAt: new Date(attempt.expires_at).toISOString(),
        };
    }

    async getCancellationTaskAttempt(tx: TransactionContext, attemptId: string) {
        const rows = await tx.query<Array<{
            id: string; pending_checkout_id: number; provider_order_code: string | number;
            expected_amount_vnd: string | number; provider_link_id: string | null;
            cancel_requested_at: Date | string | null; order_state: string;
        }>>(
            `SELECT id, pending_checkout_id, provider_order_code, expected_amount_vnd, provider_link_id,
                    cancel_requested_at, order_state
             FROM payment_attempts WHERE id = ? AND cancel_requested_at IS NOT NULL LIMIT 1`, [attemptId],
        );
        const attempt = rows[0];
        return attempt ? {
            id: String(attempt.id), pendingCheckoutId: Number(attempt.pending_checkout_id),
            providerOrderCode: String(attempt.provider_order_code), expectedAmountVnd: Number(attempt.expected_amount_vnd),
            providerLinkId: attempt.provider_link_id, cancelRequestedAt: attempt.cancel_requested_at == null ? null : new Date(attempt.cancel_requested_at).toISOString(),
            orderState: attempt.order_state,
        } : null;
    }

    async releaseCancelledCheckout(tx: TransactionContext, pendingCheckoutId: number): Promise<void> {
        await tx.query(
            `UPDATE pending_checkouts SET status = 'RELEASED'
             WHERE id = ? AND status IN ('PENDING', 'EXPIRED') AND consumed_at IS NULL`, [pendingCheckoutId],
        );
        await tx.query(
            "UPDATE discount_redemptions SET status = 'RELEASED' WHERE pending_checkout_id = ? AND status = 'RESERVED'",
            [pendingCheckoutId],
        );
    }

    async findRefundByIdempotency(tx: TransactionContext, idempotencyKey: string, currentRead = false) {
        const rows = await tx.query<Array<{
            id: string; attempt_id: string; amount_vnd: string | number | bigint; transfer_reference: string;
            transferred_at: string; evidence_id: number | string; actor_id: string; reason: string;
        }>>(
            `SELECT id, attempt_id, amount_vnd, transfer_reference,
                    DATE_FORMAT(transferred_at, '%Y-%m-%d') AS transferred_at, evidence_id, actor_id, reason
             FROM payment_attempt_refunds WHERE idempotency_key = ? LIMIT 1${currentRead ? " FOR UPDATE" : ""}`, [idempotencyKey],
        );
        return rows[0] ? {
            operationId: String(rows[0].id), attemptId: rows[0].attempt_id, amountVnd: Number(rows[0].amount_vnd),
            transferReference: rows[0].transfer_reference, transferredAt: rows[0].transferred_at,
            evidenceId: Number(rows[0].evidence_id), actorId: rows[0].actor_id, reason: rows[0].reason,
        } : null;
    }

    async lockRefundBalance(tx: TransactionContext, attemptId: string) {
        const rows = await tx.query<RefundBalance[]>(
            `SELECT verified_received_amount_vnd, order_id FROM payment_attempts WHERE id = ? LIMIT 1 FOR UPDATE`, [attemptId],
        );
        if (!rows[0]) return null;
        const refunds = await tx.query<Array<{ id: string; amount_vnd: string | number | bigint }>>(
            `SELECT id, amount_vnd FROM payment_attempt_refunds WHERE attempt_id = ? ORDER BY id FOR UPDATE`, [attemptId],
        );
        return {
            verifiedReceivedAmountVnd: Number(rows[0].verified_received_amount_vnd),
            refundedAmountVnd: refunds.reduce((total, refund) => total + Number(refund.amount_vnd), 0),
            orderId: rows[0].order_id,
        };
    }

    async insertRefund(tx: TransactionContext, input: PaymentAttemptRefundInput): Promise<PaymentAttemptRefundResult> {
        const operationId = randomUUID();
        try {
            await tx.query<InsertResult>(
                `INSERT INTO payment_attempt_refunds
                    (id, attempt_id, transfer_reference, idempotency_key, amount_vnd, currency, transferred_at, evidence_id, actor_id, reason)
                 VALUES (?, ?, ?, ?, ?, 'VND', ?, ?, ?, ?)`,
                [operationId, input.attemptId, input.transferReference, input.idempotencyKey, input.amountVnd, input.transferredAt, input.evidenceId, input.actorId, input.reason],
            );
        } catch (error) {
            if (isDuplicateKey(error)) throw new ConflictException("Refund reference or idempotency key already exists");
            throw error;
        }
        return { operationId, amountVnd: input.amountVnd, replayed: false };
    }

    private observationProjection(row: { id: string; payment_state: string; order_state: string; resolution_state: string; order_id: number | null; verified_received_amount_vnd: string | number | bigint }, inserted: boolean, conflicting: boolean): PaymentAttemptProjection {
        return { id: row.id, paymentState: row.payment_state as PaymentAttemptProjection["paymentState"], orderState: row.order_state as PaymentAttemptProjection["orderState"], resolutionState: row.resolution_state as PaymentAttemptProjection["resolutionState"], verifiedReceivedAmountVnd: Number(row.verified_received_amount_vnd), orderId: row.order_id, inserted, conflicting };
    }

    private normalizePaymentState(status: string, verified: boolean, exactPaidReceipt: boolean, current: string): string {
        const normalized = status.toUpperCase();
        if (current === PAYMENT_ATTEMPT_PAYMENT_STATE.PAID) return current;
        if (!verified) return current === PAYMENT_ATTEMPT_PAYMENT_STATE.UNKNOWN ? current : PAYMENT_ATTEMPT_PAYMENT_STATE.UNKNOWN;
        if (normalized === PAYMENT_ATTEMPT_PAYMENT_STATE.PAID) return exactPaidReceipt ? PAYMENT_ATTEMPT_PAYMENT_STATE.PAID : PAYMENT_ATTEMPT_PAYMENT_STATE.MISMATCH;
        if (Object.values(PAYMENT_ATTEMPT_PAYMENT_STATE).includes(normalized as never)) return normalized;
        return PAYMENT_ATTEMPT_PAYMENT_STATE.UNKNOWN;
    }
}
