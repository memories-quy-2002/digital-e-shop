import { Injectable } from "@nestjs/common";
import pool from "#src/config/database.config";
import type {
    CountRow,
    InsertResult,
    QueryCallback,
    QueryParams,
    UpdateResult,
} from "#src/shared/interfaces/domain";
import type { GuestOrderIdentityRow, OrderBySessionRow, OrderDetailRow, OrderSummaryRow, PendingCheckoutRow } from "./orders.types";
import type { LockedProductRow } from "./orders.types";
import type { PromotionRow } from "../promotions/promotions.types";
import { PromotionsRepository } from "../promotions/promotions.repository";
import type { TransactionContext } from "../database/transaction";
import { ORDER_STATUS } from "#src/shared/constants/order-status";
import { PAYMENT_PROVIDER } from "../payments/payment.types";

const QUERY_TIMEOUT = 8000;

@Injectable()
export class OrdersRepository {
    constructor(private readonly promotionsRepository: PromotionsRepository) {}

    insertOrderInTransaction(
        tx: TransactionContext,
        order: {
            userId: string | null;
            guestEmail: string | null;
            guestName: string | null;
            guestPhone: string | null;
            guestOrderTokenHash: string | null;
            totalPrice: number;
            discount: number;
            shippingAddress: string;
            paymentMethod: string;
            currency: string;
        },
    ): Promise<InsertResult> {
        return tx.query<InsertResult>(
            `INSERT INTO orders
                (user_id, guest_email, guest_name, guest_phone, guest_order_token_hash,
                 total_price, discount, shipping_address, payment_method, currency, date_added)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())`,
            [
                order.userId,
                order.guestEmail,
                order.guestName,
                order.guestPhone,
                order.guestOrderTokenHash,
                order.totalPrice,
                order.discount,
                order.shippingAddress,
                order.paymentMethod,
                order.currency,
            ],
        );
    }

    updateOrderDiscountInTransaction(tx: TransactionContext, orderId: number, discount: number): Promise<unknown> {
        return tx.query("UPDATE orders SET discount = ? WHERE id = ?", [discount, orderId]);
    }

    insertOrderItemsInTransaction(tx: TransactionContext, values: unknown[][]): Promise<unknown> {
        return tx.query(
            `INSERT INTO order_items
                (order_id, product_id, quantity, total_price, sku_snapshot, product_name_snapshot,
                 image_snapshot, unit_price_snapshot, brand_snapshot, category_snapshot,
                 warranty_months_snapshot, specifications_snapshot)
             VALUES ?`,
            [values],
        );
    }

    lockProductsForOrderInTransaction(tx: TransactionContext, productIds: number[]): Promise<LockedProductRow[]> {
        if (productIds.length === 0) return Promise.resolve([]);
        return tx.query<LockedProductRow[]>(
            `SELECT id, name, stock FROM products WHERE id IN (${productIds.map(() => "?").join(", ")}) AND stock >= 0 FOR UPDATE`,
            productIds,
        );
    }

    decrementProductStockInTransaction(
        tx: TransactionContext,
        productId: number,
        quantity: number,
    ): Promise<UpdateResult> {
        return tx.query<UpdateResult>(
            "UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?",
            [quantity, productId, quantity],
        );
    }

    markOpenCartCompleteInTransaction(tx: TransactionContext, uid: string): Promise<unknown> {
        return tx.query("UPDATE carts SET done = 1 WHERE user_id = ? AND done = 0", [uid]);
    }

    getOrderDateAddedInTransaction(
        tx: TransactionContext,
        orderId: number,
    ): Promise<Array<{ id: number; date_added: string }>> {
        return tx.query<Array<{ id: number; date_added: string }>>(
            `SELECT id, DATE_FORMAT(date_added, '%Y-%m-%dT%H:%i:%s.000Z') AS date_added
             FROM orders
             WHERE id = ?`,
            [orderId],
        );
    }

    private query(sql: string, params?: QueryParams, callback?: QueryCallback) {
        if (typeof params === "function") {
            return pool.query({ sql, timeout: QUERY_TIMEOUT }, params);
        }
        return pool.query({ sql, timeout: QUERY_TIMEOUT }, params, callback);
    }

    startTransaction(callback: QueryCallback) {
        this.query("START TRANSACTION", callback);
    }

    commit(callback: QueryCallback) {
        this.query("COMMIT", callback);
    }

    rollback(callback: QueryCallback) {
        this.query("ROLLBACK", callback);
    }

    updateCartDone(uid: string, callback: QueryCallback<UpdateResult>) {
        this.query("UPDATE carts SET done = 1 WHERE user_id = ?", [uid], callback);
    }

    insertOrder(
        uid: string,
        totalPrice: number,
        discount: number,
        shippingAddress: string,
        paymentMethod: string,
        callback: QueryCallback<InsertResult>,
    ) {
        this.query(
            "INSERT INTO orders (user_id, total_price, discount, shipping_address, payment_method, date_added) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP())",
            [uid, totalPrice, discount, shippingAddress, paymentMethod],
            callback,
        );
    }

