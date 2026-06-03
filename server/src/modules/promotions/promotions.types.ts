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
};

export type { PromotionInput, PromotionPayload };
