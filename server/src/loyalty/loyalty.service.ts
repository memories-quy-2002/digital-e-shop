import { Injectable } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import type { TransactionContext } from "../database/transaction";
import { withTransaction } from "../database/transaction";
import { LoyaltyRepository } from "./loyalty.repository";
import { calculateEarnedPoints, calculatePointsDiscount, MAX_LOYALTY_POINTS } from "./loyalty.policy";

const loyaltyError = (message: string, statusCode = 409) => Object.assign(new Error(message), { statusCode });

const getEligibleMerchandiseFromSnapshot = (snapshot: string | object, fallbackLoyaltyDiscount: number | string): number => {
    try {
        const pricing = (typeof snapshot === "string" ? JSON.parse(snapshot) : snapshot) as {
            itemsSubtotal?: number | string;
            merchandiseDiscount?: number | string;
            loyaltyDiscount?: number | string;
            promotionDiscount?: number | string;
        };
        const subtotal = Number(pricing.itemsSubtotal);
        const totalDiscount = Number(pricing.merchandiseDiscount) || 0;
        const loyaltyDiscount = Number(pricing.loyaltyDiscount ?? fallbackLoyaltyDiscount) || 0;
        const promotionDiscount = Number(pricing.promotionDiscount ?? Math.max(totalDiscount - loyaltyDiscount, 0)) || 0;
        return Math.max(0, subtotal - promotionDiscount - loyaltyDiscount);
    } catch {
        throw loyaltyError("Paid order pricing snapshot is invalid.", 409);
    }
};

@Injectable()
export class LoyaltyService {
    constructor(
        private readonly repository: LoyaltyRepository,
    ) {}

    async getOverview(userId: string) {
        const [account, rewards] = await Promise.all([
            this.repository.getOverviewRows(userId),
            this.repository.getRewards(),
        ]);
        return {
            balancePoints: account.balancePoints,
            history: account.ledger.map((entry) => ({
                id: Number(entry.id),
                type: entry.entry_type,
                pointsDelta: Number(entry.points_delta) || 0,
                amountVnd: entry.amount_vnd == null ? null : Number(entry.amount_vnd),
                description: entry.description,
                createdAt: entry.created_at,
            })),
            vouchers: account.vouchers.map((voucher) => ({
                id: Number(voucher.id),
                code: voucher.voucher_code,
                status: voucher.status,
                pointsCost: Number(voucher.points_cost) || 0,
                discountPercent: Number(voucher.discount_percent) || 0,
                minOrderValue: Number(voucher.min_order_value) || 0,
                expiresAt: voucher.expires_at,
                createdAt: voucher.created_at,
            })),
            rewards: rewards.map((reward) => ({
                id: Number(reward.id),
                description: reward.description || `${Number(reward.discount_percent)}% off`,
                discountPercent: Number(reward.discount_percent) || 0,
                minOrderValue: Number(reward.min_order_value) || 0,
                pointsCost: Number(reward.loyalty_points_cost) || 0,
                expiresAt: reward.expires_at,
                remainingUses: reward.remaining_uses == null ? null : Number(reward.remaining_uses),
            })),
        };
    }

    async claimReward(userId: string, promotionId: number) {
        return withTransaction(async (tx) => {
            const reward = await this.repository.getRewardForAccount(tx, promotionId);
            if (!reward) throw loyaltyError("This loyalty reward is no longer available.", 404);
            const pointsCost = Number(reward.loyalty_points_cost);
            if (!Number.isSafeInteger(pointsCost) || pointsCost <= 0 || pointsCost > MAX_LOYALTY_POINTS) throw loyaltyError("This loyalty reward has an invalid points cost.", 409);
            if (reward.remaining_uses !== null && Number(reward.remaining_uses) <= 0) throw loyaltyError("This loyalty reward has reached its redemption limit.", 409);

            const balance = await this.repository.getBalanceForUpdate(tx, userId);
            if (balance < pointsCost) throw loyaltyError("You do not have enough loyalty points for this reward.", 409);
            const voucherCode = `LOY-${randomBytes(10).toString("hex").toUpperCase()}`;
            const voucherId = await this.repository.createVoucher(tx, {
                userId,
                promotionId,
                code: voucherCode,
                pointsCost,
            });
            await this.repository.applyDelta(tx, {
                userId,
                pointsDelta: -pointsCost,
                entryType: "VOUCHER_REDEEM",
                eventKey: `voucher:${voucherId}:claim`,
                description: `Redeemed ${pointsCost} points for a ${Number(reward.discount_percent)}% promotion voucher`,
                voucherId,
            });
            return {
                voucher: {
                    id: voucherId,
                    code: voucherCode,
                    pointsCost,
                    discountPercent: Number(reward.discount_percent) || 0,
                    minOrderValue: Number(reward.min_order_value) || 0,
                    expiresAt: reward.expires_at,
                },
                balancePoints: balance - pointsCost,
            };
        });
    }

