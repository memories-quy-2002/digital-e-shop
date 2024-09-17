require('dotenv').config();

const mysql = require("mysql");
const jwt = require("jsonwebtoken");
const multer = require('multer');
const { put } = require('@vercel/blob')
const { ServerApiVersion } = require('mongodb');
const MongoClient = require('mongodb').MongoClient;
const util = require('util');
const { hashPassword } = require("../utils/hashPassword");

const pool = mysql.createPool({
	host: process.env.DB_HOST,
	user: process.env.DB_USER,
	password: process.env.DB_PASSWORD,
	database: process.env.DB_NAME,
	port: process.env.DB_PORT,
});

pool.getConnection((err, connection) => {
	if (err) {
		console.error('Error connecting to MySQL database:', err);
		return;
	}
	console.log('Connected to MySQL database!');
	connection.release();
});

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const uri = `mongodb+srv://vinhluu2608:vuongtranlinhlinh123456789@cluster0.teog563.mongodb.net/?retryWrites=true&w=majority`;

const startSession = (userId) => {
	return new Promise((resolve, reject) => {
		const sessionStart = new Date();
		const sessionMonth = sessionStart.getMonth() + 1; // Month (1-12)
		const sessionYear = sessionStart.getFullYear(); // Year

		pool.query(`
            INSERT INTO customer_sessions (user_id, session_start, session_month, session_year)
            VALUES (?, ?, ?, ?)
        `, [userId, sessionStart, sessionMonth, sessionYear], (error, results) => {
			if (error) {
				console.error(error.message);
				return reject(error);
			}
			resolve(results.insertId);
		});
	});
};

const checkSessionToken = (request, response) => {
	const userInfo = request.cookies.userInfo;
	if (!userInfo) {
		return response.status(401).json({ sessionActive: false, msg: "No session information found" });
	}
	try {
		const { token } = JSON.parse(userInfo);
		const payload = jwt.verify(token, "secret-key");
		if (payload) {
			return response.status(200).json({ sessionActive: true });
		}
	} catch (err) {
		console.error(err);
		return response.status(401).json({ sessionActive: false, msg: "Session invalid or expired" });
	}
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
	pool.query("SELECT * FROM users WHERE id = ?", [uid], async (error, results) => {
		if (error) {
			console.error(error.message);
			return response.status(500).json({ msg: "Internal server error" });
		}
		if (results.length === 0) {
			return response.status(401).json({ msg: "Invalid username, password, or role" });
		}

		const userId = results[0].id;
		const userRole = results[0].role;
		const userToken = results[0].token;

		if (role !== userRole) {
			return response.status(401).json({ msg: "Invalid username, password, or role" });
		}

		try {
			jwt.verify(userToken, "secret-key");
			const sessionId = await startSession(userId);
			pool.query("UPDATE users SET last_login=CURRENT_TIMESTAMP WHERE id=?", [userId]);

			// Gửi cookies đến client
			response.cookie("session", sessionId, {
				httpOnly: true,
				secure: true,
				sameSite: 'None',
				maxAge: 1000 * 60 * 60 * 24 * 30, // 30 ngày
			});

			response.cookie("userInfo", JSON.stringify({ uid: userId, token: userToken }), {
				httpOnly: true,
				secure: true,
				sameSite: 'None',
				maxAge: 1000 * 60 * 60 * 24 * 30, // 30 ngày
			});

			return response.status(200).json({
				uid: userId,
				token: userToken,
				msg: "Login successfully",
			});

		} catch (err) {
			console.error("JWT Verification failed:", err);

			const token = jwt.sign({ id: userId, email: results[0].email }, "secret-key", {
				expiresIn: "30d",
			});

			pool.query("UPDATE users SET token = ?, last_login=CURRENT_TIMESTAMP WHERE id = ?", [token, userId], async (error) => {
				if (error) {
					console.error(error.message);
					return response.status(500).json({ msg: "Internal server error" });
				}

				const sessionId = await startSession(userId);

				response.cookie("session", sessionId, {
					httpOnly: true,
					secure: true,
					sameSite: 'None',
					maxAge: 1000 * 60 * 60 * 24 * 30, // 30 ngày
				});

				response.cookie("userInfo", JSON.stringify({ uid: userId, token }), {
					httpOnly: true,
					secure: true,
					sameSite: 'None',
					maxAge: 1000 * 60 * 60 * 24 * 30, // 30 ngày
				});

				return response.status(200).json({
					token,
					msg: "User login successfully",
				});
			});
		}
	});
};


