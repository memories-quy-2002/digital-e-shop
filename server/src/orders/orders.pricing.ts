import type { PromotionRow } from "../promotions/promotions.types";
import { createCheckoutError } from "./orders.service";

export function calculatePromotionDiscount(promotion: PromotionRow | null, totalPrice: number): number {
    if (!promotion) return 0;

    const minOrderValue = Number(promotion.min_order_value) || 0;
    if (totalPrice < minOrderValue) {
        throw createCheckoutError(
            `This promotion requires a minimum order of $${minOrderValue.toFixed(2)}`,
            400,
        );
    }

    const discountPercent = Math.min(Math.max(Number(promotion.discount_percent) || 0, 0), 100);
    return Math.min(totalPrice, (totalPrice * discountPercent) / 100);
}