    async holdCheckoutPoints(
        tx: TransactionContext,
        userId: string | null,
        pendingCheckoutId: number,
        requestedPoints: number,
        merchandiseSubtotalVnd: number,
        promotionDiscountVnd: number,
    ): Promise<number> {
        if (requestedPoints === 0) return 0;
        if (!userId) throw loyaltyError("Sign in to use loyalty points.", 401);
        const discountVnd = calculatePointsDiscount(merchandiseSubtotalVnd, promotionDiscountVnd, requestedPoints);
        if (discountVnd !== requestedPoints) throw loyaltyError("Points cannot exceed the remaining merchandise total.", 400);
        await this.repository.applyDelta(tx, {
            userId,
            pointsDelta: -requestedPoints,
            entryType: "CHECKOUT_REDEEM",
            eventKey: `checkout:${pendingCheckoutId}:redeem`,
            description: `Used ${requestedPoints} points at checkout`,
            amountVnd: discountVnd,
            pendingCheckoutId,
        });
        return discountVnd;
    }

    async redeemOrderPoints(
        tx: TransactionContext,
        userId: string,
        orderId: number,
        requestedPoints: number,
        merchandiseSubtotalVnd: number,
        promotionDiscountVnd: number,
    ): Promise<number> {
        if (requestedPoints === 0) return 0;
        const discountVnd = calculatePointsDiscount(merchandiseSubtotalVnd, promotionDiscountVnd, requestedPoints);
        if (discountVnd !== requestedPoints) throw loyaltyError("Points cannot exceed the remaining merchandise total.", 400);
        await this.repository.applyDelta(tx, {
            userId,
            pointsDelta: -requestedPoints,
            entryType: "ORDER_REDEEM",
            eventKey: `order:${orderId}:redeem`,
            description: `Used ${requestedPoints} points on order #${orderId}`,
            amountVnd: discountVnd,
            orderId,
        });
        return discountVnd;
    }

    async releaseCheckoutPoints(tx: TransactionContext, pendingCheckoutId: number): Promise<boolean> {
        return this.repository.releaseCheckoutPoints(tx, pendingCheckoutId);
    }

    async restoreCanceledOrderPoints(tx: TransactionContext, orderId: number): Promise<boolean> {
        const [order] = await tx.query<Array<{ user_id: string | null; loyalty_points_redeemed: number | string }>>(
            "SELECT user_id, loyalty_points_redeemed FROM orders WHERE id = ? FOR UPDATE", [orderId],
        );
        const points = Number(order?.loyalty_points_redeemed) || 0;
        if (!order?.user_id || points <= 0) return false;
        return this.repository.applyDelta(tx, {
            userId: order.user_id,
            pointsDelta: points,
            entryType: "ORDER_CANCEL_RELEASE",
            eventKey: `order:${orderId}:cancel-release`,
            description: `Returned ${points} points from canceled order #${orderId}`,
            orderId,
        });
    }

    async awardPaidOrder(tx: TransactionContext, orderId: number): Promise<number> {
        const [order] = await tx.query<Array<{
            user_id: string | null;
            payment_provider: string | null;
            payment_status: string | null;
            simulated: number | null;
            pricing_snapshot: string | object | null;
            total_price: number | string;
            discount: number | string;
            loyalty_discount: number | string;
        }>>(
            `SELECT o.user_id, op.provider AS payment_provider, op.status AS payment_status, op.simulated,
                    o.pricing_snapshot, o.total_price, o.discount, o.loyalty_discount
             FROM orders o LEFT JOIN order_payments op ON op.order_id = o.id
             WHERE o.id = ? ORDER BY op.id DESC LIMIT 1 FOR UPDATE`, [orderId],
        );
        if (!order?.user_id || order.payment_status !== "paid" || order.simulated || !["cash", "payos"].includes(String(order.payment_provider))) return 0;

        const eligibleVnd = order.pricing_snapshot
            ? getEligibleMerchandiseFromSnapshot(order.pricing_snapshot, order.loyalty_discount)
            : await this.getLegacyOrderEligibleMerchandise(tx, orderId, Number(order.discount));
        if (!Number.isSafeInteger(eligibleVnd)) throw loyaltyError("Paid order merchandise value is invalid.", 409);
        const points = calculateEarnedPoints(eligibleVnd);
        const added = await this.repository.applyDelta(tx, {
            userId: order.user_id,
            pointsDelta: points,
            entryType: "ORDER_EARN",
            eventKey: `order:${orderId}:earn`,
            description: `Earned ${points} points from paid order #${orderId}`,
            amountVnd: eligibleVnd,
            orderId,
        });
        return added ? points : 0;
    }

    private async getLegacyOrderEligibleMerchandise(tx: TransactionContext, orderId: number, discount: number): Promise<number> {
        const [merchandise] = await tx.query<Array<{ total: number | string | null }>>(
            "SELECT COALESCE(SUM(total_price), 0) AS total FROM order_items WHERE order_id = ?", [orderId],
        );
        return Math.max(0, Number(merchandise?.total) - discount);
    }
}
