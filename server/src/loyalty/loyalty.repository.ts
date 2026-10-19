import { Injectable } from "@nestjs/common";
import pool from "#src/config/database.config";
import type { InsertResult } from "#src/shared/interfaces/domain";
import type { TransactionContext } from "../database/transaction";
import { MAX_LOYALTY_POINTS } from "./loyalty.policy";

export type LoyaltyLedgerRow = {
    id: number;
    entry_type: string;
    points_delta: number | string;
    amount_vnd: number | string | null;
    description: string;
    created_at: Date | string;
};

export type LoyaltyVoucherRow = {
    id: number;
    voucher_code: string;
    status: string;
    points_cost: number | string;
    discount_percent: number | string;
    min_order_value: number | string;
    expires_at: Date | string | null;
    created_at: Date | string;
};

export type LoyaltyRewardRow = {
    id: number;
    description: string | null;
    discount_percent: number | string;
    min_order_value: number | string;
    loyalty_points_cost: number | string;
    starts_at: Date | string | null;
    expires_at: Date | string | null;
    remaining_uses: number | string | null;
    usage_limit?: number | string | null;
    usage_count?: number | string;
};

type BalanceRow = { balance_points: number | string };
type ExistingEventRow = { id: number };

@Injectable()
export class LoyaltyRepository {
    private query<T>(sql: string, values: unknown[] = []): Promise<T> {
        return new Promise((resolve, reject) => {
            pool.query(sql, values, (error, result) => error ? reject(error) : resolve(result as T));
        });
    }

    async getOverviewRows(userId: string) {
        const [accounts, ledger, vouchers] = await Promise.all([
            this.query<Array<BalanceRow>>(
                `SELECT COALESCE(la.balance_points, 0) AS balance_points
                 FROM users u LEFT JOIN loyalty_accounts la ON la.user_id = u.id
                 WHERE u.id = ? LIMIT 1`, [userId],
            ),
            this.query<LoyaltyLedgerRow[]>(
                `SELECT id, entry_type, points_delta, amount_vnd, description, created_at
                 FROM loyalty_ledger WHERE user_id = ? ORDER BY id DESC LIMIT 50`, [userId],
            ),
            this.query<LoyaltyVoucherRow[]>(
                `SELECT v.id, v.voucher_code, v.status, v.points_cost, d.discount_percent,
                        d.min_order_value, d.expires_at, v.created_at
                 FROM loyalty_vouchers v JOIN discounts d ON d.id = v.promotion_id
                 WHERE v.user_id = ? AND v.status IN ('AVAILABLE', 'RESERVED')
                   AND (v.status = 'RESERVED' OR (d.active = 1
                        AND (d.starts_at IS NULL OR d.starts_at <= UTC_TIMESTAMP())
                        AND (d.expires_at IS NULL OR d.expires_at > UTC_TIMESTAMP())))
                 ORDER BY v.id DESC LIMIT 50`, [userId],
            ),
        ]);
        return { balancePoints: Number(accounts[0]?.balance_points) || 0, ledger, vouchers };
    }

    async ensureAccount(tx: TransactionContext, userId: string): Promise<number> {
        await tx.query("INSERT IGNORE INTO loyalty_accounts (user_id, balance_points) VALUES (?, 0)", [userId]);
        const rows = await tx.query<Array<BalanceRow>>(
            "SELECT balance_points FROM loyalty_accounts WHERE user_id = ? FOR UPDATE", [userId],
        );
        if (!rows[0]) throw Object.assign(new Error("Customer account was not found"), { statusCode: 404 });
        return Number(rows[0].balance_points) || 0;
    }

    async getBalanceForUpdate(tx: TransactionContext, userId: string): Promise<number> {
        return this.ensureAccount(tx, userId);
    }

    async hasEvent(tx: TransactionContext, eventKey: string): Promise<boolean> {
        const [row] = await tx.query<ExistingEventRow[]>("SELECT id FROM loyalty_ledger WHERE event_key = ? LIMIT 1", [eventKey]);
        return Boolean(row);
    }

