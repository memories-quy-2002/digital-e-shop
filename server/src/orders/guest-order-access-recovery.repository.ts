import { Injectable } from "@nestjs/common";
import { withTransaction, type TransactionContext } from "#src/database/transaction";

export type GuestRecoveryOrder = { id: number; guest_email: string; guest_name: string | null; contact_snapshot: string | object | null };
export type GuestRecoveryChallenge = {
    id: string;
    email_hash: string;
    otp_hash: string;
    attempt_count: number | string;
    guest_email: string;
};

@Injectable()
export class GuestOrderAccessRecoveryRepository {
    withTransaction<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T> { return withTransaction(work); }

    async findOrderForRequest(tx: TransactionContext, orderId: number): Promise<GuestRecoveryOrder | null> {
        const [row] = await tx.query<GuestRecoveryOrder[]>(
            `SELECT id, guest_email, guest_name, contact_snapshot
             FROM orders WHERE id = ? AND user_id IS NULL LIMIT 1 FOR UPDATE`,
            [orderId],
        );
        return row || null;
    }

    async findLatestChallenge(tx: TransactionContext, orderId: number, emailHash: string): Promise<{ resend_after: string } | null> {
        const [row] = await tx.query<Array<{ resend_after: string }>>(
            `SELECT DATE_FORMAT(resend_after, '%Y-%m-%dT%H:%i:%s.%fZ') AS resend_after FROM guest_order_access_recovery_challenges
             WHERE order_id = ? AND email_hash = ? ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE`,
            [orderId, emailHash],
        );
        return row || null;
    }

    async countRecentChallenges(tx: TransactionContext, orderId: number, emailHash: string): Promise<number> {
        const [row] = await tx.query<Array<{ total: number | string }>>(
            `SELECT COUNT(*) AS total FROM guest_order_access_recovery_challenges
             WHERE order_id = ? AND email_hash = ? AND created_at >= DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 HOUR)`,
            [orderId, emailHash],
        );
        return Number(row?.total || 0);
    }

    invalidateChallenges(tx: TransactionContext, orderId: number, emailHash: string) {
        return tx.query(
            `UPDATE guest_order_access_recovery_challenges SET used_at = UTC_TIMESTAMP(3)
             WHERE order_id = ? AND email_hash = ? AND used_at IS NULL`,
            [orderId, emailHash],
        );
    }

    insertChallenge(tx: TransactionContext, input: { id: string; orderId: number; emailHash: string; otpHash: string }) {
        return tx.query(
            `INSERT INTO guest_order_access_recovery_challenges
                (id, order_id, email_hash, otp_hash, attempt_count, expires_at, resend_after)
             VALUES (?, ?, ?, ?, 0, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 10 MINUTE), DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 60 SECOND))`,
            [input.id, input.orderId, input.emailHash, input.otpHash],
        );
    }

    async findChallengeForVerification(tx: TransactionContext, orderId: number, emailHash: string): Promise<GuestRecoveryChallenge | null> {
        const [row] = await tx.query<GuestRecoveryChallenge[]>(
            `SELECT c.id, c.email_hash, c.otp_hash, c.attempt_count, o.guest_email
             FROM guest_order_access_recovery_challenges c
             JOIN orders o ON o.id = c.order_id
             WHERE c.order_id = ? AND c.email_hash = ? AND o.user_id IS NULL
               AND c.used_at IS NULL AND c.expires_at > UTC_TIMESTAMP(3)
             ORDER BY c.created_at DESC, c.id DESC LIMIT 1 FOR UPDATE`,
            [orderId, emailHash],
        );
        return row || null;
    }

    recordFailedAttempt(tx: TransactionContext, challengeId: string, maximumAttempts: number) {
        return tx.query(
            `UPDATE guest_order_access_recovery_challenges
             SET attempt_count = attempt_count + 1,
                 used_at = CASE WHEN attempt_count + 1 >= ? THEN UTC_TIMESTAMP(3) ELSE used_at END
             WHERE id = ? AND used_at IS NULL`,
            [maximumAttempts, challengeId],
        );
    }

    markChallengeUsed(tx: TransactionContext, challengeId: string) {
        return tx.query("UPDATE guest_order_access_recovery_challenges SET used_at = UTC_TIMESTAMP(3) WHERE id = ? AND used_at IS NULL", [challengeId]);
    }

    async rotateOrderToken(tx: TransactionContext, input: { orderId: number; email: string; tokenHash: string }): Promise<boolean> {
        const result = await tx.query<{ affectedRows?: number }>(
            `UPDATE orders SET guest_order_token_hash = ?
             WHERE id = ? AND user_id IS NULL AND LOWER(TRIM(guest_email)) = ?`,
            [input.tokenHash, input.orderId, input.email],
        );
        if (!result?.affectedRows) return false;
        await tx.query(
            `UPDATE pending_checkouts pc
             JOIN order_payments op ON op.provider_reference = CAST(pc.provider_order_code AS CHAR)
                AND op.provider = 'payos' AND op.order_id = ?
             SET pc.guest_order_token_hash = ?
             WHERE pc.user_id IS NULL`,
            [input.orderId, input.tokenHash],
        );
        await tx.query(
            `UPDATE after_sales_requests SET guest_order_token_hash = ?
             WHERE order_id = ? AND user_id IS NULL`,
            [input.tokenHash, input.orderId],
        );
        return true;
    }
}
