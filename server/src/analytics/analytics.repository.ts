import { Injectable } from '@nestjs/common';
import { ORDER_STATUS } from '#src/shared/constants/order-status';
import { USER_ROLE } from '#src/shared/constants/user';
import { LOW_STOCK_THRESHOLD } from '#src/shared/constants/product';
import { ANALYTICS_LIMITS } from '#src/shared/constants/operational-limits';
import { DISCOUNT_REDEMPTION_STATUS } from '#src/promotions/promotions.constants';
import util from 'node:util';
import pool from '#src/config/database.config';
import type {
    AnalyticsRecord,
    AnalyticsSummaryRows,
    CategoryPerformanceRow,
    CustomerSegmentRow,
    DiscountOrderRow,
    GuestCartAnalyticsRow,
    InventoryRiskRow,
    OverviewRow,
    PaymentMethodRow,
    PromotionCatalogRow,
    PromotionPerformanceRow,
    RevenueTrendRow,
} from './analytics.types';

const query = util.promisify(pool.query).bind(pool);

type QueryParams = Array<string | number | null>;

@Injectable()
export class AnalyticsRepository {
    private async queryRows<T extends AnalyticsRecord = AnalyticsRecord>(
        sql: string,
        params: QueryParams = [],
    ): Promise<T[]> {
        return (await query(sql, params)) as T[];
    }

    private getOverviewRows(rangeDays: number): Promise<OverviewRow[]> {
        return this.queryRows<OverviewRow>(
            `SELECT
                COUNT(*) AS total_orders,
                COALESCE(SUM(CASE WHEN status = ${ORDER_STATUS.DONE} THEN 1 ELSE 0 END), 0) AS completed_orders,
                COALESCE(SUM(CASE WHEN status = ${ORDER_STATUS.PENDING} THEN 1 ELSE 0 END), 0) AS pending_orders,
                COALESCE(SUM(CASE WHEN status = ${ORDER_STATUS.CANCELED} THEN 1 ELSE 0 END), 0) AS cancelled_orders,
                COALESCE(SUM(CASE WHEN status <> ${ORDER_STATUS.CANCELED} THEN total_price ELSE 0 END), 0) AS gross_revenue,
                COALESCE(SUM(CASE WHEN status <> ${ORDER_STATUS.CANCELED} THEN total_price - discount ELSE 0 END), 0) AS net_revenue,
                COALESCE(SUM(CASE WHEN status <> ${ORDER_STATUS.CANCELED} THEN discount ELSE 0 END), 0) AS total_discounts,
                COALESCE(AVG(CASE WHEN status = ${ORDER_STATUS.DONE} THEN total_price - discount END), 0) AS average_order_value,
                COALESCE(SUM(CASE WHEN date_added >= UTC_TIMESTAMP() - INTERVAL ? DAY AND status <> ${ORDER_STATUS.CANCELED} THEN 1 ELSE 0 END), 0) AS current_period_orders,
                COALESCE(SUM(CASE WHEN date_added >= UTC_TIMESTAMP() - INTERVAL ? DAY AND status <> ${ORDER_STATUS.CANCELED} THEN total_price - discount ELSE 0 END), 0) AS current_period_revenue,
                COALESCE(SUM(CASE WHEN date_added < UTC_TIMESTAMP() - INTERVAL ? DAY AND date_added >= UTC_TIMESTAMP() - INTERVAL ? DAY AND status <> ${ORDER_STATUS.CANCELED} THEN 1 ELSE 0 END), 0) AS previous_period_orders,
                COALESCE(SUM(CASE WHEN date_added < UTC_TIMESTAMP() - INTERVAL ? DAY AND date_added >= UTC_TIMESTAMP() - INTERVAL ? DAY AND status <> ${ORDER_STATUS.CANCELED} THEN total_price - discount ELSE 0 END), 0) AS previous_period_revenue,
                (SELECT COUNT(*) FROM users WHERE role = '${USER_ROLE.CUSTOMER}') AS customers,
                (SELECT COUNT(DISTINCT o.user_id) FROM orders o WHERE o.status <> ${ORDER_STATUS.CANCELED}) AS active_customers,
                (SELECT COUNT(*) FROM products) AS products,
                (SELECT COUNT(*) FROM products WHERE stock = 0) AS out_of_stock,
                (SELECT COUNT(*) FROM products WHERE stock > 0 AND stock <= ?) AS low_stock
            FROM orders`,
            [rangeDays, rangeDays, rangeDays, rangeDays * 2, rangeDays, rangeDays * 2, LOW_STOCK_THRESHOLD],
        );
    }

