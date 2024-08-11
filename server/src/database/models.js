const mysql = require("mysql");
const jwt = require("jsonwebtoken");
const { ServerApiVersion } = require('mongodb');
const MongoClient = require('mongodb').MongoClient;
const { hashPassword } = require("../utils/hashPassword");
const pool = mysql.createPool({
	host: "localhost",
	user: "root",
	password: "",
	database: "e-commerce-shop",
});

const uri = `mongodb+srv://vinhluu2608:vuongtranlinhlinh123456789@cluster0.teog563.mongodb.net/?retryWrites=true&w=majority`;

/* Check database connection */
const checkDbConnection = (req, res, next) => {
	pool.getConnection((err) => {
		if (err) {
			console.error("Error connecting to the MySQL database: ", err);
			return res.status(503).json({ error: 'Service Unavailable' });
		} else {
			console.log("Connected to MySQL database");
		}
		next();
	});
};

const getUserLoginById = (request, response) => {
	const uid = request.params.id;
	pool.query("SELECT * FROM users WHERE id = ?", [uid], (error, results) => {
		if (error) {
			console.error(error.message);
		} else {
			if (results.length > 0) {
				const userData = results[0];
				response.status(200).json({
					userData,
					msg: 'User logon successfully'
				});
			} else {
				response.status(401).json({ error: 'Unauthorized' })
			}
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
								.status(204)
								.json({ msg: "User not exists" });
							return;
						}
					}
				);
			} catch (err) {
				pool.query(
					"SELECT * FROM users WHERE id = ?",
					[userId],
					(error, results) => {
						if (results.length > 0) {
							const token = jwt.sign(
								{ id: uid, email: results[0].email },
								"secret-key",
								{
									expiresIn: "30d",
								}
							);
							pool.query(
								"UPDATE users SET token = ?, last_login=CURRENT_TIMESTAMP WHERE id = ?",
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
											maxAge: 1000 * 60 * 60 * 24 * 30, // Expires in 30 days (adjust as needed)
										}
									);
									response.status(200).json({
										token,
										msg: "User login successfully",
									});
								}
							);
						} else {
							response
								.status(401)
								.json({ msg: "User not found" });
							return;
						}
					}
				);
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
									maxAge: 1000 * 60 * 60 * 24 * 30, // Expires in 7 days (adjust as needed)
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

const getAllUsers = (request, response) => {
	pool.query(
		`SELECT * FROM users`,
		(error, results) => {
			if (error) {
				console.error(error.message);
			}
			if (results.length > 0) {

				response.status(200).json({
					accounts: results,
					msg: "Get users successfully"
				});
			} else {
				response.status(204).json({
					msg: "Users not found",
				});
			}
		}
	);
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
				response.status(204).json({
					msg: "Product not found",
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
				response.status(204).json({
					msg: "There is no product in store",
				});
			}
		}
	);
};

const deleteProduct = (request, response) => {
	const { pid } = request.body
	pool.query(
		`DELETE FROM products WHERE id = ?`, [pid],
		(error, results) => {
			if (error) {
				console.error(error.message);
			}
			response.status(200).json({
				msg: `Delete product with id = ${pid} successfully`,
			});

		}
	);
};

const addItemToWishlist = (request, response) => {
	const { uid, pid } = request.body;
	pool.query(
		`INSERT INTO wishlist (user_id, product_id)
		VALUES (?, ?)
		ON DUPLICATE KEY UPDATE product_id = product_id;
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
	const wid = request.params.wid;
	console.log(wid);
	pool.query(`DELETE FROM wishlist WHERE id = ?`, [wid], (error, results) => {
		if (error) {
			console.error(error.message);
		}
		response.status(200).json({
			msg: `Delete wishlist items with user_id = ${wid} successfully`,
		});
	})
}

const addItemToCart = (request, response) => {
	const { pid, uid, quantity } = request.body;
	var cartId = 0;
	pool.query(
		`INSERT INTO cart (user_id)
		SELECT ? 
		WHERE NOT EXISTS ( 
			SELECT 1 FROM cart WHERE user_id = ? AND done = 0);`,
		[uid, uid],
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
						VALUES (?, ?, ?)
						ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity);`,
						[cartId, pid, quantity],
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
				response.status(204).json({
					msg: `No cart exist with user_id = ${uid}`,
				});
			}
		}
	);
};

const deleteCartItem = (request, response) => {
	const { cartItemId } = request.body;
	console.log(cartItemId);
	pool.query(
		`DELETE FROM cart_items WHERE id = ?`,
		[cartItemId],
		(error, results) => {
			if (error) {
				console.error(error.message);
			}
			response.status(200).json({
				msg: `Cart Item with id = ${cartItemId} is deleted successfully`,
			});
		}
	);
};