const userLogout = (request, response) => {
	const sessionId = request.cookies.session;
	try {
		const sessionEnd = new Date();
		console.log('Cookies before logout:', request.cookies);
		// Calculate session duration
		pool.query(`SELECT session_start FROM customer_sessions WHERE id = ?`, [sessionId], (error, results) => {
			var session_start = results[0].session_start;
			const sessionDuration = Math.floor((sessionEnd - new Date(session_start)) / 1000);
			pool.query(`
				UPDATE customer_sessions
				SET session_end = ?, session_duration = ?
				WHERE id = ?
			`, [sessionEnd, sessionDuration, parseInt(sessionId)], (error, results) => {
				if (error) {
					console.error(error.message);
				} else {
					response.clearCookie('session', {
						httpOnly: true,
						secure: process.env.NODE_ENV === 'production',
						sameSite: 'None',
					});

					// Xóa cookie 'userInfo'
					response.clearCookie('userInfo', {
						httpOnly: true,
						secure: process.env.NODE_ENV === 'production',
						sameSite: 'None',
					});

					// Xóa cookie 'rememberMe' (nếu có)
					if (request.cookies.rememberMe) {
						response.clearCookie('rememberMe', {
							httpOnly: true,
							secure: process.env.NODE_ENV === 'production',
							sameSite: 'None',
						});
					}
					console.log('Cookies after logout:', request.cookies);
					response.status(200).json({
						msg: "You have been logout successfully"
					})
				}
			})
		})

	} catch (err) {
		console.error(err);
		return response.status(500).json({ msg: "Internal server error" });
	}

}