    private getRevenueTrendRows(rangeDays: number): Promise<RevenueTrendRow[]> {
        return this.queryRows<RevenueTrendRow>(
            `SELECT
                DATE_FORMAT(o.date_added, '%Y-%m-%d') AS date,
                COALESCE(SUM(CASE WHEN o.status <> ${ORDER_STATUS.CANCELED} THEN 1 ELSE 0 END), 0) AS orders,
                COALESCE(SUM(CASE WHEN o.status = ${ORDER_STATUS.DONE} THEN 1 ELSE 0 END), 0) AS completed_orders,
                COALESCE(SUM(CASE WHEN o.status <> ${ORDER_STATUS.CANCELED} THEN o.total_price ELSE 0 END), 0) AS gross_revenue,
                COALESCE(SUM(CASE WHEN o.status <> ${ORDER_STATUS.CANCELED} THEN o.total_price - o.discount ELSE 0 END), 0) AS net_revenue,
                COALESCE(SUM(CASE WHEN o.status <> ${ORDER_STATUS.CANCELED} THEN o.discount ELSE 0 END), 0) AS discounts
            FROM orders o
            WHERE o.date_added >= UTC_DATE() - INTERVAL ? DAY
            GROUP BY DATE_FORMAT(o.date_added, '%Y-%m-%d')
            ORDER BY date`,
            [rangeDays - 1],
        );
    }

    private getCategoryPerformanceRows(rangeDays: number): Promise<CategoryPerformanceRow[]> {
        return this.queryRows<CategoryPerformanceRow>(
            `SELECT
                c.name AS name,
                COALESCE(SUM(oi.total_price), 0) AS revenue,
                COALESCE(SUM(oi.quantity), 0) AS units,
                COUNT(DISTINCT oi.order_id) AS orders
            FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            JOIN products p ON p.id = oi.product_id
            JOIN categories c ON c.id = p.category_id
            WHERE o.status <> ${ORDER_STATUS.CANCELED}
                AND o.date_added >= UTC_DATE() - INTERVAL ? DAY
            GROUP BY c.id, c.name
            ORDER BY revenue DESC
            LIMIT ${ANALYTICS_LIMITS.CATEGORY_PERFORMANCE}`,
            [rangeDays],
        );
    }

