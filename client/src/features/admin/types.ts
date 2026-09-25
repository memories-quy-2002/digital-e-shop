export type AnalyticsComparison = {
    current: number;
    previous: number;
    deltaPercent: number;
};

export type AnalyticsTrendPoint = {
    date: string;
    orders?: number;
    netRevenue?: number;
    revenue?: number;
};

export type AnalyticsCategoryPoint = {
    name: string;
    revenue?: number;
    value?: number;
    units?: number;
};

export type AdminAnalyticsSummarySection = {
    kpis?: {
        orders?: {
            total?: number;
            pending?: number;
            completed?: number;
            cancelled?: number;
            nonCancelled?: number;
            comparison?: AnalyticsComparison;
        };
        revenue?: {
            net?: number;
            averageOrderValue?: number;
            comparison?: AnalyticsComparison;
        };
        inventory?: {
            totalProducts?: number;
            lowStock?: number;
            outOfStock?: number;
        };
        customers?: {
            total?: number;
        };
    };
    charts?: {
        revenueTrend?: AnalyticsTrendPoint[];
        categoryPerformance?: AnalyticsCategoryPoint[];
        paymentMethods?: Array<{
            name?: string;
            value?: number;
            revenue?: number;
        }>;
        orderStatusBreakdown?: Array<{
            name: string;
            value: number;
        }>;
    };
    operations?: {
        inventoryRisk?: Array<{
            id?: number;
            name: string;
            stock: number;
            category?: string;
            brand?: string;
        }>;
        promotions?: {
            discountedOrders?: number;
            totalDiscountGiven?: number;
            discountedRevenue?: number;
            performance?: Array<{
                id: number;
                code: string;
                discountPercent: number;
                discountGiven: number;
                estimatedOrders: number;
                active: boolean;
            }>;
        };
        guestCarts?: {
            active?: number;
            activeItems?: number;
            abandoned?: number;
            converted?: number;
            expired?: number;
        };
    };
};

export type AdminAnalyticsSummary = AdminAnalyticsSummarySection & {
    summary?: AdminAnalyticsSummarySection;
    overview?: {
        orders?: number;
        revenue?: number;
        average_order_value?: number;
        customers?: number;
        out_of_stock?: number;
        low_stock?: number;
    };
    revenueTrend?: AnalyticsTrendPoint[];
    categoryRevenue?: AnalyticsCategoryPoint[];
    inventoryRisk?: Array<{
        id?: number;
        name: string;
        stock: number;
        category?: string;
        brand?: string;
    }>;
};

export type AdminInventoryMovement = {
    id: number;
    product_id: number;
    product_name: string | null;
    order_id: number | null;
    movement_type: string;
    quantity_change: number;
    stock_before: number | null;
    stock_after: number | null;
    note: string | null;
    created_at: string;
};

export type AdminPromotion = {
    id: number;
    discount_code: string;
    discount_percent: number;
    active: boolean;
    min_order_value: number;
    starts_at: string | null;
    expires_at: string | null;
    usage_limit: number | null;
};