const makePurchase = (request, response) => {
	try {
		const uid = request.params.uid;
		const { totalPrice, cart, discount, subtotal } = request.body;
		var orderId;

		// Bắt đầu transaction
		pool.query('START TRANSACTION');

		// Update cart to set done = 1
		pool.query('UPDATE cart SET done = 1 WHERE user_id = ?', [uid]);

		// Insert into orders
		pool.query(
			'INSERT INTO orders (user_id, total_price, discount, subtotal) VALUES (?, ?, ?, ?)',
			[uid, totalPrice, discount, subtotal], (error, results) => {
				orderId = results.insertId
				cart.map(async (product) => {
					pool.query(
						'INSERT INTO order_items (order_id, product_id, quantity) VALUES (?, ?, ?)',
						[orderId, product.productId, product.quantity]
					);
					pool.query(
						'UPDATE products SET stock = stock - ? WHERE id = ?',
						[product.quantity, product.productId]
					);
				});
			}
		);

		// Commit transaction nếu mọi thứ đều ổn
		pool.query('COMMIT');

		// Gửi phản hồi thành công
		response.status(200).json({
			msg: `The order items have been added to the order with id = ${orderId}`,
		});
	} catch (error) {
		// Rollback nếu có lỗi
		pool.query('ROLLBACK');
		console.error(error.message);
		response.status(500).json({
			msg: 'Error processing the purchase',
			error: error.message,
		});
	}
};


const getOrders = (request, response) => {
	pool.query(
		`SELECT * FROM orders`,
		(error, results) => {
			if (error) {
				console.error(error.message);
			}
			else {
				if (results.length > 0) {
					response.status(200).json({
						orders: results,
						msg: `Orders have been received successfully`,
					});
				}
				else {
					response.status(204).json({
						msg: 'Order not found'
					})
				}
			}
		}
	);
};

const retrieveRelevantProducts = async (request, response) => {
	const pid = request.params.pid
	try {
		const client = new MongoClient(uri, { serverApi: ServerApiVersion.v1 });
		await client.connect();
		const db = client.db('e_commerce');
		const collection = db.collection('relevant_product');

		const documents = await collection.find({ product_id: parseInt(pid) }).toArray();

		await client.close();
		response.status(200).json({
			relevantProducts: documents[0].relevant_products,
			msg: `Retrieved products relevant with product id = ${pid} successfully`,
		});
	} catch (error) {
		console.error('Error retrieving relevant products:', error);
	}
}


/* Reviews */

const addReview = (request, response) => {
	const { uid, pid, rating, reviewText } = request.body
	pool.query(
		`INSERT INTO reviews (user_id, product_id, rating, review_text) VALUE (?, ?, ?, ?)`,
		[uid, pid, rating, reviewText],
		(error, results) => {
			if (error) {
				console.error(error.message);
			}
			else {
				response.status(200).json({
					msg: `The review has been added to the product with id = ${pid}`,
				})
			}
		}
	);
}

const getReviews = (request, response) => {
	const pid = request.params.pid
	console.log(pid);

	pool.query(
		`SELECT u.username, r.rating, r.review_text, r.created_at FROM reviews r JOIN users u ON u.id = r.user_id WHERE r.product_id = ?`, [pid],
		(error, results) => {
			if (error) {
				console.error(error.message);
			}
			else {
				if (results.length > 0) {
					response.status(200).json({
						reviews: results,
						msg: `Reviews of product id = ${pid} have been retrieved successfully`,
					})
				}
				else {
					response.status(204).json({
						msg: 'Review not found'
					})
				}
			}
		}
	);
}

/* Discount code */

const applyDiscount = (request, response) => {
	const { discountCode, price } = request.body
	pool.query(
		`SELECT * FROM discount WHERE discount_code = ?`,
		[discountCode],
		(error, results) => {
			if (error) {
				console.error(error.message);
			}
			else {
				if (results.length > 0) {
					var discountPercent = results[0].discount_percent
					var newPrice = price * (100 - discountPercent) / 100;
					response.status(200).json({
						newPrice: newPrice,
						msg: `Discount code has been applied successfully`,
					})
				}
				else {
					response.status(204).json({
						msg: `Discount not found`,
					})
				}

			}
		}
	);
}

module.exports = {
	checkDbConnection,
	getUserLoginById,
	addUser,
	getAllUsers,
	userLogin,
	getSingleProduct,
	getListProduct,
	deleteProduct,
	addItemToWishlist,
	getWishlist,
	deleteWishlistItem,
	addItemToCart,
	getCartItems,
	deleteCartItem,
	makePurchase,
	getOrders,
	retrieveRelevantProducts,
	addReview,
	getReviews,
	applyDiscount
};