    async applyDelta(tx: TransactionContext, input: {
        userId: string;
        pointsDelta: number;
        entryType: string;
        eventKey: string;
        description: string;
        amountVnd?: number | null;
        orderId?: number | null;
        voucherId?: number | null;
        pendingCheckoutId?: number | null;
    }): Promise<boolean> {
        const balance = await this.ensureAccount(tx, input.userId);
        if (await this.hasEvent(tx, input.eventKey)) return false;
        if (input.pointsDelta < 0) {
            const result = await tx.query<{ affectedRows: number }>(
                "UPDATE loyalty_accounts SET balance_points = balance_points + ? WHERE user_id = ? AND balance_points >= ?",
                [input.pointsDelta, input.userId, Math.abs(input.pointsDelta)],
            );
            if (result.affectedRows !== 1) throw Object.assign(new Error("Not enough loyalty points"), { statusCode: 409 });
        } else {
            if (input.pointsDelta > MAX_LOYALTY_POINTS - balance) {
                throw Object.assign(new Error("Loyalty point balance limit reached"), { statusCode: 409 });
            }
            await tx.query("UPDATE loyalty_accounts SET balance_points = balance_points + ? WHERE user_id = ?", [input.pointsDelta, input.userId]);
        }
        await tx.query<InsertResult>(
            `INSERT INTO loyalty_ledger
                (user_id, order_id, voucher_id, pending_checkout_id, entry_type, points_delta, amount_vnd, event_key, description)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [input.userId, input.orderId ?? null, input.voucherId ?? null, input.pendingCheckoutId ?? null,
                input.entryType, input.pointsDelta, input.amountVnd ?? null, input.eventKey, input.description],
        );
        return true;
    }

    async createVoucher(tx: TransactionContext, input: {
        userId: string;
        promotionId: number;
        code: string;
        pointsCost: number;
    }): Promise<number> {
        const result = await tx.query<InsertResult>(
            `INSERT INTO loyalty_vouchers (user_id, promotion_id, voucher_code, points_cost, status)
             VALUES (?, ?, ?, ?, 'AVAILABLE')`,
            [input.userId, input.promotionId, input.code, input.pointsCost],
        );
        return result.insertId;
    }

    async releaseCheckoutPoints(tx: TransactionContext, pendingCheckoutId: number): Promise<boolean> {
        const [checkout] = await tx.query<Array<{ user_id: string | null; loyalty_points_redeemed: number | string; status: string }>>(
            "SELECT user_id, loyalty_points_redeemed, status FROM pending_checkouts WHERE id = ? FOR UPDATE", [pendingCheckoutId],
        );
        const points = Number(checkout?.loyalty_points_redeemed) || 0;
        if (!checkout || checkout.status === "CONSUMED") return false;
        let pointsRestored = false;
        if (checkout.user_id && points > 0) {
            pointsRestored = await this.applyDelta(tx, {
                userId: checkout.user_id,
                pointsDelta: points,
                entryType: "CHECKOUT_RELEASE",
                eventKey: `checkout:${pendingCheckoutId}:release`,
                description: `Returned ${points} points from a canceled checkout`,
                pendingCheckoutId,
            });
        }
        const voucher = await tx.query<{ affectedRows: number }>(
            "UPDATE loyalty_vouchers SET status = 'AVAILABLE', pending_checkout_id = NULL WHERE pending_checkout_id = ? AND status = 'RESERVED'",
            [pendingCheckoutId],
        );
        return pointsRestored || voucher.affectedRows > 0;
    }

    async getRewardForAccount(tx: TransactionContext, promotionId: number): Promise<LoyaltyRewardRow | null> {
        const [reward] = await tx.query<LoyaltyRewardRow[]>(
            `SELECT id, description, discount_percent, min_order_value, loyalty_points_cost, starts_at, expires_at, usage_limit,
                    (SELECT COUNT(*) FROM discount_redemptions dr
                     WHERE dr.discount_id = discounts.id
                       AND (dr.status = 'CONSUMED' OR (dr.status = 'RESERVED' AND dr.expires_at > UTC_TIMESTAMP())))
                    + (SELECT COUNT(*) FROM loyalty_vouchers v
                       WHERE v.promotion_id = discounts.id AND v.status = 'AVAILABLE'
                         AND (discounts.expires_at IS NULL OR discounts.expires_at > UTC_TIMESTAMP())) AS usage_count,
                    CASE WHEN usage_limit IS NULL THEN NULL ELSE GREATEST(usage_limit - (
                        (SELECT COUNT(*) FROM discount_redemptions dr
                         WHERE dr.discount_id = discounts.id
                           AND (dr.status = 'CONSUMED' OR (dr.status = 'RESERVED' AND dr.expires_at > UTC_TIMESTAMP())))
                        + (SELECT COUNT(*) FROM loyalty_vouchers v
                           WHERE v.promotion_id = discounts.id AND v.status = 'AVAILABLE'
                             AND (discounts.expires_at IS NULL OR discounts.expires_at > UTC_TIMESTAMP()))
                    ), 0) END AS remaining_uses
             FROM discounts WHERE id = ? AND loyalty_points_cost > 0 AND active = 1
               AND (starts_at IS NULL OR starts_at <= UTC_TIMESTAMP())
               AND (expires_at IS NULL OR expires_at > UTC_TIMESTAMP())
             LIMIT 1 FOR UPDATE`, [promotionId],
        );
        return reward ?? null;
    }

    async getRewards(): Promise<LoyaltyRewardRow[]> {
        return this.query<LoyaltyRewardRow[]>(
            `SELECT d.id, d.description, d.discount_percent, d.min_order_value, d.loyalty_points_cost,
                    d.starts_at, d.expires_at,
                    CASE WHEN d.usage_limit IS NULL THEN NULL ELSE GREATEST(d.usage_limit - (
                        (SELECT COUNT(*) FROM discount_redemptions dr WHERE dr.discount_id = d.id
                         AND (dr.status = 'CONSUMED' OR (dr.status = 'RESERVED' AND dr.expires_at > UTC_TIMESTAMP())))
                        + (SELECT COUNT(*) FROM loyalty_vouchers v WHERE v.promotion_id = d.id AND v.status = 'AVAILABLE'
                           AND (d.expires_at IS NULL OR d.expires_at > UTC_TIMESTAMP()))
                    ), 0) END AS remaining_uses
             FROM discounts d
             WHERE d.loyalty_points_cost > 0 AND d.active = 1
               AND (d.starts_at IS NULL OR d.starts_at <= UTC_TIMESTAMP())
               AND (d.expires_at IS NULL OR d.expires_at > UTC_TIMESTAMP())
             ORDER BY d.loyalty_points_cost ASC, d.id DESC LIMIT 50`,
        );
    }
}
