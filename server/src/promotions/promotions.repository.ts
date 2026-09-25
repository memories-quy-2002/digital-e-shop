import { Injectable } from "@nestjs/common";
import pool from "#src/config/database.config";
import type { InsertResult, QueryCallback } from "#src/shared/interfaces/domain";
import type { PromotionPayload } from "./promotions.dto";
import type { PromotionRedemptionUserId, PromotionRow } from "./promotions.types";
import type { TransactionContext } from "../database/transaction";
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
    usage_limit`;

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
        this.query(`SELECT ${promotionSelect} FROM discounts ORDER BY active DESC, id DESC`, callback);
    }

    createPromotion(promotion: PromotionPayload, callback: QueryCallback) {
        this.query(
            `INSERT INTO discounts
                (discount_code, discount_percent, active, min_order_value, starts_at, expires_at, usage_limit)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                promotion.discountCode,
                promotion.discountPercent,
                promotion.active,
                promotion.minOrderValue,
                promotion.startsAt,
                promotion.expiresAt,
                promotion.usageLimit,
            ],
            callback,
        );
    }

    updatePromotion(id: number | string, promotion: PromotionPayload, callback: QueryCallback) {
        this.query(
            `UPDATE discounts
             SET discount_code = ?, discount_percent = ?, active = ?, min_order_value = ?,
                 starts_at = ?, expires_at = ?, usage_limit = ?
             WHERE id = ?`,
            [
                promotion.discountCode,
                promotion.discountPercent,
                promotion.active,
                promotion.minOrderValue,
                promotion.startsAt,
                promotion.expiresAt,
                promotion.usageLimit,
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
               AND (expires_at IS NULL OR expires_at >= UTC_TIMESTAMP())`,
            [discountCode],
            callback,
        );
    }

    async reservePromotion(
        tx: TransactionContext,
        discountCode: string,
        pendingCheckoutId: number,
        userId: PromotionRedemptionUserId,
        expiresAt: Date,
        totalPrice: number,
    ): Promise<PromotionReservationResult> {
        const promotion = await this.getPromotionForUpdate(tx, discountCode, totalPrice);
        const used = await this.getPromotionUsage(tx, promotion.id);
        this.assertUsageAvailable(promotion, used);

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
        const promotion = await this.getPromotionForUpdate(tx, discountCode, totalPrice);
        const used = await this.getPromotionUsage(tx, promotion.id);
        this.assertUsageAvailable(promotion, used);
        const discount = calculateDiscount(promotion, totalPrice);

        await tx.query<InsertResult>(
            `INSERT INTO discount_redemptions
                (discount_id, order_id, user_id, status, consumed_at)
             VALUES (?, ?, ?, '${DISCOUNT_REDEMPTION_STATUS.CONSUMED}', UTC_TIMESTAMP())`,
            [promotion.id, orderId, userId],
        );
        return { discountId: promotion.id, discount, promotion };
    }

    async consumePromotionReservation(tx: TransactionContext, pendingCheckoutId: number, orderId: number): Promise<number> {
        const result = await tx.query<{ affectedRows: number }>(
            `UPDATE discount_redemptions
             SET status = '${DISCOUNT_REDEMPTION_STATUS.CONSUMED}', order_id = ?, consumed_at = UTC_TIMESTAMP()
             WHERE pending_checkout_id = ? AND status = '${DISCOUNT_REDEMPTION_STATUS.RESERVED}'`,
            [orderId, pendingCheckoutId],
        );
        return result.affectedRows;
    }

    async releasePromotionReservation(tx: TransactionContext, pendingCheckoutId: number): Promise<number> {
        const result = await tx.query<{ affectedRows: number }>(
            `UPDATE discount_redemptions
             SET status = '${DISCOUNT_REDEMPTION_STATUS.RELEASED}'
             WHERE pending_checkout_id = ? AND status = '${DISCOUNT_REDEMPTION_STATUS.RESERVED}'`,
            [pendingCheckoutId],
        );
        return result.affectedRows;
    }

    private async getPromotionForUpdate(
        tx: TransactionContext,
        discountCode: string,
        totalPrice: number,
    ): Promise<PromotionRow> {
        const rows = await tx.query<PromotionRow[]>(
            `SELECT id, discount_code, discount_percent, active, min_order_value,
                    starts_at, expires_at, usage_limit
             FROM discounts
             WHERE discount_code = ?
             FOR UPDATE`,
            [String(discountCode || "").trim().toUpperCase()],
        );
        const promotion = rows[0];
        if (!promotion || Number(promotion.active ?? 1) !== 1) {
            throw promotionUsageError("Discount code is no longer valid.", HTTP_STATUS.BAD_REQUEST);
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
        return promotion;
    }

    private async getPromotionUsage(tx: TransactionContext, discountId: number): Promise<number> {
        const rows = await tx.query<PromotionUsageRow[]>(
            `SELECT COUNT(*) AS used
             FROM discount_redemptions
             WHERE discount_id = ?
               AND (
                   status = '${DISCOUNT_REDEMPTION_STATUS.CONSUMED}'
                   OR (status = '${DISCOUNT_REDEMPTION_STATUS.RESERVED}' AND expires_at > UTC_TIMESTAMP())
               )`,
            [discountId],
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
    return Math.min(Number(totalPrice), (Number(totalPrice) * percent) / 100);
};
