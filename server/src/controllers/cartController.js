const pool = require("../config/db");
const jwt = require("jsonwebtoken");

const addItemToCart = (req, res) => {
    const { pid, uid, quantity } = req.body;
    // console.log(pid, quantity);

    var cartId = 0;
    pool.query(
        `INSERT INTO cart (user_id)
		SELECT ? 
		WHERE NOT EXISTS ( 
			SELECT 1 FROM cart WHERE user_id = ? AND done = 0);`,
        [uid, uid],
        (err, results) => {
            if (err) {
                console.error(err.message);
            }
            pool.query(
                "SELECT id FROM cart WHERE user_id = ? AND done = 0",
                [uid],
                (err, results) => {
                    if (err) {
                        console.error(err.message);
                    }
                    if (results.length > 0) {
                        cartId = results[0].id;
                        pool.query(
                            `INSERT INTO cart_items (cart_id, product_id, quantity)
							VALUES (?, ?, ?)
							ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity);`,
                            [cartId, pid, quantity],
                            (err, results) => {
                                if (err) {
                                    console.error(err.message);
                                }
                                res.status(200).json({
                                    msg: `Product with id = ${pid} has been added to the cart id = ${cartId}`,
                                });
                            }
                        );
                    }
                }
            );
        }
    );
};

const getCartItems = (req, res) => {
    const uid = req.params.uid;
    pool.query(
        `SELECT id FROM cart WHERE user_id = ? AND done = 0`,
        [uid],
        (err, results) => {
            if (err) {
                console.error(err.message);
            }
            if (results.length > 0) {
                const cartId = results[0].id;
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
                    (err, results) => {
                        if (err) {
                            console.error(err.message);
                        }
                        res.status(200).json({
                            cartItems: results,
                            msg: `Get cart items of user_id = ${cartId} successfully`,
                        });
                    }
                );
            } else {
                res.status(204).json({
                    msg: `No cart exist with user_id = ${uid}`,
                });
            }
        }
    );
};

const deleteCartItem = (req, res) => {
    const { cartItemId } = req.body;
    pool.query(
        `DELETE FROM cart_items WHERE id = ?`,
        [cartItemId],
        (err, results) => {
            if (err) {
                console.error(err.message);
            }
            res.status(200).json({
                msg: `Cart Item with id = ${cartItemId} is deleted successfully`,
            });
        }
    );
};

module.exports = {
    addItemToCart,
    getCartItems,
    deleteCartItem,
};