    private getCustomerSegmentRows(): Promise<CustomerSegmentRow[]> {
        return this.queryRows<CustomerSegmentRow>(
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
                LEFT JOIN orders o ON o.user_id = u.id AND o.status <> ${ORDER_STATUS.CANCELED}
                WHERE u.role = '${USER_ROLE.CUSTOMER}'
                GROUP BY u.id
            ) customer_orders
            GROUP BY name
            ORDER BY value DESC`,
        );
    }

    private getInventoryRiskRows(): Promise<InventoryRiskRow[]> {
        return this.queryRows<InventoryRiskRow>(
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
            LIMIT ${ANALYTICS_LIMITS.INVENTORY_RISK}`,
            [LOW_STOCK_THRESHOLD],
        );
    }

    private getPaymentMethodRows(rangeDays: number): Promise<PaymentMethodRow[]> {
        return this.queryRows<PaymentMethodRow>(
            `SELECT
                COALESCE(NULLIF(payment_method, ''), 'unknown') AS name,
                SUM(CASE WHEN status <> ${ORDER_STATUS.CANCELED} THEN 1 ELSE 0 END) AS value,
                COALESCE(SUM(CASE WHEN status <> ${ORDER_STATUS.CANCELED} THEN total_price - discount ELSE 0 END), 0) AS revenue
            FROM orders
            WHERE date_added >= UTC_DATE() - INTERVAL ? DAY
            GROUP BY COALESCE(NULLIF(payment_method, ''), 'unknown')
            ORDER BY value DESC, revenue DESC`,
            [rangeDays],
        );
    }

    private getPromotionCatalogRows(): Promise<PromotionCatalogRow[]> {
        return this.queryRows<PromotionCatalogRow>(
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
            LIMIT ${ANALYTICS_LIMITS.PROMOTION_CATALOG}`,
        );
    }

    private getDiscountOrderRows(rangeDays: number): Promise<DiscountOrderRow[]> {
        return this.queryRows<DiscountOrderRow>(
            `SELECT
                COUNT(*) AS discounted_orders,
                COALESCE(SUM(discount), 0) AS total_discount_given,
                COALESCE(SUM(total_price - discount), 0) AS discounted_revenue
            FROM orders
            WHERE status <> ${ORDER_STATUS.CANCELED} AND discount > 0
                AND date_added >= UTC_DATE() - INTERVAL ? DAY`,
            [rangeDays],
        );
    }

    private getPromotionPerformanceRows(rangeDays: number): Promise<PromotionPerformanceRow[]> {
        return this.queryRows<PromotionPerformanceRow>(
            `SELECT
                d.id AS discount_id,
                d.discount_code,
                COUNT(DISTINCT dr.order_id) AS redemption_count,
                COALESCE(SUM(o.discount), 0) AS discount_total
             FROM discount_redemptions dr
             JOIN discounts d ON d.id = dr.discount_id
             JOIN orders o ON o.id = dr.order_id AND o.status <> ${ORDER_STATUS.CANCELED}
             WHERE dr.status = '${DISCOUNT_REDEMPTION_STATUS.CONSUMED}' AND dr.order_id IS NOT NULL
                AND o.date_added >= UTC_DATE() - INTERVAL ? DAY
             GROUP BY d.id, d.discount_code
             ORDER BY redemption_count DESC, discount_total DESC`,
            [rangeDays],
        );
    }

    private getGuestCartAnalyticsRows(): Promise<GuestCartAnalyticsRow[]> {
        return this.queryRows<GuestCartAnalyticsRow>(
            `SELECT
                COUNT(CASE WHEN gc.converted_at IS NULL AND gc.expires_at > UTC_TIMESTAMP()
                    AND EXISTS (SELECT 1 FROM guest_cart_items gci_active WHERE gci_active.guest_cart_id = gc.id) THEN 1 END) AS active_carts,
                COUNT(CASE WHEN gc.converted_at IS NOT NULL THEN 1 END) AS converted_carts,
                COUNT(CASE WHEN gc.converted_at IS NULL AND gc.expires_at <= UTC_TIMESTAMP()
                    AND EXISTS (SELECT 1 FROM guest_cart_items gci_expired WHERE gci_expired.guest_cart_id = gc.id) THEN 1 END) AS expired_carts,
                COUNT(CASE WHEN gc.converted_at IS NULL AND gc.expires_at > UTC_TIMESTAMP()
                    AND gc.updated_at < UTC_TIMESTAMP() - INTERVAL ${ANALYTICS_LIMITS.ABANDONED_GUEST_CART_HOURS} HOUR
                    AND EXISTS (SELECT 1 FROM guest_cart_items gci_abandoned WHERE gci_abandoned.guest_cart_id = gc.id) THEN 1 END) AS abandoned_carts,
                COALESCE((
                    SELECT SUM(gci.quantity)
                    FROM guest_cart_items gci
                    JOIN guest_carts gc_items ON gc_items.id = gci.guest_cart_id
                    WHERE gc_items.converted_at IS NULL AND gc_items.expires_at > UTC_TIMESTAMP()
                ), 0) AS active_items
             FROM guest_carts gc`,
        );
    }

    async getSummaryRows(rangeDays: number): Promise<AnalyticsSummaryRows> {
        const [
            overviewRows,
            revenueTrendRows,
            categoryPerformanceRows,
            customerSegmentRows,
            inventoryRiskRows,
            paymentMethodRows,
            promotionCatalogRows,
            discountOrderRows,
            promotionPerformanceRows,
            guestCartAnalyticsRows,
        ] = await Promise.all([
            this.getOverviewRows(rangeDays),
            this.getRevenueTrendRows(rangeDays),
            this.getCategoryPerformanceRows(rangeDays),
            this.getCustomerSegmentRows(),
            this.getInventoryRiskRows(),
            this.getPaymentMethodRows(rangeDays),
            this.getPromotionCatalogRows(),
            this.getDiscountOrderRows(rangeDays),
            this.getPromotionPerformanceRows(rangeDays),
            this.getGuestCartAnalyticsRows(),
        ]);

        return {
            overviewRows,
            revenueTrendRows,
            categoryPerformanceRows,
            customerSegmentRows,
            inventoryRiskRows,
            paymentMethodRows,
            promotionCatalogRows,
            discountOrderRows,
            promotionPerformanceRows,
            guestCartAnalyticsRows,
        };
    }
}
