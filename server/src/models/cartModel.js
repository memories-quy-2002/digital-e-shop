const pool = require("../config/db");

const addItemToCartByUserId = (uid, pid, quantity, callback) => {
    pool.query(
        `INSERT INTO cart (user_id)
        SELECT ? 
        WHERE NOT EXISTS ( 
            SELECT 1 FROM cart WHERE user_id = ? AND done = 0);`,
        [uid, uid],
        callback
    );
}

const getCartIdByUserId = (uid, callback) => {
    pool.query(
        "SELECT id FROM cart WHERE user_id = ? AND done = 0",
        [uid],
        callback
    );
}

const addItemToCart = (cartId, pid, quantity, callback) => {
    pool.query(
        `INSERT INTO cart_items (cart_id, product_id, quantity)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity);`,
        [cartId, pid, quantity],
        callback
    );
}

const getCartItemsByUserId = (uid, callback) => {
    pool.query(
        `SELECT id FROM cart WHERE user_id = ? AND done = 0`,
        [uid],
        callback
    );
}

const getCartItemsDetails = (cartId, callback) => {
    pool.query(
        `SELECT
            ci.id AS cart_item_id,
            p.id AS product_id,
            p.name AS product_name,
            b.name AS brand,
            c.name AS category,
            p.price,
            p.sale_price,
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
        WHERE ci.cart_id = ?;  `,
        [cartId],
        callback
    );
}

const deleteCartItem = (cartItemId, callback) => {
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
    deleteCartItem
}