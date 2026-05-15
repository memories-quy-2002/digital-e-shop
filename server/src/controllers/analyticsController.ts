import type { Request, Response } from "express";
import type { LooseRecord } from "../types/domain";
const util = require("util");
const pool = require("../config/db");

const query = util.promisify(pool.query).bind(pool);

const toNumber = (value: unknown) => Number(value) || 0;
const safeQuery = async <T extends LooseRecord = LooseRecord>(sql: string, fallback: T[] = []): Promise<T[]> => {
    try {
        return await query(sql) as T[];
    } catch (err) {
        const error = err as Error;
        console.error("[analytics] query failed:", error.message);
        return fallback;
    }
};

async function getAnalyticsSummary(req: Request, res: Response) {
    try {
        const [
            overviewRows,
            revenueTrend,
            categoryRevenue,
            customerSegments,
            inventoryRisk,
            promotionPerformance,
        ] = await Promise.all([
            safeQuery(
                `SELECT
                    (SELECT COUNT(*) FROM orders) AS orders,
                    (SELECT COALESCE(SUM(total_price - discount), 0) FROM orders WHERE status = 1) AS revenue,
                    (SELECT COALESCE(AVG(total_price - discount), 0) FROM orders WHERE status = 1) AS average_order_value,
                    (SELECT COUNT(*) FROM users WHERE role = 'Customer') AS customers,
                    (SELECT COUNT(*) FROM products WHERE stock = 0) AS out_of_stock,
                    (SELECT COUNT(*) FROM products WHERE stock > 0 AND stock <= 5) AS low_stock`,
                [{}]
            ),
            safeQuery(
                `SELECT
                    DATE_FORMAT(o.date_added, '%Y-%m-%d') AS date,
                    COUNT(*) AS orders,
                    COALESCE(SUM(o.total_price - o.discount), 0) AS revenue
                FROM orders o
                WHERE o.date_added >= UTC_DATE() - INTERVAL 13 DAY
                GROUP BY DATE_FORMAT(o.date_added, '%Y-%m-%d')
                ORDER BY date`
            ),
            safeQuery(
                `SELECT
                    c.name AS name,
                    COALESCE(SUM(oi.total_price), 0) AS revenue,
                    COALESCE(SUM(oi.quantity), 0) AS units
                FROM order_items oi
                JOIN orders o ON o.id = oi.order_id
                JOIN products p ON p.id = oi.product_id
                JOIN categories c ON c.id = p.category_id
                WHERE o.status <> 2
                GROUP BY c.id, c.name
                ORDER BY revenue DESC
                LIMIT 6`
            ),
            safeQuery(
                `SELECT
                    CASE
                        WHEN COUNT(o.id) >= 5 THEN 'Loyal'
                        WHEN COUNT(o.id) >= 2 THEN 'Repeat'
                        WHEN COUNT(o.id) = 1 THEN 'New buyer'
                        ELSE 'No orders'
                    END AS name,
                    COUNT(*) AS value
                FROM users u
                LEFT JOIN orders o ON o.user_id = u.id
                WHERE u.role = 'Customer'
                GROUP BY name
                ORDER BY value DESC`
            ),
            safeQuery(
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
                ORDER BY p.stock ASC, p.id DESC
                LIMIT 10`
            ),
            safeQuery(
                `SELECT
                    d.discount_code AS name,
                    d.discount_percent,
                    COALESCE(SUM(o.discount), 0) AS discount_given,
                    COUNT(o.id) AS estimated_orders
                FROM discounts d
                LEFT JOIN orders o ON o.discount > 0
                GROUP BY d.id, d.discount_code, d.discount_percent
                ORDER BY d.id DESC
                LIMIT 8`
            ),
        ]);

        const overview = (overviewRows[0] || {}) as LooseRecord;
        return res.status(200).json({
            overview: {
                orders: toNumber(overview.orders),
                revenue: toNumber(overview.revenue),
                average_order_value: toNumber(overview.average_order_value),
                customers: toNumber(overview.customers),
                out_of_stock: toNumber(overview.out_of_stock),
                low_stock: toNumber(overview.low_stock),
            },
            revenueTrend: revenueTrend.map((row) => ({
                date: row.date,
                orders: toNumber(row.orders),
                revenue: toNumber(row.revenue),
            })),
            categoryRevenue: categoryRevenue.map((row) => ({
                name: row.name,
                revenue: toNumber(row.revenue),
                units: toNumber(row.units),
            })),
            customerSegments: customerSegments.map((row) => ({ name: row.name, value: toNumber(row.value) })),
            inventoryRisk: inventoryRisk.map((row) => ({
                id: Number(row.id),
                name: row.name,
                stock: toNumber(row.stock),
                category: row.category,
                brand: row.brand,
            })),
            promotionPerformance: promotionPerformance.map((row) => ({
                name: row.name,
                discount_percent: toNumber(row.discount_percent),
                discount_given: toNumber(row.discount_given),
                estimated_orders: toNumber(row.estimated_orders),
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
