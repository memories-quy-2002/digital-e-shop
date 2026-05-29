const pool = require("../config/db");
import type { CartItemRow, CartRow, QueryCallback, UpdateResult } from "../types/domain";

const addItemToCartByUserId = (uid: string, pid: number, quantity: number, callback: QueryCallback<UpdateResult>) => {
    pool.query(
        `INSERT INTO carts (user_id)
        SELECT ? 
        WHERE NOT EXISTS ( 
            SELECT 1 FROM carts WHERE user_id = ? AND done = 0);`,
        [uid, uid],
        callback
    );
}

const getCartIdByUserId = (uid: string, callback: QueryCallback<CartRow[]>) => {
    pool.query(
        "SELECT id FROM carts WHERE user_id = ? AND done = 0 LIMIT 1",
        [uid],
        callback
    );
}

const addItemToCart = (cartId: number, pid: number, quantity: number, callback: QueryCallback<UpdateResult>) => {
    pool.query(
        `INSERT INTO cart_items (cart_id, product_id, quantity)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity);`,
        [cartId, pid, quantity],
        callback
    );
}

const getCartItemsByUserId = (uid: string, callback: QueryCallback<CartRow[]>) => {
    pool.query(
        `SELECT id FROM carts WHERE user_id = ? AND done = 0 LIMIT 1`,
        [uid],
        callback
    );
}

const getCartItemsDetails = (cartId: number, callback: QueryCallback<CartItemRow[]>) => {
    pool.query(
        `SELECT
            ci.id AS cart_item_id,
            p.id AS product_id,
            p.name AS product_name,
            b.name AS brand,
            c.name AS category,
            p.price,
            p.sale_price,
            p.stock,
            p.main_image,
            ci.quantity
        FROM
            cart_items ci
        JOIN products p ON
            ci.product_id = p.id
        JOIN brands b ON
            p.brand_id = b.id
        JOIN categories c ON
            p.category_id = c.id
        WHERE ci.cart_id = ? AND p.stock >= 0;  `,
        [cartId],
        callback
    );
}

const getCheckoutCartItemsDetails = (cartId: number, callback: QueryCallback<CartItemRow[]>) => {
    pool.query(
        `SELECT
            ci.id AS cart_item_id,
            ci.product_id,
            p.name AS product_name,
            b.name AS brand,
            c.name AS category,
            p.price,
            p.sale_price,
            p.stock,
            p.main_image,
            ci.quantity
        FROM cart_items ci
        LEFT JOIN products p ON p.id = ci.product_id
        LEFT JOIN brands b ON b.id = p.brand_id
        LEFT JOIN categories c ON c.id = p.category_id
        WHERE ci.cart_id = ?`,
        [cartId],
        callback
    );
}

const updateCartItemQuantity = (cartItemId: number, quantity: number, callback: QueryCallback<UpdateResult>) => {
    pool.query(
        `UPDATE cart_items SET quantity = ? WHERE id = ?`,
        [quantity, cartItemId],
        callback
    );
}

const getCartItemStock = (cartItemId: number, callback: QueryCallback<CartItemRow[]>) => {
    pool.query(
        `SELECT p.stock
        FROM cart_items ci
        JOIN products p ON p.id = ci.product_id
        WHERE ci.id = ?`,
        [cartItemId],
        callback
    );
}

const deleteCartItem = (cartItemId: number, callback: QueryCallback<UpdateResult>) => {
    pool.query(
        `DELETE FROM cart_items WHERE id = ?`,
        [cartItemId],
        callback
    );
}

module.exports = {
    addItemToCartByUserId,
    getCartIdByUserId,
    addItemToCart,
    getCartItemsByUserId,
    getCartItemsDetails,
    getCheckoutCartItemsDetails,
    updateCartItemQuantity,
    getCartItemStock,
    deleteCartItem
}
