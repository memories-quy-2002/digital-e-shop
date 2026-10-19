import { Injectable } from "@nestjs/common";
import pool from "#src/config/database.config";
import type { InsertResult, QueryCallback, UpdateResult } from "#src/shared/interfaces/domain";
import type { PromotionPayload } from "./promotions.dto";
import type { PromotionRedemptionUserId, PromotionRow } from "./promotions.types";
import type { TransactionContext } from "../database/transaction";
import { withTransaction } from "../database/transaction";
import { env } from "#src/config/env.config";
import { formatPaymentAmount } from "../payments/currency";
import { HTTP_STATUS } from "#src/shared/constants/http-status";
import { CHECKOUT_RESERVATION_STATUS } from "#src/shared/constants/checkout-reservation";
import { DISCOUNT_REDEMPTION_STATUS } from "./promotions.constants";

type QueryParams = unknown[] | Record<string, unknown> | QueryCallback | undefined;

const promotionSelect = `
    id,
    discount_code,
    description,
    discount_percent,
    active,
    min_order_value,
    DATE_FORMAT(starts_at, '%Y-%m-%dT%H:%i:%s.000Z') AS starts_at,
    DATE_FORMAT(expires_at, '%Y-%m-%dT%H:%i:%s.000Z') AS expires_at,
    usage_limit,
    loyalty_points_cost`;

export type PromotionReservationResult = {
    discountId: number;
    discount: number;
    promotion: PromotionRow;
};

type PromotionUsageRow = { used: number | string };

const promotionUsageError = (message: string, statusCode: number = HTTP_STATUS.CONFLICT) => Object.assign(new Error(message), { statusCode });

@Injectable()
export class PromotionsRepository {
    private query(sql: string, params?: QueryParams, callback?: QueryCallback) {
        if (typeof params === "function") {
            return pool.query(sql, params);
        }
        return pool.query(sql, params, callback);
    }

    getPromotions(callback: QueryCallback) {
        this.query(
            `SELECT ${promotionSelect},
                (SELECT COUNT(*) FROM discount_redemptions dr
                 WHERE dr.discount_id = discounts.id
                   AND (dr.status = '${DISCOUNT_REDEMPTION_STATUS.CONSUMED}'
                     OR (dr.status = '${DISCOUNT_REDEMPTION_STATUS.RESERVED}' AND dr.expires_at > UTC_TIMESTAMP())))
                + (SELECT COUNT(*) FROM loyalty_vouchers lv
                   WHERE lv.promotion_id = discounts.id AND lv.status = 'AVAILABLE'
                     AND (discounts.expires_at IS NULL OR discounts.expires_at > UTC_TIMESTAMP())) AS usage_count,
                CASE WHEN usage_limit IS NULL THEN NULL ELSE GREATEST(usage_limit - (
                    SELECT COUNT(*) FROM discount_redemptions dr
                    WHERE dr.discount_id = discounts.id
                      AND (dr.status = '${DISCOUNT_REDEMPTION_STATUS.CONSUMED}'
                        OR (dr.status = '${DISCOUNT_REDEMPTION_STATUS.RESERVED}' AND dr.expires_at > UTC_TIMESTAMP()))
                ) - (SELECT COUNT(*) FROM loyalty_vouchers lv
                     WHERE lv.promotion_id = discounts.id AND lv.status = 'AVAILABLE'
                       AND (discounts.expires_at IS NULL OR discounts.expires_at > UTC_TIMESTAMP())), 0) END AS remaining_uses
             FROM discounts ORDER BY active DESC, id DESC`,
            callback,
        );
    }

