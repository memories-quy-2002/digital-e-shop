import type { LooseRecord } from "#src/shared/interfaces/domain";

export type OverviewRow = {
    total_orders?: number;
    completed_orders?: number;
    pending_orders?: number;
    cancelled_orders?: number;
    gross_revenue?: number;
    net_revenue?: number;
    total_discounts?: number;
    average_order_value?: number;
    current_period_orders?: number;
    previous_period_orders?: number;
    current_period_revenue?: number;
    previous_period_revenue?: number;
    customers?: number;
    active_customers?: number;
    products?: number;
    out_of_stock?: number;
    low_stock?: number;
};

export type RevenueTrendRow = {
    date?: string;
    orders?: number;
    completed_orders?: number;
    gross_revenue?: number;
    net_revenue?: number;
    discounts?: number;
};

export type CategoryPerformanceRow = {
    name?: string;
    revenue?: number;
    units?: number;
    orders?: number;
};

export type CustomerSegmentRow = {
    name?: string;
    value?: number;
};

export type InventoryRiskRow = {
    id?: number;
    name?: string;
    stock?: number;
    category?: string;
    brand?: string;
};

export type PaymentMethodRow = {
    name?: string;
    value?: number;
    revenue?: number;
};

export type PromotionCatalogRow = {
    id?: number;
    discount_code?: string;
    discount_percent?: number;
    active?: number | boolean;
    starts_at?: string | null;
    expires_at?: string | null;
    usage_limit?: number | null;
};

export type DiscountOrderRow = {
    discounted_orders?: number;
    total_discount_given?: number;
    discounted_revenue?: number;
};

export type AnalyticsRecord = LooseRecord;