    insertOrderItem(orderId: number, productId: number, quantity: number, totalPrice: number, callback: QueryCallback<InsertResult>) {
        this.query(
            "INSERT INTO order_items (order_id, product_id, quantity, total_price) VALUES (?, ?, ?, ?)",
            [orderId, productId, quantity, totalPrice],
            callback,
        );
    }

    updateProductStock(productId: number, quantity: number, callback: QueryCallback<UpdateResult>) {
        this.query("UPDATE products SET stock = stock - ? WHERE id = ?", [quantity, productId], callback);
    }

    private readonly orderSelect = `
        o.id,
        o.user_id,
        o.guest_email,
        o.guest_name,
        o.guest_phone,
        COALESCE(o.guest_name, u.username, o.user_id) AS customer_name,
        COALESCE(o.guest_email, u.email) AS customer_email,
        DATE_FORMAT(o.date_added, '%Y-%m-%dT%H:%i:%s.000Z') AS date_added,
        DATE_FORMAT(o.delivered_at, '%Y-%m-%dT%H:%i:%s.000Z') AS delivered_at,
        o.total_price,
        o.discount,
        o.status,
        o.shipping_address,
        o.payment_method,
        o.currency,
        p.status AS payment_status,
        p.amount AS payment_amount,
        p.currency AS payment_currency,
        p.simulated AS payment_simulated
    `;

    private readonly orderUserJoin = `
        FROM orders o
        LEFT JOIN users u ON u.id = o.user_id
        LEFT JOIN order_payments p ON p.id = (
            SELECT p2.id FROM order_payments p2 WHERE p2.order_id = o.id ORDER BY p2.id DESC LIMIT 1
        )
    `;

    getOrders(callback: QueryCallback<OrderSummaryRow[]>) {
        this.query(`SELECT ${this.orderSelect} ${this.orderUserJoin} ORDER BY o.date_added DESC`, callback);
    }

    getOrdersPaginated(limit: number, offset: number, callback: QueryCallback<OrderSummaryRow[]>) {
        this.query(`SELECT ${this.orderSelect} ${this.orderUserJoin} ORDER BY o.date_added DESC LIMIT ? OFFSET ?`, [limit, offset], callback);
    }

    getOrdersCount(callback: QueryCallback<CountRow[]>) {
        this.query(`SELECT COUNT(*) AS total FROM orders`, callback);
    }

    updateOrderStatus(orderId: number, status: number, callback: QueryCallback<UpdateResult>) {
        this.query(`UPDATE orders SET status = ? WHERE id = ?`, [status, orderId], callback);
    }

    getOrderById(orderId: number, callback: QueryCallback<OrderSummaryRow[]>) {
        this.query(`SELECT ${this.orderSelect} ${this.orderUserJoin} WHERE o.id = ?`, [orderId], callback);
    }

    getOrdersByUserId(uid: string, callback: QueryCallback<OrderSummaryRow[]>) {
        this.query(`SELECT ${this.orderSelect} ${this.orderUserJoin} WHERE o.user_id = ? ORDER BY o.date_added DESC`, [uid], callback);
    }

    getOrderDetail(orderId: number, callback: QueryCallback<OrderDetailRow[]>) {
        this.query(
            `SELECT
                o.*,
                op.status AS payment_status,
                op.amount AS payment_amount,
                op.currency AS payment_currency,
                op.simulated AS payment_simulated,
                COALESCE(o.guest_name, u.username, o.user_id) AS customer_name,
                COALESCE(o.guest_email, u.email) AS customer_email,
                DATE_FORMAT(o.date_added, '%Y-%m-%dT%H:%i:%s.000Z') AS date_added,
                DATE_FORMAT(o.delivered_at, '%Y-%m-%dT%H:%i:%s.000Z') AS delivered_at,
                oi.id AS order_item_id,
                oi.product_id,
                oi.quantity,
                oi.total_price AS item_total_price,
                COALESCE(oi.sku_snapshot, p.sku) AS sku,
                COALESCE(oi.product_name_snapshot, p.name) AS product_name,
                COALESCE(oi.unit_price_snapshot, p.sale_price, p.price) AS price,
                CASE WHEN oi.unit_price_snapshot IS NOT NULL THEN NULL ELSE p.sale_price END AS sale_price,
                p.stock,
                COALESCE(oi.image_snapshot, p.main_image) AS main_image,
                COALESCE(oi.category_snapshot, c.name) AS category,
                COALESCE(oi.brand_snapshot, b.name) AS brand,
                COALESCE(oi.warranty_months_snapshot, p.warranty_months) AS warranty_months,
                COALESCE(oi.specifications_snapshot, p.specifications) AS specifications
            FROM orders o
            LEFT JOIN users u ON u.id = o.user_id
            LEFT JOIN order_payments op ON op.id = (
                SELECT op2.id FROM order_payments op2 WHERE op2.order_id = o.id ORDER BY op2.id DESC LIMIT 1
            )
            LEFT JOIN order_items oi ON oi.order_id = o.id
            LEFT JOIN products p ON p.id = oi.product_id
            LEFT JOIN categories c ON c.id = p.category_id
            LEFT JOIN brands b ON b.id = p.brand_id
            WHERE o.id = ?`,
            [orderId],
            callback,
        );
    }