    createPromotionForAdmin(promotion: PromotionPayload, actorId: string): Promise<InsertResult> {
        return withTransaction(async (tx) => {
            const result = await tx.query<InsertResult>(
                `INSERT INTO discounts
                    (discount_code, discount_percent, active, min_order_value, starts_at, expires_at, usage_limit, loyalty_points_cost)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [promotion.discountCode, promotion.discountPercent, promotion.active, promotion.minOrderValue,
                    promotion.startsAt, promotion.expiresAt, promotion.usageLimit, promotion.loyaltyPointsCost ?? null],
            );
            await tx.query(
                `INSERT INTO admin_audit_events (actor_id, action, entity_type, entity_id, reason, changes)
                 VALUES (?, 'promotion.created', 'promotion', ?, 'Promotion created by an administrator', ?)`,
                [actorId, String(result.insertId), JSON.stringify({ after: promotion })],
            );
            return result;
        });
    }

    updatePromotionForAdmin(id: number | string, promotion: PromotionPayload, actorId: string): Promise<UpdateResult> {
        return withTransaction(async (tx) => {
            const [before] = await tx.query<Array<Record<string, unknown>>>(
                `SELECT discount_code, discount_percent, active, min_order_value, starts_at, expires_at, usage_limit, loyalty_points_cost
                 FROM discounts WHERE id = ? FOR UPDATE`,
                [id],
            );
            if (!before) return { affectedRows: 0 };
            const result = await tx.query<UpdateResult>(
                `UPDATE discounts
                 SET discount_code = ?, discount_percent = ?, active = ?, min_order_value = ?,
                     starts_at = ?, expires_at = ?, usage_limit = ?, loyalty_points_cost = ?
                 WHERE id = ?`,
                [promotion.discountCode, promotion.discountPercent, promotion.active, promotion.minOrderValue,
                    promotion.startsAt, promotion.expiresAt, promotion.usageLimit, promotion.loyaltyPointsCost ?? null, id],
            );
            await tx.query(
                `INSERT INTO admin_audit_events (actor_id, action, entity_type, entity_id, reason, changes)
                 VALUES (?, 'promotion.updated', 'promotion', ?, 'Promotion rules updated by an administrator', ?)`,
                [actorId, String(id), JSON.stringify({ before, after: promotion })],
            );
            return { ...result, affectedRows: result.affectedRows || 1 };
        });
    }

    deactivatePromotionForAdmin(id: number | string, actorId: string): Promise<UpdateResult> {
        return withTransaction(async (tx) => {
            const [before] = await tx.query<Array<Record<string, unknown>>>(
                "SELECT discount_code, active FROM discounts WHERE id = ? FOR UPDATE",
                [id],
            );
            if (!before) return { affectedRows: 0 };
            const result = await tx.query<UpdateResult>("UPDATE discounts SET active = 0 WHERE id = ?", [id]);
            if (Number(before.active) !== 0) {
                await tx.query(
                    `INSERT INTO admin_audit_events (actor_id, action, entity_type, entity_id, reason, changes)
                     VALUES (?, 'promotion.deactivated', 'promotion', ?, 'Promotion deactivated by an administrator', ?)`,
                    [actorId, String(id), JSON.stringify({ before, after: { active: 0 } })],
                );
            }
            return { ...result, affectedRows: result.affectedRows || 1 };
        });
    }

    createPromotion(promotion: PromotionPayload, callback: QueryCallback) {
        this.query(
            `INSERT INTO discounts
                (discount_code, discount_percent, active, min_order_value, starts_at, expires_at, usage_limit, loyalty_points_cost)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                promotion.discountCode,
                promotion.discountPercent,
                promotion.active,
                promotion.minOrderValue,
                promotion.startsAt,
                promotion.expiresAt,
                promotion.usageLimit,
                promotion.loyaltyPointsCost ?? null,
            ],
            callback,
        );
    }

    updatePromotion(id: number | string, promotion: PromotionPayload, callback: QueryCallback) {
        this.query(
            `UPDATE discounts
             SET discount_code = ?, discount_percent = ?, active = ?, min_order_value = ?,
                 starts_at = ?, expires_at = ?, usage_limit = ?, loyalty_points_cost = ?
             WHERE id = ?`,
            [
                promotion.discountCode,
                promotion.discountPercent,
                promotion.active,
                promotion.minOrderValue,
                promotion.startsAt,
                promotion.expiresAt,
                promotion.usageLimit,
                promotion.loyaltyPointsCost ?? null,
                id,
            ],
            callback,
        );
    }

    deletePromotion(id: number | string, callback: QueryCallback) {
        this.query("UPDATE discounts SET active = 0 WHERE id = ?", [id], callback);
    }

    getActivePromotionByCode(discountCode: string, callback: QueryCallback) {
        this.query(
            `SELECT ${promotionSelect}
             FROM discounts
             WHERE discount_code = ?
               AND active = 1
               AND (starts_at IS NULL OR starts_at <= UTC_TIMESTAMP())
               AND (expires_at IS NULL OR expires_at >= UTC_TIMESTAMP())
               AND loyalty_points_cost IS NULL`,
            [discountCode],
            callback,
        );
    }

    async getActivePromotionByCodeForUser(discountCode: string, userId: string): Promise<PromotionRow | null> {
        const code = String(discountCode || "").trim().toUpperCase();
        const voucherRows = await new Promise<PromotionRow[]>((resolve, reject) => {
            this.query(
                `SELECT discounts.id, discounts.discount_code, discounts.description, discounts.discount_percent,
                        discounts.active, discounts.min_order_value, discounts.starts_at, discounts.expires_at,
                        discounts.usage_limit, discounts.loyalty_points_cost,
                        lv.id AS voucher_id, lv.voucher_code AS submitted_code
                 FROM loyalty_vouchers lv JOIN discounts ON discounts.id = lv.promotion_id
                 WHERE lv.voucher_code = ? AND lv.user_id = ? AND lv.status = 'AVAILABLE'
                   AND discounts.active = 1
                   AND (discounts.starts_at IS NULL OR discounts.starts_at <= UTC_TIMESTAMP())
                   AND (discounts.expires_at IS NULL OR discounts.expires_at > UTC_TIMESTAMP())
                 LIMIT 1`, [code, userId], (error, rows) => error ? reject(error) : resolve((rows || []) as PromotionRow[]),
            );
        });
        if (voucherRows[0]) return { ...voucherRows[0], discount_code: code };
        return new Promise((resolve, reject) => {
            this.query(
                `SELECT ${promotionSelect} FROM discounts
                 WHERE discount_code = ? AND active = 1 AND loyalty_points_cost IS NULL
                   AND (starts_at IS NULL OR starts_at <= UTC_TIMESTAMP())
                   AND (expires_at IS NULL OR expires_at > UTC_TIMESTAMP()) LIMIT 1`,
                [code], (error, rows) => error ? reject(error) : resolve((rows as PromotionRow[] | undefined)?.[0] || null),
            );
        });
    }

    async getActivePromotionByCodeForCheckout(discountCode: string, userId?: string | null): Promise<PromotionRow | null> {
        if (userId) return this.getActivePromotionByCodeForUser(discountCode, userId);
        return new Promise((resolve, reject) => {
            this.getActivePromotionByCode(discountCode, (error: Error | null, rows: PromotionRow[]) => {
                if (error) return reject(error);
                resolve(rows?.[0] || null);
            });
        });
    }

    async reservePromotion(
        tx: TransactionContext,
        discountCode: string,
        pendingCheckoutId: number,
        userId: PromotionRedemptionUserId,
        expiresAt: Date,
        totalPrice: number,
    ): Promise<PromotionReservationResult> {
        const { promotion, voucherId } = await this.getPromotionForUpdate(tx, discountCode, totalPrice, userId);
        const used = await this.getPromotionUsage(tx, promotion.id, voucherId);
        this.assertUsageAvailable(promotion, used);

        if (voucherId) {
            const voucher = await tx.query<{ affectedRows: number }>(
                "UPDATE loyalty_vouchers SET status = 'RESERVED', pending_checkout_id = ? WHERE id = ? AND status = 'AVAILABLE'",
                [pendingCheckoutId, voucherId],
            );
            if (voucher.affectedRows !== 1) throw promotionUsageError("This voucher has already been used.", HTTP_STATUS.CONFLICT);
        }

        const discount = calculateDiscount(promotion, totalPrice);
        const pendingUpdate = await tx.query<{ affectedRows: number }>(
            `UPDATE pending_checkouts
             SET discount_id = ?, discount = ?
             WHERE id = ? AND status = '${CHECKOUT_RESERVATION_STATUS.PENDING}'`,
            [promotion.id, discount, pendingCheckoutId],
        );
        if (pendingUpdate.affectedRows !== 1) {
            throw promotionUsageError("Checkout reservation is no longer available.", HTTP_STATUS.CONFLICT);
        }
        await tx.query<InsertResult>(
            `INSERT INTO discount_redemptions
                (discount_id, pending_checkout_id, user_id, status, expires_at)
             VALUES (?, ?, ?, '${DISCOUNT_REDEMPTION_STATUS.RESERVED}', ?)`,
            [promotion.id, pendingCheckoutId, userId, expiresAt],
        );

        return { discountId: promotion.id, discount, promotion };
    }

    async consumePromotion(
        tx: TransactionContext,
        discountCode: string,
        userId: PromotionRedemptionUserId,
        orderId: number,
        totalPrice: number,
    ): Promise<PromotionReservationResult> {
        const { promotion, voucherId } = await this.getPromotionForUpdate(tx, discountCode, totalPrice, userId);
        const used = await this.getPromotionUsage(tx, promotion.id, voucherId);
        this.assertUsageAvailable(promotion, used);
        const discount = calculateDiscount(promotion, totalPrice);

        await tx.query<InsertResult>(
            `INSERT INTO discount_redemptions
                (discount_id, order_id, user_id, status, consumed_at)
             VALUES (?, ?, ?, '${DISCOUNT_REDEMPTION_STATUS.CONSUMED}', UTC_TIMESTAMP())`,
            [promotion.id, orderId, userId],
        );
        if (voucherId) {
            const voucher = await tx.query<{ affectedRows: number }>(
                "UPDATE loyalty_vouchers SET status = 'REDEEMED', order_id = ?, redeemed_at = UTC_TIMESTAMP() WHERE id = ? AND status = 'AVAILABLE'",
                [orderId, voucherId],
            );
            if (voucher.affectedRows !== 1) throw promotionUsageError("This voucher has already been used.", HTTP_STATUS.CONFLICT);
        }
        return { discountId: promotion.id, discount, promotion };
    }

    async consumePromotionReservation(tx: TransactionContext, pendingCheckoutId: number, orderId: number): Promise<number> {
        const result = await tx.query<{ affectedRows: number }>(
            `UPDATE discount_redemptions
             SET status = '${DISCOUNT_REDEMPTION_STATUS.CONSUMED}', order_id = ?, consumed_at = UTC_TIMESTAMP()
             WHERE pending_checkout_id = ? AND status = '${DISCOUNT_REDEMPTION_STATUS.RESERVED}'`,
            [orderId, pendingCheckoutId],
        );
        if (result.affectedRows === 1) {
            await tx.query(
                "UPDATE loyalty_vouchers SET status = 'REDEEMED', order_id = ?, redeemed_at = UTC_TIMESTAMP() WHERE pending_checkout_id = ? AND status = 'RESERVED'",
                [orderId, pendingCheckoutId],
            );
        }
        return result.affectedRows;
    }

    async consumePaidPromotionReservation(tx: TransactionContext, pendingCheckoutId: number, orderId: number): Promise<number> {
        const rows = await tx.query<Array<{ status: string; order_id: number | null }>>(
            `SELECT status, order_id
             FROM discount_redemptions
             WHERE pending_checkout_id = ?
             LIMIT 1
             FOR UPDATE`,
            [pendingCheckoutId],
        );
        const reservation = rows[0];
        if (!reservation) return 0;
        if (reservation.status === DISCOUNT_REDEMPTION_STATUS.CONSUMED) {
            return Number(reservation.order_id) === orderId ? 1 : 0;
        }
        if (reservation.status !== DISCOUNT_REDEMPTION_STATUS.RESERVED
            && reservation.status !== DISCOUNT_REDEMPTION_STATUS.RELEASED) return 0;

        const result = await tx.query<{ affectedRows: number }>(
            `UPDATE discount_redemptions
             SET status = '${DISCOUNT_REDEMPTION_STATUS.CONSUMED}', order_id = ?, consumed_at = UTC_TIMESTAMP()
             WHERE pending_checkout_id = ? AND status IN ('${DISCOUNT_REDEMPTION_STATUS.RESERVED}', '${DISCOUNT_REDEMPTION_STATUS.RELEASED}')`,
            [orderId, pendingCheckoutId],
        );
        if (result.affectedRows === 1) {
            await tx.query(
                "UPDATE loyalty_vouchers SET status = 'REDEEMED', order_id = ?, redeemed_at = UTC_TIMESTAMP() WHERE pending_checkout_id = ? AND status = 'RESERVED'",
                [orderId, pendingCheckoutId],
            );
        }
        return result.affectedRows;
    }

    async releasePromotionReservation(tx: TransactionContext, pendingCheckoutId: number): Promise<number> {
        const result = await tx.query<{ affectedRows: number }>(
            `UPDATE discount_redemptions
             SET status = '${DISCOUNT_REDEMPTION_STATUS.RELEASED}'
             WHERE pending_checkout_id = ? AND status = '${DISCOUNT_REDEMPTION_STATUS.RESERVED}'`,
            [pendingCheckoutId],
        );
        if (result.affectedRows === 1) {
            await tx.query(
                "UPDATE loyalty_vouchers SET status = 'AVAILABLE', pending_checkout_id = NULL WHERE pending_checkout_id = ? AND status = 'RESERVED'",
                [pendingCheckoutId],
            );
        }
        return result.affectedRows;
    }

    private async getPromotionForUpdate(
        tx: TransactionContext,
        discountCode: string,
        totalPrice: number,
        userId: PromotionRedemptionUserId,
    ): Promise<{ promotion: PromotionRow; voucherId: number | null }> {
        const code = String(discountCode || "").trim().toUpperCase();
        let voucherId: number | null = null;
        let promotion: PromotionRow | undefined;
        if (userId) {
            const [voucher] = await tx.query<Array<{ id: number; promotion_id: number }>>(
                "SELECT id, promotion_id FROM loyalty_vouchers WHERE voucher_code = ? AND user_id = ? AND status = 'AVAILABLE' LIMIT 1 FOR UPDATE",
                [code, userId],
            );
            if (voucher) {
                voucherId = Number(voucher.id);
                const rows = await tx.query<PromotionRow[]>(
                    `SELECT id, discount_code, discount_percent, active, min_order_value,
                            starts_at, expires_at, usage_limit, loyalty_points_cost
                     FROM discounts WHERE id = ? LIMIT 1 FOR UPDATE`, [voucher.promotion_id],
                );
                promotion = rows[0];
            }
        }
        if (!promotion) {
            const rows = await tx.query<PromotionRow[]>(
                `SELECT id, discount_code, discount_percent, active, min_order_value,
                        starts_at, expires_at, usage_limit, loyalty_points_cost
                 FROM discounts WHERE discount_code = ? LIMIT 1 FOR UPDATE`, [code],
            );
            promotion = rows[0];
        }
        if (!promotion || Number(promotion.active ?? 1) !== 1) {
            throw promotionUsageError("Discount code is no longer valid.", HTTP_STATUS.BAD_REQUEST);
        }
        if (Number(promotion.loyalty_points_cost) > 0 && !voucherId) {
            throw promotionUsageError("This promotion must be claimed with loyalty points first.", HTTP_STATUS.BAD_REQUEST);
        }

        const now = Date.now();
        if (promotion.starts_at && new Date(promotion.starts_at).getTime() > now) {
            throw promotionUsageError("Discount code is not active yet.", HTTP_STATUS.BAD_REQUEST);
        }
        if (promotion.expires_at && new Date(promotion.expires_at).getTime() <= now) {
            throw promotionUsageError("Discount code has expired.", HTTP_STATUS.BAD_REQUEST);
        }
        if (Number(totalPrice) < (Number(promotion.min_order_value) || 0)) {
            throw promotionUsageError(
                `This promotion requires a minimum order of ${formatPaymentAmount(Number(promotion.min_order_value) || 0, env.storeCurrency)}`,
                400,
            );
        }
        return { promotion, voucherId };
    }

    private async getPromotionUsage(tx: TransactionContext, discountId: number, excludedVoucherId: number | null = null): Promise<number> {
        const rows = await tx.query<PromotionUsageRow[]>(
            `SELECT
                (SELECT COUNT(*) FROM discount_redemptions
                 WHERE discount_id = ? AND (status = '${DISCOUNT_REDEMPTION_STATUS.CONSUMED}'
                    OR (status = '${DISCOUNT_REDEMPTION_STATUS.RESERVED}' AND expires_at > UTC_TIMESTAMP())))
                + (SELECT COUNT(*) FROM loyalty_vouchers lv JOIN discounts d ON d.id = lv.promotion_id
                   WHERE lv.promotion_id = ? AND lv.status = 'AVAILABLE' AND lv.id <> COALESCE(?, 0)
                     AND (d.expires_at IS NULL OR d.expires_at > UTC_TIMESTAMP())) AS used`,
            [discountId, discountId, excludedVoucherId],
        );
        return Number(rows[0]?.used) || 0;
    }

    private assertUsageAvailable(promotion: PromotionRow, used: number): void {
        const usageLimit = promotion.usage_limit === null || promotion.usage_limit === undefined
            ? null
            : Number(promotion.usage_limit);
        if (usageLimit !== null && used >= usageLimit) {
            throw promotionUsageError("Discount code has reached its usage limit.", HTTP_STATUS.CONFLICT);
        }
    }
}

const calculateDiscount = (promotion: PromotionRow, totalPrice: number): number => {
    const percent = Math.min(Math.max(Number(promotion.discount_percent) || 0, 0), 100);
    return Math.round(Math.min(Number(totalPrice), (Number(totalPrice) * percent) / 100));
};
