const mysql = require("mysql");
const jwt = require("jsonwebtoken");
const { hashPassword } = require("../utils/hashPassword");
const pool = mysql.createPool({
	host: "localhost",
	user: "root",
	password: "",
	database: "e-commerce-shop",
});

pool.getConnection((err) => {
	if (err) {
		console.error("Error connecting to the MySQL database: ", err);
	} else {
		console.log("Connected to MySQL database");
	}
});

const getUserLoginById = (request, response) => {
	const uid = request.params.id;
	pool.query("SELECT * FROM users WHERE id = ?", [uid], (error, results) => {
		if (error) {
			console.error(error.message);
		} else {
			const userData = results[0];
			response.status(200).json({
				userData,
			});
		}
	});
};

const userLogin = (request, response) => {
	const { uid, role } = request.body;
	pool.query("SELECT * FROM users WHERE id = ?", [uid], (error, results) => {
		if (error) {
			console.error(error.message);
		}
		if (results.length === 0) {
			response.status(401).json({
				msg: "Invalid username or password or role",
			});
		}
		const userId = results[0].id;
		const userRole = results[0].role;
		const userToken = results[0].token;
		if (role !== userRole) {
			response.status(401).json({
				msg: "Invalid username or password or role",
			});
		} else {
			try {
				const payload = jwt.verify(userToken, "secret-key");
				pool.query(
					"SELECT * FROM users WHERE id = ?",
					[payload.id],
					(error, results) => {
						if (results.length > 0) {
							pool.query(
								"UPDATE users SET last_login=CURRENT_TIMESTAMP WHERE id=?",
								[userId]
							);
							response.cookie(
								"user",
								JSON.stringify({ userId, userToken }),
								{
									httpOnly: false,
									// Consider using Secure flag if using HTTPS
									maxAge: 1000 * 60 * 60 * 24 * 7, // Expires in 7 days (adjust as needed)
								}
							);
							response.status(200).json({
								uid: userId,
								token: userToken,
								msg: "Login successfully",
							});
						} else {
							response
								.status(401)
								.json({ msg: "User not exists" });
							return;
						}
					}
				);
			} catch (err) {
				response.status(401).json({ msg: "JWT Expired" });
				return;
			}
		}
	});
};

const addUser = (request, response) => {
	const { uid, user } = request.body;
	(async () => {
		const hashedPassword = await hashPassword(user.password);

		// Create and set the "Remember Me" cookie

		pool.query(
			"INSERT INTO users (id, username, email, password, role) VALUES (?, ?, ?, ?, ?)",
			[uid, user.username, user.email, hashedPassword, user.role],
			(error, results) => {
				if (error) {
					console.error(error.message);
				} else {
					const token = jwt.sign(
						{ id: uid, email: user.email },
						"secret-key",
						{
							expiresIn: "30d",
						}
					);
					pool.query(
						"UPDATE users SET token = ? WHERE id = ?",
						[token, uid],
						(error, results) => {
							if (error) {
								throw error;
							}
							response.cookie(
								"user",
								JSON.stringify({ uid, token }),
								{
									httpOnly: false,
									// Consider using Secure flag if using HTTPS
									maxAge: 1000 * 60 * 60 * 24 * 7, // Expires in 7 days (adjust as needed)
								}
							);
							response.status(200).json({
								token,
								msg: "User created successfully",
							});
						}
					);
				}
			}
		);
	})();
};

const getSingleProduct = (request, response) => {
	const pid = request.params.id;
	pool.query(
		`SELECT
		products.id,
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
		JOIN categories ON categories.id = products.category_id
		JOIN brands ON brands.id = products.brand_id
		WHERE
			products.id = ?`,
		[pid],
		(error, results) => {
			if (error) {
				console.error(error.message);
			}
			if (results.length > 0) {
				const product = results[0];
				response.status(200).json({
					product,
					msg: "Get product successfully with id = " + pid,
				});
			} else {
				response.status(401).json({
					msg: "No product exists with id = " + pid,
				});
			}
		}
	);
};

const getListProduct = (request, response) => {
	pool.query(
		`SELECT
			products.id,
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
		JOIN categories ON categories.id = products.category_id
		JOIN brands ON brands.id = products.brand_id`,
		(error, results) => {
			if (error) {
				console.error(error.message);
			}
			if (results.length > 0) {
				response.status(200).json({
					products: results,
					msg: "Get list products successfully",
				});
			} else {
				console.log("There is no product");
				response.status(200).json({
					msg: "There is no product in store",
				});
			}
		}
	);
};

const addItemToWishlist = (request, response) => {
	const { uid, pid } = request.body;
	console.log({ uid, pid });
	pool.query(
		`INSERT INTO wishlist (user_id, product_id)
		VALUES (?, ?)
		ON DUPLICATE KEY IGNORE;
		`,
		[uid, pid],
		(error, results) => {
			if (error) {
				console.error(error.message);
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
		`SELECT * FROM wishlist WHERE user_id = ?`,
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

const addItemToCart = (request, response) => {
	const { pid, uid } = request.body;
	var cartId = 0;
	pool.query(
		`INSERT INTO cart (user_id)
		SELECT ? 
		WHERE NOT EXISTS ( 
			SELECT 1 FROM cart WHERE user_id = ? AND done = 0);`,
		[uid],
		(error, results) => {
			if (error) {
				console.error(error.message);
			}
			pool.query(
				"SELECT id FROM cart WHERE user_id = ? AND done = 0",
				[uid],
				(error, results) => {
					if (error) {
						console.error(error.message);
					}
					cartId = results[0].id;
					pool.query(
						`INSERT INTO cart_items (cart_id, product_id, quantity)
						VALUES (?, ?, 1)
						ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity);`,
						[cartId, pid],
						(error, results) => {
							if (error) {
								console.error(error.message);
							}
							response.status(200).json({
								msg: `Product with id = ${pid} has been added to the cart id = ${cartId}`,
							});
						}
					);
				}
			);
		}
	);
};

const getCartItems = (request, response) => {
	const uid = request.params.uid;
	pool.query(
		`SELECT id FROM cart WHERE user_id = ? AND done = 0`,
		[uid],
		(error, results) => {
			if (error) {
				console.error(error.message);
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
					(error, results) => {
						if (error) {
							console.error(error.message);
						}
						response.status(200).json({
							cartItems: results,
							msg: `Get cart items of user_id = ${cartId} successfully`,
						});
					}
				);
			} else {
				response.status(401).json({
					msg: `No cart exist with user_id = ${uid}`,
				});
			}
		}
	);
};

module.exports = {
	getUserLoginById,
	addUser,
	userLogin,
	getSingleProduct,
	getListProduct,
	addItemToWishlist,
	getWishlist,
	addItemToCart,
	getCartItems,
};
