import type { PromotionInput, PromotionPayload } from "./promotions.dto";

export type PromotionRow = {
    id: number;
    discount_code: string;
    discount_percent: number;
    active?: number | boolean;
    min_order_value?: number;
    starts_at?: string | null;
    expires_at?: string | null;
    usage_limit?: number | null;
    usage_count?: number | string;
    remaining_uses?: number | string | null;
    loyalty_points_cost?: number | string | null;
    voucher_id?: number | string | null;
};

export type PromotionRedemptionUserId = string | null;

export type { PromotionInput, PromotionPayload };
