import { Injectable } from "@nestjs/common";
import pool from "#src/config/database.config";
import type { DbError, UpdateResult } from "#src/shared/interfaces/domain";
import type { WishlistRow } from "./wishlist.types";

@Injectable()
export class WishlistRepository {
    addItemToWishlist(uid: string, pid: number): Promise<UpdateResult> {
        return new Promise((resolve, reject) => {
            pool.query(
                `INSERT INTO wishlist (user_id, product_id)
                VALUES (?, ?)
                ON DUPLICATE KEY UPDATE product_id = product_id;`,
                [uid, pid],
                (err: DbError | null, result: UpdateResult) => {
                    if (err) return reject(err);
                    resolve(result);
                },
            );
        });
    }

    getWishlist(uid: string): Promise<WishlistRow[]> {
        return new Promise((resolve, reject) => {
            pool.query(
                `SELECT
                    wishlist.id,
                    products.id AS product_id,
                    products.name,
                    description,
                    categories.name AS category,
                    brands.name AS brand,
                    price,
                    sale_price,
                    stock,
                    main_image,
                    specifications,
                    COALESCE(wishlist_alert_preferences.price_drop_enabled, 0) AS price_drop_alert_enabled,
                    COALESCE(wishlist_alert_preferences.back_in_stock_enabled, 0) AS back_in_stock_alert_enabled,
                    COALESCE(review_summary.rating, 0) AS rating,
                    COALESCE(review_summary.reviews, 0) AS reviews
                FROM
                    products
                JOIN wishlist ON wishlist.product_id = products.id
                JOIN categories ON categories.id = products.category_id
                JOIN brands ON brands.id = products.brand_id
                LEFT JOIN wishlist_alert_preferences
                    ON wishlist_alert_preferences.user_id = wishlist.user_id
                    AND wishlist_alert_preferences.product_id = wishlist.product_id
                LEFT JOIN (
                    SELECT product_id, COUNT(*) AS reviews, ROUND(COALESCE(AVG(rating), 0), 1) AS rating
                    FROM reviews
                    GROUP BY product_id
                ) review_summary ON review_summary.product_id = products.id
                WHERE wishlist.user_id = ? AND products.stock >= 0`,
                [uid],
                (err: DbError | null, results: WishlistRow[]) => {
                    if (err) return reject(err);
                    resolve(results);
                },
            );
        });
    }

    deleteWishlistItem(uid: string, pid: number): Promise<UpdateResult> {
        return new Promise((resolve, reject) => {
            pool.query(
                `DELETE FROM wishlist WHERE user_id = ? AND product_id = ?`,
                [uid, pid],
                (err: DbError | null, result: UpdateResult) => {
                    if (err) return reject(err);
                    resolve(result);
                },
            );
        });
    }

    deleteWishlistItems(uid: string, productIds: number[]): Promise<UpdateResult> {
        return new Promise((resolve, reject) => {
            pool.query(
                `DELETE FROM wishlist WHERE user_id = ? AND product_id IN (?)`,
                [uid, productIds],
                (err: DbError | null, result: UpdateResult) => {
                    if (err) return reject(err);
                    resolve(result);
                },
            );
        });
    }
}
