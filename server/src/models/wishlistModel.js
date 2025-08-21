const pool = require("../config/db");

const addItemToWishlist = (uid, pid, callback) => {
    pool.query(
        `INSERT INTO wishlist (user_id, product_id)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE product_id = product_id;`,
        [uid, pid],
        callback
    );
}

const getWishlist = (uid, callback) => {
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
            image_gallery,
            specifications,
            rating,
            reviews
        FROM
            products
        JOIN wishlist ON wishlist.product_id = products.id
        JOIN categories ON categories.id = products.category_id
        JOIN brands ON brands.id = products.brand_id 
        WHERE user_id = ?`,
        [uid],
        callback
    );
}

const deleteWishlistItem = (uid, pid, callback) => {
    pool.query(
        `DELETE FROM wishlist WHERE user_id = ? AND product_id = ?`,
        [uid, pid],
        callback
    );
}

module.exports = {
    addItemToWishlist,
    getWishlist,
    deleteWishlistItem
};