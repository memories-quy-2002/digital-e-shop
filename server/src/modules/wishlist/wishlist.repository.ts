import pool from "#/config/database.config";
import type { QueryCallback, UpdateResult } from "#/shared/interfaces/domain";
import type { WishlistRow } from "./wishlist.types";

const addItemToWishlist = (uid: string, pid: number, callback: QueryCallback<UpdateResult>) => {
    pool.query(
        `INSERT INTO wishlist (user_id, product_id)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE product_id = product_id;`,
        [uid, pid],
        callback
    );
}

const getWishlist = (uid: string, callback: QueryCallback<WishlistRow[]>) => {
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
            COALESCE(review_summary.rating, 0) AS rating,
            COALESCE(review_summary.reviews, 0) AS reviews
        FROM
            products
        JOIN wishlist ON wishlist.product_id = products.id
        JOIN categories ON categories.id = products.category_id
        JOIN brands ON brands.id = products.brand_id 
        LEFT JOIN (
            SELECT product_id, COUNT(*) AS reviews, ROUND(COALESCE(AVG(rating), 0), 1) AS rating
            FROM reviews
            GROUP BY product_id
        ) review_summary ON review_summary.product_id = products.id
        WHERE user_id = ? AND products.stock >= 0`,
        [uid],
        callback
    );
}

const deleteWishlistItem = (uid: string, pid: number, callback: QueryCallback<UpdateResult>) => {
    pool.query(
        `DELETE FROM wishlist WHERE user_id = ? AND product_id = ?`,
        [uid, pid],
        callback
    );
}

const deleteWishlistItems = (uid: string, productIds: number[], callback: QueryCallback<UpdateResult>) => {
    pool.query(
        `DELETE FROM wishlist WHERE user_id = ? AND product_id IN (?)`,
        [uid, productIds],
        callback
    );
}

module.exports = {
    addItemToWishlist,
    getWishlist,
    deleteWishlistItem,
    deleteWishlistItems
};