const addUser = async (request, response) => {
	const { uid, user } = request.body;
	try {
		// Băm mật khẩu
		const hashedPassword = await hashPassword(user.password);
		pool.query(
			"INSERT INTO users (id, username, email, password, role, token) VALUES (?, ?, ?, ?, ?, '')",
			[uid, user.username, user.email, hashedPassword, user.role], (error, results) => {
				if (error) {
					console.error(error.message);
					return response.status(500).json({ msg: "Internal server error" });
				}
				const token = jwt.sign(
					{ id: uid, email: user.email },
					"secret-key",
					{ expiresIn: "30d" }
				);
				pool.query(
					"UPDATE users SET token = ? WHERE id = ?",
					[token, uid], (error, results) => {
						if (error) {
							console.error(error.message);
							return response.status(500).json({ msg: "Internal server error" });
						}
						response.cookie("userInfo", JSON.stringify({ uid, token }), {
							httpOnly: true,
							secure: true,
							sameSite: 'None',
							maxAge: 1000 * 60 * 60 * 24 * 30, // 30 ngày
						});

						return response.status(200).json({
							uid,
							token,
							msg: "User created successfully",
						});
					}
				);
			}
		);
	} catch (error) {
		console.error(error.message);
		response.status(500).json({
			msg: "Error creating user",
			error: error.message,
		});
	}
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

const addSingleProduct = (request, response) => {
	const extractFileName = (url) => {
		const parts = url.split('/');
		const fileNameWithExtension = parts[parts.length - 1];
		const fileName = fileNameWithExtension.split('.')[0];
		return fileName;
	}
	const insertProduct = async (productName, description, fileName, categoryId, brandId, specifications, price, inventory) => {
		pool.query = util.promisify(pool.query); // Chuyển hàm query thành hàm Promise
		try {
			pool.query('START TRANSACTION'); // Bắt đầu transaction
			pool.query(
				'INSERT INTO products (name, description, main_image, category_id, brand_id, specifications, price, stock) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
				[
					productName,
					description,
					fileName,
					categoryId,
					brandId,
					specifications,
					price,
					inventory
				], (error, results) => {
					if (error) {
						console.error(error.message);
						return;
					}
					pool.query('COMMIT');
					console.log('Transaction committed successfully.');

					// Gửi phản hồi thành công
					return response.status(200).json({
						msg: 'Product added successfully',
					});
				}
			);
		} catch (error) {
			// Nếu có lỗi, rollback transaction và trả về lỗi
			console.error('Error occurred:', error);
			pool.query('ROLLBACK'); // Quay lại trạng thái ban đầu
			return response.status(500).json({
				msg: 'Internal server error',
				error: error.message
			});
		}
	}
	upload.single('image')(request, response, async (err) => {
		if (err) {
			return response.status(400).json({ msg: 'Error uploading file' });
		}
		const { name, description, category, brand, specifications, price, inventory } = request.body
		const image = request.file;
		const imageName = name.toLowerCase()
			.replace(/ /g, '_')
			.replace(/-/g, '_')
		const imageBuffer = image.buffer
		const token = process.env.BLOB_READ_WRITE_TOKEN;
		if (!token) {
			return response.status(500).json({ msg: 'BLOB_READ_WRITE_TOKEN is not set' });
		}
		const blob = await put(`uploads/${imageName}.jpg`, imageBuffer, { access: "public", token });
		const fileName = extractFileName(blob.url); // Hàm extractFileName sẽ lấy tên file từ URL của Blob

		// Check if all required fields are present
		if (!name || !description || !category || !brand || !price || !inventory) {
			return response.status(400).json({ msg: 'Please fill in all required fields' });
		}

		try {
			pool.query('START TRANSACTION', (err) => {
				if (err) {
					console.error('Error starting transaction:', err);
					throw err;
				}

				// Get or insert brand
				pool.query('SELECT id FROM brands WHERE name = ?', [brand], (error, results) => {
					if (error) {
						console.error('Error retrieving brand:', error);
						throw error;
					}

					let brandId;
					if (results.length > 0) {
						brandId = results[0].id;
					} else {
						pool.query('INSERT INTO brands (name) VALUES (?)', [brand], (error, results) => {
							if (error) {
								console.error('Error inserting brand:', error);
								throw error;
							}
							brandId = results.insertId;
						});
					}

					// Get or insert category
					pool.query('SELECT id FROM categories WHERE name = ?', [category], (error, results) => {
						if (error) {
							console.error('Error retrieving category:', error);
							throw error;
						}

						let categoryId;
						if (results.length > 0) {
							categoryId = results[0].id;
						} else {
							pool.query('INSERT INTO categories (name) VALUES (?)', [category], (error, results) => {
								if (error) {
									console.error('Error inserting category:', error);
									throw error;
								}
								categoryId = results.insertId;
							});
						}

						// Insert product only after both brandId and categoryId are obtained
						insertProduct(name, description, fileName, categoryId, brandId, specifications, price, inventory);
					});
				});
			});

		} catch (error) {
			console.error(error.message);
			pool.query("ROLLBACK");
			response.status(500).json({ msg: 'Internal server error' });
		}
	});
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
			else if (results.length > 0) {
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
	console.log(pid);

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
	const uid = request.params.uid;
	const { totalPrice, cart, discount, subtotal, shippingAddress } = request.body;

	// Bắt đầu transaction
	pool.query('START TRANSACTION', (err) => {
		if (err) {
			return response.status(500).json({ msg: 'Error starting transaction', error: err.message });
		}

		// Update cart để set done = 1
		pool.query('UPDATE cart SET done = 1 WHERE user_id = ?', [uid], (err) => {
			if (err) {
				pool.query('ROLLBACK');
				return response.status(500).json({ msg: 'Error updating cart', error: err.message });
			}

			// Thêm thông tin vào bảng orders
			pool.query(
				'INSERT INTO orders (user_id, total_price, discount, subtotal, shipping_address) VALUES (?, ?, ?, ?, ?)',
				[uid, totalPrice, discount, subtotal, shippingAddress],
				(err, results) => {
					if (err) {
						pool.query('ROLLBACK');
						return response.status(500).json({ msg: 'Error inserting into orders', error: err.message });
					}
					const orderId = results.insertId;
					cart.forEach((product, index) => {
						pool.query(
							'INSERT INTO order_items (order_id, product_id, quantity, total_price) VALUES (?, ?, ?, ?)',
							[orderId, product.productId, product.quantity, (product.sale_price ? product.sale_price : product.price) * product.quantity],
							(err) => {
								if (err) {
									pool.query('ROLLBACK');
									return response.status(500).json({ msg: 'Error inserting order item', error: err.message });
								}

								// Cập nhật số lượng tồn kho
								pool.query(
									'UPDATE products SET stock = stock - ? WHERE id = ?',
									[product.quantity, product.productId],
									(err) => {
										if (err) {
											pool.query('ROLLBACK');
											return response.status(500).json({ msg: 'Error updating product stock', error: err.message });
										}

										// Nếu đây là lần cuối cùng của vòng lặp, chúng ta commit transaction
										if (index === cart.length - 1) {
											pool.query('COMMIT', (err) => {
												if (err) {
													return response.status(500).json({ msg: 'Error committing transaction', error: err.message });
												}

												// Gửi phản hồi thành công
												response.status(200).json({
													msg: `The order items have been added to the order with id = ${orderId}`,
												});
											});
										}
									}
								);
							}
						);
					});
				}
			);
		});
	});
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

const changeOrderStatus = (request, response) => {
	const orderId = request.params.oid
	const { status } = request.body
	pool.query(
		`UPDATE orders SET status = ? WHERE id = ?`, [status, orderId],
		(error, results) => {
			if (error) {
				console.error(error);
				response.status(500).json({ error: 'Internal server error' });
			}
			pool.query(`SELECT * FROM orders WHERE id = ?`, [orderId], (error, results) => {
				if (error) {
					console.error(error);
					response.status(500).json({ error: 'Internal server error' });
				}
				response.status(200).json({
					order: results[0],
					msg: 'Item updated successfully'
				});
			})

		}
	);
};

const getOrderItems = (request, response) => {
	pool.query(
		`SELECT 
			p.id,
			p.name,
			p.price,
			oi.order_id,
			SUM(oi.quantity) AS sales,
			SUM(oi.total_price) AS revenue
		FROM 
			products p
		JOIN 
			order_items oi ON p.id = oi.product_id
		JOIN 
			orders o ON oi.order_id = o.id
		GROUP BY 
			p.id, p.name, p.price, oi.order_id
		ORDER BY 
			revenue DESC;
		`,
		(error, results) => {
			if (error) {
				console.error(error.message);
			}
			else {
				if (results.length > 0) {
					response.status(200).json({
						orderItems: results,
						msg: `Products sales and revenue have been retrieved successfully`,
					});
				}
				else {
					response.status(204).json({
						msg: 'Items not found'
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
		if (documents.length > 0) {
			response.status(200).json({
				relevantProducts: documents[0].relevant_products,
				msg: `Retrieved products relevant with product id = ${pid} successfully`,
			});
		}
		else {
			response.status(200).json({
				relevantProducts: [],
				msg: `No relevant products found for product id = ${pid}`,
			})
		}


	} catch (error) {
		console.error('Error retrieving relevant products:', error);
	}
}


/* Reviews */

const addReview = (request, response) => {
	const { uid, pid, rating, reviewText } = request.body
	if (!pid || !rating) {
		return response.status(400).json({ msg: 'Please provide productId and rating' });
	}
	pool.query('SELECT reviews, rating FROM products WHERE id = ?', [pid], (error, results) => {
		if (error) {
			console.error(error);
			return response.status(500).json({ msg: 'Database error' });
		}

		if (results.length === 0) {
			return response.status(404).json({ msg: 'Product not found' });
		}

		const currentReviews = results[0].reviews || 0;
		const currentRating = results[0].rating || 0;


		const newReviews = currentReviews + 1;
		const newRating = (currentRating * currentReviews + rating) / newReviews;

		pool.query('INSERT INTO reviews (user_id, product_id, rating, review_text) VALUES (?, ?, ?, ?)', [uid, pid, rating, reviewText], (error, results) => {
			if (error) {
				console.error(error);
				return response.status(500).json({ msg: 'Database error when adding review' });
			}

			pool.query('UPDATE products SET reviews = ?, rating = ? WHERE id = ?', [newReviews, newRating, pid], (error, results) => {
				if (error) {
					console.error(error);
					return response.status(500).json({ msg: 'Database error when updating product' });
				}

				response.status(200).json({
					msg: `The review has been added to the product with id = ${pid}`,
				})
			});
		});
	});
}

const getReviews = (request, response) => {
	const pid = request.params.pid
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
	checkSessionToken,
	getUserLoginById,
	userLogin,
	userLogout,
	addUser,
	getAllUsers,
	addSingleProduct,
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
	changeOrderStatus,
	getOrderItems,
	retrieveRelevantProducts,
	addReview,
	getReviews,
	applyDiscount
};