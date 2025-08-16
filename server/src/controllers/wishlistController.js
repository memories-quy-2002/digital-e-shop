const pool = require('../config/db');

const addItemToWishlist = (request, response) => {
    const { uid, pid } = request.body;
    pool.query(
        `INSERT INTO wishlist (user_id, product_id)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE product_id = product_id;
        `,
        [uid, pid],
        (err, res) => {
            if (err) {
                console.error(err.message);
            }
            response.status(200).json({
                msg: `Product with id = ${pid} has been added successfully to the user id = ${uid}`,
            });
        }
    );
};

const getWishlist = (request, response) => {
    const uid = request.params.uid;
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
        (error, results) => {
            if (error) {
                console.error(error.message);
            }
            response.status(200).json({
                wishlist: results,
                msg: `Get wishlist with user_id = ${uid} successfully`,
            });
        }
    );
};

const deleteWishlistItem = (request, response) => {
    const { uid, pid } = request.body
    pool.query(`DELETE FROM wishlist WHERE user_id = ? AND product_id = ?`, [uid, pid], (error, results) => {
        if (error) {
            console.error(error.message);
        }
        response.status(200).json({
            msg: `Delete a wishlist item of user_id = ${uid} successfully`,
        });
    })
}

module.exports = {
    addItemToWishlist,
    getWishlist,
    deleteWishlistItem,
};