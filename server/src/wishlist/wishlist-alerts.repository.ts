import { Injectable } from "@nestjs/common";
import pool from "#src/config/database.config";
import type { DbError, UpdateResult } from "#src/shared/interfaces/domain";
import type { TransactionContext } from "../database/transaction";
import type {
    WishlistAlertPreferenceRow,
    WishlistAlertNotificationMetadata,
    WishlistAlertPreferenceState,
    WishlistAlertPreferenceUpdate,
} from "./wishlist-alerts.types";

type WishlistAlertPreferenceResult = WishlistAlertPreferenceUpdate & { productId: number };

const toBoolean = (value: boolean | number) => Boolean(Number(value));

const normalizePreference = (row: WishlistAlertPreferenceRow): WishlistAlertPreferenceRow => ({
    ...row,
    id: Number(row.id),
    product_id: Number(row.product_id),
    price_drop_enabled: toBoolean(row.price_drop_enabled),
    back_in_stock_enabled: toBoolean(row.back_in_stock_enabled),
    price_baseline: Number(row.price_baseline) || 0,
    stock_available: toBoolean(row.stock_available),
});

@Injectable()
export class WishlistAlertsRepository {
    createPreference(uid: string, pid: number): Promise<UpdateResult> {
        return new Promise((resolve, reject) => {
            pool.query(
                `INSERT INTO wishlist_alert_preferences
                    (user_id, product_id, price_baseline, stock_available)
                 SELECT wishlist.user_id, products.id,
                        CASE WHEN products.sale_price IS NOT NULL
                                  AND products.sale_price > 0
                                  AND products.sale_price < products.price
                             THEN products.sale_price ELSE products.price END,
                        products.stock > 0
                 FROM wishlist
                 JOIN products ON products.id = wishlist.product_id
                 WHERE wishlist.user_id = ? AND products.id = ?
                 ON DUPLICATE KEY UPDATE product_id = product_id`,
                [uid, pid],
                (error: DbError | null, result: UpdateResult) => error ? reject(error) : resolve(result),
            );
        });
    }

    deletePreferences(uid: string, productIds: number[]): Promise<UpdateResult> {
        return new Promise((resolve, reject) => {
            pool.query(
                "DELETE FROM wishlist_alert_preferences WHERE user_id = ? AND product_id IN (?)",
                [uid, productIds],
                (error: DbError | null, result: UpdateResult) => error ? reject(error) : resolve(result),
            );
        });
    }

    updatePreference(
        uid: string,
        pid: number,
        update: WishlistAlertPreferenceUpdate,
    ): Promise<WishlistAlertPreferenceResult | null> {
        return new Promise((resolve, reject) => {
            pool.query(
                `UPDATE wishlist_alert_preferences alerts
                 JOIN wishlist ON wishlist.user_id = alerts.user_id AND wishlist.product_id = alerts.product_id
                 JOIN products ON products.id = alerts.product_id
                 SET alerts.price_drop_enabled = ?,
                     alerts.back_in_stock_enabled = ?,
                     alerts.price_baseline = CASE WHEN products.sale_price IS NOT NULL
                                                       AND products.sale_price > 0
                                                       AND products.sale_price < products.price
                                                  THEN products.sale_price ELSE products.price END,
                     alerts.stock_available = products.stock > 0
                 WHERE alerts.user_id = ? AND alerts.product_id = ? AND wishlist.user_id = ?`,
                [update.priceDropEnabled ? 1 : 0, update.backInStockEnabled ? 1 : 0, uid, pid, uid],
                (error: DbError | null, result: UpdateResult) => {
                    if (error) return reject(error);
                    pool.query(
                        `SELECT product_id, price_drop_enabled, back_in_stock_enabled
                         FROM wishlist_alert_preferences
                         WHERE user_id = ? AND product_id = ? LIMIT 1`,
                        [uid, pid],
                        (selectError: DbError | null, rows: Array<{
                            product_id: number;
                            price_drop_enabled: boolean | number;
                            back_in_stock_enabled: boolean | number;
                        }>) => {
                            if (selectError) return reject(selectError);
                            const row = rows?.[0];
                            if (!row) return resolve(null);
                            resolve({
                                productId: Number(row.product_id),
                                priceDropEnabled: toBoolean(row.price_drop_enabled),
                                backInStockEnabled: toBoolean(row.back_in_stock_enabled),
                            });
                        },
                    );
                },
            );
        });
    }

    findPreferencesForProductForUpdate(
        tx: TransactionContext,
        productId: number,
    ): Promise<WishlistAlertPreferenceRow[]> {
        return tx.query<WishlistAlertPreferenceRow[]>(
            `SELECT id, user_id, product_id, price_drop_enabled, back_in_stock_enabled,
                    price_baseline, stock_available
             FROM wishlist_alert_preferences
             WHERE product_id = ? AND (price_drop_enabled = 1 OR back_in_stock_enabled = 1)
             ORDER BY id
             FOR UPDATE`,
            [productId],
        ).then((rows) => (rows || []).map(normalizePreference));
    }

    updatePreferenceStateInTransaction(
        tx: TransactionContext,
        preferenceId: number,
        state: WishlistAlertPreferenceState,
    ): Promise<UpdateResult> {
        return tx.query<UpdateResult>(
            `UPDATE wishlist_alert_preferences
             SET price_baseline = ?, stock_available = ?
             WHERE id = ?`,
            [state.priceBaseline, state.stockAvailable ? 1 : 0, preferenceId],
        );
    }

    insertNotificationInTransaction(
        tx: TransactionContext,
        notification: {
            userId: string;
            type: "wishlist_price_drop" | "wishlist_back_in_stock";
            title: string;
            message: string;
            link: string;
            metadata: WishlistAlertNotificationMetadata;
        },
    ): Promise<UpdateResult> {
        return tx.query<UpdateResult>(
            `INSERT INTO customer_notifications (user_id, type, title, message, link, metadata)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                notification.userId,
                notification.type,
                notification.title,
                notification.message,
                notification.link,
                JSON.stringify(notification.metadata),
            ],
        );
    }
}