    getGuestOrderIdentity(orderId: number, callback: QueryCallback<GuestOrderIdentityRow[]>) {
        this.query(
            `SELECT id, user_id, guest_email, guest_name, guest_phone, guest_order_token_hash
             FROM orders
             WHERE id = ? AND user_id IS NULL
             LIMIT 1`,
            [orderId],
            callback,
        );
    }

    getOrderItems(callback: QueryCallback) {
        this.query(
            `SELECT
                p.id,
                p.name,
                p.price,
                oi.order_id,
                SUM(oi.quantity) AS sales,
                SUM(oi.total_price) AS revenue
            FROM
                products p
            JOIN
                order_items oi ON p.id = oi.product_id
            JOIN
                orders o ON oi.order_id = o.id
            WHERE o.status <> ${ORDER_STATUS.CANCELED}
            GROUP BY
                p.id, p.name, p.price, oi.order_id
            ORDER BY
                revenue DESC;
            `,
            callback,
        );
    }

    getOrderItemsPaginated(limit: number, offset: number, callback: QueryCallback) {
        this.query(
            `SELECT
                p.id,
                p.name,
                p.price,
                oi.order_id,
                SUM(oi.quantity) AS sales,
                SUM(oi.total_price) AS revenue
            FROM
                products p
            JOIN
                order_items oi ON p.id = oi.product_id
            JOIN
                orders o ON oi.order_id = o.id
            WHERE o.status <> ${ORDER_STATUS.CANCELED}
            GROUP BY
                p.id, p.name, p.price, oi.order_id
            ORDER BY
                revenue DESC
            LIMIT ? OFFSET ?;
            `,
            [limit, offset],
            callback,
        );
    }

    getOrderItemsCount(callback: QueryCallback<CountRow[]>) {
        this.query(
            `SELECT COUNT(*) AS total FROM (
                SELECT p.id
                FROM products p
                JOIN order_items oi ON p.id = oi.product_id
                JOIN orders o ON oi.order_id = o.id
                WHERE o.status <> ${ORDER_STATUS.CANCELED}
                GROUP BY p.id, p.name, p.price, oi.order_id
            ) AS grouped_items`,
            callback,
        );
    }

    applyDiscount(discountCode: string, callback: QueryCallback<PromotionRow[]>) {
        this.promotionsRepository.getActivePromotionByCode(discountCode, callback);
    }

    getPendingCheckoutByPayOSOrderCode(providerOrderCode: number, callback: QueryCallback<PendingCheckoutRow[]>) {
        this.query(
            `SELECT id, payment_provider, provider_reference, provider_order_code,
                    payment_amount, payment_currency, payment_fx_rate,
                    reservation_token, user_id, guest_email, guest_name, guest_phone,
                    guest_order_token_hash, cart_json, total_price, discount,
                    shipping_address, status, expires_at, discount_id, created_at, consumed_at
            FROM pending_checkouts
            WHERE payment_provider = '${PAYMENT_PROVIDER.PAYOS}' AND provider_order_code = ?
            LIMIT 1`,
            [providerOrderCode],
            callback,
        );
    }

    getGuestOrderIdentityByPayOSOrderCode(providerOrderCode: number, callback: QueryCallback<GuestOrderIdentityRow[]>) {
        this.query(
            `SELECT o.id, o.user_id, o.guest_email, o.guest_name, o.guest_phone, o.guest_order_token_hash
             FROM orders o
             JOIN order_payments op ON op.order_id = o.id
             WHERE op.provider = '${PAYMENT_PROVIDER.PAYOS}' AND op.provider_reference = ? AND o.user_id IS NULL
             LIMIT 1`,
            [String(providerOrderCode)],
            callback,
        );
    }

    getOrderByPayOSOrderCode(providerOrderCode: number, callback: QueryCallback<OrderBySessionRow[]>) {
        this.query(
            `SELECT o.id, o.user_id, DATE_FORMAT(o.date_added, '%Y-%m-%dT%H:%i:%s.000Z') AS date_added, o.payment_method
            FROM orders o
            JOIN order_payments op ON op.order_id = o.id
            WHERE op.provider = '${PAYMENT_PROVIDER.PAYOS}' AND op.provider_reference = ?
            LIMIT 1`,
            [String(providerOrderCode)],
            callback,
        );
    }
}
