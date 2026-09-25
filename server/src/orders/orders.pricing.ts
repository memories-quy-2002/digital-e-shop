import type { PromotionRow } from "../promotions/promotions.types";
import { env } from "#src/config/env.config";
import { formatPaymentAmount } from "../payments/currency";
import { createCheckoutError } from "./orders.service";
import { HTTP_STATUS } from "#src/shared/constants/http-status";

export function calculatePromotionDiscount(promotion: PromotionRow | null, totalPrice: number): number {
    if (!promotion) return 0;

    const minOrderValue = Number(promotion.min_order_value) || 0;
    if (totalPrice < minOrderValue) {
        throw createCheckoutError(
            `This promotion requires a minimum order of ${formatPaymentAmount(minOrderValue, env.storeCurrency)}`,
            HTTP_STATUS.BAD_REQUEST,
        );
    }

    const discountPercent = Math.min(Math.max(Number(promotion.discount_percent) || 0, 0), 100);
    return Math.min(totalPrice, (totalPrice * discountPercent) / 100);
}
