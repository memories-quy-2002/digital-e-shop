import type { AppRequest, AppResponse } from "#/shared/interfaces/domain";
const util = require("util");
import pool from "#/config/database.config";
const { analyticsSummaryQuerySchema } = require("./analytics.validator");
const { parseBody } = require("#/shared/validation/requestSchemas");
import type {
    AnalyticsRecord,
    CategoryPerformanceRow,
    CustomerSegmentRow,
    DiscountOrderRow,
    InventoryRiskRow,
    OverviewRow,
    PaymentMethodRow,
    PromotionCatalogRow,
    RevenueTrendRow,
} from "./analytics.types";

const query = util.promisify(pool.query).bind(pool);

const TREND_DAYS = 14;
const COMPARISON_DAYS = 30;
const LOW_STOCK_THRESHOLD = 5;

type QueryParams = Array<string | number | null>;

const toNumber = (value: unknown) => Number(value) || 0;
const toNullableNumber = (value: unknown) => {
    if (value === null || value === undefined || value === "") {
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
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
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

const safeQuery = async <T extends AnalyticsRecord = AnalyticsRecord>(sql: string, params: QueryParams = [], fallback: T[] = []): Promise<T[]> => {
    try {
        return await query(sql, params) as T[];
    } catch (err) {
        const error = err as Error;
        console.error("[analytics] query failed:", error.message);
        return fallback;
    }
};

const mapRevenueTrend = (rows: RevenueTrendRow[]) => {
    const byDate = new Map(
        rows.map((row) => [
            String(row.date || ""),
            {
                date: String(row.date || ""),
                orders: toNumber(row.orders),
                completedOrders: toNumber(row.completed_orders),
                grossRevenue: toNumber(row.gross_revenue),
                netRevenue: toNumber(row.net_revenue),
                discounts: toNumber(row.discounts),
            },
        ])
    );

    return buildTrendWindow(TREND_DAYS).map((date) => {
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

async function getAnalyticsSummary(req: AppRequest, res: AppResponse) {
    try {
        parseBody(analyticsSummaryQuerySchema, req.query);
        const [
            overviewRows,
            revenueTrendRows,
            categoryPerformanceRows,
            customerSegmentRows,
            inventoryRiskRows,
            paymentMethodRows,
            promotionCatalogRows,
            discountOrderRows,
        ] = await Promise.all([
            safeQuery<OverviewRow>(
                `SELECT
                    COUNT(*) AS total_orders,
                    COALESCE(SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END), 0) AS completed_orders,
                    COALESCE(SUM(CASE WHEN status = 0 THEN 1 ELSE 0 END), 0) AS pending_orders,
                    COALESCE(SUM(CASE WHEN status = 2 THEN 1 ELSE 0 END), 0) AS cancelled_orders,
                    COALESCE(SUM(total_price), 0) AS gross_revenue,
                    COALESCE(SUM(CASE WHEN status <> 2 THEN total_price - discount ELSE 0 END), 0) AS net_revenue,
                    COALESCE(SUM(CASE WHEN status <> 2 THEN discount ELSE 0 END), 0) AS total_discounts,
                    COALESCE(AVG(CASE WHEN status <> 2 THEN total_price - discount END), 0) AS average_order_value,
                    COALESCE(SUM(CASE WHEN date_added >= UTC_TIMESTAMP() - INTERVAL ? DAY AND status <> 2 THEN 1 ELSE 0 END), 0) AS current_period_orders,
                    COALESCE(SUM(CASE WHEN date_added >= UTC_TIMESTAMP() - INTERVAL ? DAY AND status <> 2 THEN total_price - discount ELSE 0 END), 0) AS current_period_revenue,
                    COALESCE(SUM(CASE WHEN date_added < UTC_TIMESTAMP() - INTERVAL ? DAY AND date_added >= UTC_TIMESTAMP() - INTERVAL ? DAY AND status <> 2 THEN 1 ELSE 0 END), 0) AS previous_period_orders,
                    COALESCE(SUM(CASE WHEN date_added < UTC_TIMESTAMP() - INTERVAL ? DAY AND date_added >= UTC_TIMESTAMP() - INTERVAL ? DAY AND status <> 2 THEN total_price - discount ELSE 0 END), 0) AS previous_period_revenue,
                    (SELECT COUNT(*) FROM users WHERE role = 'Customer') AS customers,
                    (SELECT COUNT(DISTINCT o.user_id) FROM orders o WHERE o.status <> 2) AS active_customers,
                    (SELECT COUNT(*) FROM products) AS products,
                    (SELECT COUNT(*) FROM products WHERE stock = 0) AS out_of_stock,
                    (SELECT COUNT(*) FROM products WHERE stock > 0 AND stock <= ?) AS low_stock
                FROM orders`,
                [COMPARISON_DAYS, COMPARISON_DAYS, COMPARISON_DAYS, COMPARISON_DAYS * 2, COMPARISON_DAYS, COMPARISON_DAYS * 2, LOW_STOCK_THRESHOLD],
                [{} as OverviewRow]
            ),
            safeQuery<RevenueTrendRow>(
                `SELECT
                    DATE_FORMAT(o.date_added, '%Y-%m-%d') AS date,
                    COUNT(*) AS orders,
                    COALESCE(SUM(CASE WHEN o.status = 1 THEN 1 ELSE 0 END), 0) AS completed_orders,
                    COALESCE(SUM(o.total_price), 0) AS gross_revenue,
                    COALESCE(SUM(CASE WHEN o.status <> 2 THEN o.total_price - o.discount ELSE 0 END), 0) AS net_revenue,
                    COALESCE(SUM(CASE WHEN o.status <> 2 THEN o.discount ELSE 0 END), 0) AS discounts
                FROM orders o
                WHERE o.date_added >= UTC_DATE() - INTERVAL ? DAY
                GROUP BY DATE_FORMAT(o.date_added, '%Y-%m-%d')
                ORDER BY date`,
                [TREND_DAYS - 1]
            ),
            safeQuery<CategoryPerformanceRow>(
                `SELECT
                    c.name AS name,
                    COALESCE(SUM(oi.total_price), 0) AS revenue,
                    COALESCE(SUM(oi.quantity), 0) AS units,
                    COUNT(DISTINCT oi.order_id) AS orders
                FROM order_items oi
                JOIN orders o ON o.id = oi.order_id
                JOIN products p ON p.id = oi.product_id
                JOIN categories c ON c.id = p.category_id
                WHERE o.status <> 2
                GROUP BY c.id, c.name
                ORDER BY revenue DESC
                LIMIT 8`
            ),
            safeQuery<CustomerSegmentRow>(
                `SELECT
                    CASE
                        WHEN customer_orders.order_count >= 5 THEN 'Loyal'
                        WHEN customer_orders.order_count >= 2 THEN 'Repeat'
                        WHEN customer_orders.order_count = 1 THEN 'New buyer'
                        ELSE 'No orders'
                    END AS name,
                    COUNT(*) AS value
                FROM (
                    SELECT
                        u.id,
                        COUNT(o.id) AS order_count
                    FROM users u
                    LEFT JOIN orders o ON o.user_id = u.id AND o.status <> 2
                    WHERE u.role = 'Customer'
                    GROUP BY u.id
                ) customer_orders
                GROUP BY name
                ORDER BY value DESC`
            ),
            safeQuery<InventoryRiskRow>(
                `SELECT
                    p.id,
                    p.name,
                    p.stock,
                    c.name AS category,
                    b.name AS brand
                FROM products p
                JOIN categories c ON c.id = p.category_id
                JOIN brands b ON b.id = p.brand_id
                WHERE p.stock >= 0
                ORDER BY
                    CASE
                        WHEN p.stock = 0 THEN 0
                        WHEN p.stock <= ? THEN 1
                        ELSE 2
                    END ASC,
                    p.stock ASC,
                    p.id DESC
                LIMIT 10`,
                [LOW_STOCK_THRESHOLD]
            ),
            safeQuery<PaymentMethodRow>(
                `SELECT
                    COALESCE(NULLIF(payment_method, ''), 'unknown') AS name,
                    COUNT(*) AS value,
                    COALESCE(SUM(CASE WHEN status <> 2 THEN total_price - discount ELSE 0 END), 0) AS revenue
                FROM orders
                GROUP BY COALESCE(NULLIF(payment_method, ''), 'unknown')
                ORDER BY value DESC, revenue DESC`
            ),
            safeQuery<PromotionCatalogRow>(
                `SELECT
                    id,
                    discount_code,
                    discount_percent,
                    active,
                    starts_at,
                    expires_at,
                    usage_limit
                FROM discounts
                ORDER BY active DESC, id DESC
                LIMIT 8`
            ),
            safeQuery<DiscountOrderRow>(
                `SELECT
                    COUNT(*) AS discounted_orders,
                    COALESCE(SUM(discount), 0) AS total_discount_given,
                    COALESCE(SUM(total_price - discount), 0) AS discounted_revenue
                FROM orders
                WHERE status <> 2 AND discount > 0`,
                [],
                [{} as DiscountOrderRow]
            ),
        ]);

        const overview = (overviewRows[0] || {}) as OverviewRow;
        const discountOrders = (discountOrderRows[0] || {}) as DiscountOrderRow;
        const revenueTrend = mapRevenueTrend(revenueTrendRows);
        const totalCategoryRevenue = categoryPerformanceRows.reduce((sum, row) => sum + toNumber(row.revenue), 0);
        const statusBreakdown = [
            { name: "Pending", value: toNumber(overview.pending_orders) },
            { name: "Done", value: toNumber(overview.completed_orders) },
            { name: "Cancelled", value: toNumber(overview.cancelled_orders) },
        ];

        const customerSegments = customerSegmentRows.map((row) => ({
            name: String(row.name || "Unknown"),
            value: toNumber(row.value),
        }));

        const categoryPerformance = categoryPerformanceRows.map((row) => {
            const revenue = toNumber(row.revenue);
            return {
                name: String(row.name || "Uncategorized"),
                revenue,
                units: toNumber(row.units),
                orders: toNumber(row.orders),
                share: totalCategoryRevenue > 0 ? roundTo((revenue / totalCategoryRevenue) * 100, 1) : 0,
            };
        });

        const inventoryRisk = inventoryRiskRows.map((row) => ({
            id: Number(row.id),
            name: String(row.name || ""),
            stock: toNumber(row.stock),
            category: String(row.category || ""),
            brand: String(row.brand || ""),
        }));

        const paymentMethods = paymentMethodRows.map((row) => ({
            name: String(row.name || "unknown"),
            value: toNumber(row.value),
            revenue: toNumber(row.revenue),
        }));

        const promotionCatalog = promotionCatalogRows.map((row) => ({
            id: Number(row.id),
            code: String(row.discount_code || ""),
            discountPercent: toNumber(row.discount_percent),
            active: Boolean(Number(row.active ?? 0)),
            startsAt: row.starts_at || null,
            expiresAt: row.expires_at || null,
            usageLimit: toNullableNumber(row.usage_limit),
        }));

        const currentNetRevenue = toNumber(overview.current_period_revenue);
        const previousNetRevenue = toNumber(overview.previous_period_revenue);
        const currentOrders = toNumber(overview.current_period_orders);
        const previousOrders = toNumber(overview.previous_period_orders);
        const customers = toNumber(overview.customers);
        const activeCustomers = toNumber(overview.active_customers);
        const completedOrders = toNumber(overview.completed_orders);
        const nonCancelledOrders = Math.max(toNumber(overview.total_orders) - toNumber(overview.cancelled_orders), 0);

        const summary = {
            generatedAt: new Date().toISOString(),
            currency: "USD",
            windows: {
                trendDays: TREND_DAYS,
                comparisonDays: COMPARISON_DAYS,
            },
            kpis: {
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
            },
            charts: {
                revenueTrend,
                orderStatusBreakdown: statusBreakdown,
                categoryPerformance,
                customerSegments,
                paymentMethods,
            },
            operations: {
                inventoryRisk,
                promotions: {
                    discountedOrders: toNumber(discountOrders.discounted_orders),
                    totalDiscountGiven: toNumber(discountOrders.total_discount_given),
                    discountedRevenue: toNumber(discountOrders.discounted_revenue),
                    attachedCodesTracked: false,
                    configured: promotionCatalog,
                },
            },
        };

        return res.status(200).json({
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
            promotionPerformance: summary.operations.promotions.configured.map((promotion) => ({
                name: promotion.code,
                discount_percent: promotion.discountPercent,
                discount_given: 0,
                estimated_orders: 0,
                active: promotion.active,
                starts_at: promotion.startsAt,
                expires_at: promotion.expiresAt,
                usage_limit: promotion.usageLimit,
            })),
            msg: "Analytics summary retrieved successfully",
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Unable to load analytics summary" });
    }
}

module.exports = {
    getAnalyticsSummary,
};
