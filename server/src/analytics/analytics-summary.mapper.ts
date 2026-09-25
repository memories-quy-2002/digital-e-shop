import type { AnalyticsRange } from './analytics-range';
import type {
    AnalyticsSummaryRows,
    OverviewRow,
    RevenueTrendRow,
} from './analytics.types';

import { LOW_STOCK_THRESHOLD } from '#src/shared/constants/product';
import { CURRENCY_CODE } from '#src/shared/constants/currency';

const toNumber = (value: unknown) => Number(value) || 0;
const toNullableNumber = (value: unknown) => {
    if (value === null || value === undefined || value === '') {
        return null;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

const roundTo = (value: number, digits = 2) => Number(value.toFixed(digits));

const calculateDelta = (current: number, previous: number) => {
    if (previous === 0) {
        return current === 0 ? 0 : 100;
    }

    return roundTo(((current - previous) / previous) * 100, 1);
};

const formatUtcDate = (date: Date) => {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const buildTrendWindow = (days: number) => {
    const labels: string[] = [];
    const current = new Date();

    for (let offset = days - 1; offset >= 0; offset -= 1) {
        const date = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate() - offset));
        labels.push(formatUtcDate(date));
    }

    return labels;
};

const mapRevenueTrend = (rows: RevenueTrendRow[], trendDays: number) => {
    const byDate = new Map(
        rows.map((row) => [
            String(row.date || ''),
            {
                date: String(row.date || ''),
                orders: toNumber(row.orders),
                completedOrders: toNumber(row.completed_orders),
                grossRevenue: toNumber(row.gross_revenue),
                netRevenue: toNumber(row.net_revenue),
                discounts: toNumber(row.discounts),
            },
        ]),
    );

    return buildTrendWindow(trendDays).map((date) => {
        const point = byDate.get(date);

        if (point) {
            return point;
        }

        return {
            date,
            orders: 0,
            completedOrders: 0,
            grossRevenue: 0,
            netRevenue: 0,
            discounts: 0,
        };
    });
};

const mapKpis = (overview: OverviewRow) => {
    const currentNetRevenue = toNumber(overview.current_period_revenue);
    const previousNetRevenue = toNumber(overview.previous_period_revenue);
    const currentOrders = toNumber(overview.current_period_orders);
    const previousOrders = toNumber(overview.previous_period_orders);
    const customers = toNumber(overview.customers);
    const activeCustomers = toNumber(overview.active_customers);
    const completedOrders = toNumber(overview.completed_orders);
    const nonCancelledOrders = Math.max(toNumber(overview.total_orders) - toNumber(overview.cancelled_orders), 0);

    return {
        orders: {
            total: toNumber(overview.total_orders),
            completed: completedOrders,
            pending: toNumber(overview.pending_orders),
            cancelled: toNumber(overview.cancelled_orders),
            nonCancelled: nonCancelledOrders,
            completionRate: nonCancelledOrders > 0 ? roundTo((completedOrders / nonCancelledOrders) * 100, 1) : 0,
            comparison: {
                current: currentOrders,
                previous: previousOrders,
                deltaPercent: calculateDelta(currentOrders, previousOrders),
            },
        },
        revenue: {
            gross: toNumber(overview.gross_revenue),
            net: toNumber(overview.net_revenue),
            discounts: toNumber(overview.total_discounts),
            averageOrderValue: roundTo(toNumber(overview.average_order_value)),
            comparison: {
                current: currentNetRevenue,
                previous: previousNetRevenue,
                deltaPercent: calculateDelta(currentNetRevenue, previousNetRevenue),
            },
        },
        customers: {
            total: customers,
            active: activeCustomers,
            inactive: Math.max(customers - activeCustomers, 0),
            activeRate: customers > 0 ? roundTo((activeCustomers / customers) * 100, 1) : 0,
        },
        inventory: {
            totalProducts: toNumber(overview.products),
            outOfStock: toNumber(overview.out_of_stock),
            lowStock: toNumber(overview.low_stock),
            lowStockThreshold: LOW_STOCK_THRESHOLD,
        },
    };
};

const mapCharts = (rows: AnalyticsSummaryRows, rangeDays: number) => {
    const overview = rows.overviewRows[0] || {};
    const totalCategoryRevenue = rows.categoryPerformanceRows.reduce((sum, row) => sum + toNumber(row.revenue), 0);

    return {
        revenueTrend: mapRevenueTrend(rows.revenueTrendRows, rangeDays),
        orderStatusBreakdown: [
            { name: 'Pending', value: toNumber(overview.pending_orders) },
            { name: 'Done', value: toNumber(overview.completed_orders) },
            { name: 'Cancelled', value: toNumber(overview.cancelled_orders) },
        ],
        categoryPerformance: rows.categoryPerformanceRows.map((row) => {
            const revenue = toNumber(row.revenue);
            return {
                name: String(row.name || 'Uncategorized'),
                revenue,
                units: toNumber(row.units),
                orders: toNumber(row.orders),
                share: totalCategoryRevenue > 0 ? roundTo((revenue / totalCategoryRevenue) * 100, 1) : 0,
            };
        }),
        customerSegments: rows.customerSegmentRows.map((row) => ({
            name: String(row.name || 'Unknown'),
            value: toNumber(row.value),
        })),
        paymentMethods: rows.paymentMethodRows.map((row) => ({
            name: String(row.name || 'unknown'),
            value: toNumber(row.value),
            revenue: toNumber(row.revenue),
        })),
    };
};

const mapOperations = (rows: AnalyticsSummaryRows) => {
    const discountOrders = rows.discountOrderRows[0] || {};
    const guestCartAnalytics = rows.guestCartAnalyticsRows[0] || {};
    const inventoryRisk = rows.inventoryRiskRows.map((row) => ({
        id: Number(row.id),
        name: String(row.name || ''),
        stock: toNumber(row.stock),
        category: String(row.category || ''),
        brand: String(row.brand || ''),
    }));
    const promotionCatalog = rows.promotionCatalogRows.map((row) => ({
        id: Number(row.id),
        code: String(row.discount_code || ''),
        discountPercent: toNumber(row.discount_percent),
        active: Boolean(Number(row.active ?? 0)),
        startsAt: row.starts_at || null,
        expiresAt: row.expires_at || null,
        usageLimit: toNullableNumber(row.usage_limit),
    }));
    const promotionPerformance = new Map(
        rows.promotionPerformanceRows.map((row) => [Number(row.discount_id), {
            discountGiven: toNumber(row.discount_total),
            estimatedOrders: toNumber(row.redemption_count),
        }]),
    );

    return {
        inventoryRisk,
        promotions: {
            discountedOrders: toNumber(discountOrders.discounted_orders),
            totalDiscountGiven: toNumber(discountOrders.total_discount_given),
            discountedRevenue: toNumber(discountOrders.discounted_revenue),
            attachedCodesTracked: true,
            configured: promotionCatalog,
            performance: promotionCatalog.map((promotion) => ({
                ...promotion,
                discountGiven: roundTo(promotionPerformance.get(promotion.id)?.discountGiven || 0),
                estimatedOrders: promotionPerformance.get(promotion.id)?.estimatedOrders || 0,
            })),
        },
        guestCarts: {
            active: toNumber(guestCartAnalytics.active_carts),
            activeItems: toNumber(guestCartAnalytics.active_items),
            abandoned: toNumber(guestCartAnalytics.abandoned_carts),
            converted: toNumber(guestCartAnalytics.converted_carts),
            expired: toNumber(guestCartAnalytics.expired_carts),
        },
    };
};

export const mapAnalyticsSummary = (rows: AnalyticsSummaryRows, range: AnalyticsRange) => {
    const overview = rows.overviewRows[0] || {};
    const summary = {
        generatedAt: new Date().toISOString(),
        currency: CURRENCY_CODE.USD,
        windows: {
            range: range.key,
            trendDays: range.days,
            comparisonDays: range.days,
        },
        kpis: mapKpis(overview),
        charts: mapCharts(rows, range.days),
        operations: mapOperations(rows),
    };

    return {
        summary,
        overview: {
            orders: summary.kpis.orders.total,
            revenue: summary.kpis.revenue.net,
            average_order_value: summary.kpis.revenue.averageOrderValue,
            customers: summary.kpis.customers.total,
            out_of_stock: summary.kpis.inventory.outOfStock,
            low_stock: summary.kpis.inventory.lowStock,
        },
        revenueTrend: summary.charts.revenueTrend.map((point) => ({
            date: point.date,
            orders: point.orders,
            revenue: point.netRevenue,
        })),
        categoryRevenue: summary.charts.categoryPerformance.map((point) => ({
            name: point.name,
            revenue: point.revenue,
            units: point.units,
        })),
        customerSegments: summary.charts.customerSegments,
        inventoryRisk: summary.operations.inventoryRisk,
        promotionPerformance: summary.operations.promotions.performance.map((promotion) => ({
            name: promotion.code,
            discount_percent: promotion.discountPercent,
            discount_given: promotion.discountGiven,
            estimated_orders: promotion.estimatedOrders,
            active: promotion.active,
            starts_at: promotion.startsAt,
            expires_at: promotion.expiresAt,
            usage_limit: promotion.usageLimit,
        })),
        msg: 'Analytics summary retrieved successfully',
    };
};
