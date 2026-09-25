import { Injectable, NotFoundException } from "@nestjs/common";
import pool from "#src/config/database.config";
import { withTransaction } from "#src/database/transaction";
import type { InsertResult, QueryCallback, QueryParams } from "#src/shared/interfaces/domain";
import type { TransactionContext } from "#src/database/transaction";
import type { ProductAlertTransition, ProductAlertPreference } from "./product-alerts.types";
import type { ProductAlertUpdateInput } from "./product-alerts.dto";

type ProductAlertPreferenceRow = {
    product_id: number;
    price_drop_enabled: number | boolean;
    back_in_stock_enabled: number | boolean;
};

const toPreference = (row: ProductAlertPreferenceRow): ProductAlertPreference => ({
    productId: Number(row.product_id),
    priceDropEnabled: Boolean(Number(row.price_drop_enabled)),
    backInStockEnabled: Boolean(Number(row.back_in_stock_enabled)),
});

@Injectable()
export class ProductAlertsRepository {
    private query(sql: string, params?: QueryParams, callback?: QueryCallback) {
        return pool.query(sql, params, callback);
    }

    listByUser(uid: string): Promise<ProductAlertPreference[]> {
        return new Promise((resolve, reject) => {
            this.query(
                `SELECT product_id, price_drop_enabled, back_in_stock_enabled
                FROM product_alert_subscriptions
                JOIN products ON products.id = product_alert_subscriptions.product_id
                WHERE product_alert_subscriptions.user_id = ?
                    AND products.stock >= 0
                ORDER BY product_id ASC`,
                [uid],
                (error, rows: ProductAlertPreferenceRow[] = []) => {
                    if (error) return reject(error);
                    resolve(rows.map(toPreference));
                },
            );
        });
    }

    findByUserAndProduct(uid: string, productId: number): Promise<ProductAlertPreference | null> {
        return new Promise((resolve, reject) => {
            this.query(
                `SELECT product_id, price_drop_enabled, back_in_stock_enabled
                FROM product_alert_subscriptions
                JOIN products ON products.id = product_alert_subscriptions.product_id
                WHERE product_alert_subscriptions.user_id = ?
                    AND product_alert_subscriptions.product_id = ?
                    AND products.stock >= 0
                LIMIT 1`,
                [uid, productId],
                (error, rows: ProductAlertPreferenceRow[] = []) => {
                    if (error) return reject(error);
                    resolve(rows[0] ? toPreference(rows[0]) : null);
                },
            );
        });
    }

    savePreference(
        uid: string,
        productId: number,
        input: ProductAlertUpdateInput,
    ): Promise<ProductAlertPreference> {
        const preference: ProductAlertPreference = {
            productId,
            priceDropEnabled: input.priceDropEnabled,
            backInStockEnabled: input.backInStockEnabled,
        };

        if (!input.priceDropEnabled && !input.backInStockEnabled) {
            return new Promise<ProductAlertPreference>((resolve, reject) => {
                this.query(
                    "DELETE FROM product_alert_subscriptions WHERE user_id = ? AND product_id = ?",
                    [uid, productId],
                    (error) => error ? reject(error) : resolve(preference),
                );
            });
        }

        return withTransaction(async (tx) => {
            const products = await tx.query<Array<{ id: number }>>(
                "SELECT id FROM products WHERE id = ? AND stock >= 0 FOR UPDATE",
                [productId],
            );
            if (!products.length) {
                throw new NotFoundException({ msg: "Product not found" });
            }

            await tx.query(
                `INSERT INTO product_alert_subscriptions
                    (user_id, product_id, price_drop_enabled, back_in_stock_enabled)
                VALUES (?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    price_drop_enabled = VALUES(price_drop_enabled),
                    back_in_stock_enabled = VALUES(back_in_stock_enabled),
                    updated_at = UTC_TIMESTAMP()`,
                [uid, productId, input.priceDropEnabled, input.backInStockEnabled],
            );
            return preference;
        });
    }

    async recordTransitionsInTransaction(
        tx: TransactionContext,
        transitions: ProductAlertTransition[],
    ): Promise<void> {
        for (const transition of transitions) {
            const eventResult = await tx.query<InsertResult>(
                `INSERT INTO product_alert_events
                    (product_id, alert_type, previous_price, current_price, previous_stock, current_stock)
                VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    transition.productId,
                    transition.type,
                    transition.previousPrice,
                    transition.currentPrice,
                    transition.previousStock,
                    transition.currentStock,
                ],
            );

            const enabledColumn = transition.type === "price_drop"
                ? "price_drop_enabled"
                : "back_in_stock_enabled";
            const title = transition.type === "price_drop"
                ? "Price drop alert"
                : "Back in stock alert";
            const message = transition.type === "price_drop"
                ? "The price of a product you follow has dropped."
                : "A product you follow is back in stock.";

            await tx.query(
                `INSERT INTO customer_notifications
                    (user_id, type, title, message, link, metadata, alert_event_id)
                SELECT
                    subscriptions.user_id,
                    ?,
                    ?,
                    ?,
                    CONCAT('/product?id=', products.id),
                    JSON_OBJECT(
                        'productId', products.id,
                        'productName', products.name,
                        'previousPrice', events.previous_price,
                        'currentPrice', events.current_price,
                        'previousStock', events.previous_stock,
                        'currentStock', events.current_stock
                    ),
                    events.id
                FROM product_alert_subscriptions subscriptions
                JOIN products ON products.id = subscriptions.product_id
                JOIN product_alert_events events ON events.id = ?
                WHERE subscriptions.product_id = ?
                    AND subscriptions.${enabledColumn} = 1
                ON DUPLICATE KEY UPDATE id = id`,
                [transition.type, title, message, eventResult.insertId, transition.productId],
            );
        }
    }
}
