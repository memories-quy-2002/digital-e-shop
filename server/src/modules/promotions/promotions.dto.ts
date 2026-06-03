export type PromotionInput = {
    id?: number | string;
    discountCode?: string;
    discount_code?: string;
    discountPercent?: number | string;
    discount_percent?: number | string;
    active?: boolean | number | string;
    minOrderValue?: number | string;
    min_order_value?: number | string;
    startsAt?: string | null;
    starts_at?: string | null;
    expiresAt?: string | null;
    expires_at?: string | null;
    usageLimit?: number | string | null;
    usage_limit?: number | string | null;
};

export type PromotionPayload = {
    discountCode: string;
    discountPercent: number;
    active: 0 | 1;
    minOrderValue: number;
    startsAt: string | null;
    expiresAt: string | null;
    usageLimit: number | null;
};
