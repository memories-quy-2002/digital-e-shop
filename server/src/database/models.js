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
			console.error(error);
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
					throw error;
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
				throw error;
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
				throw error;
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

module.exports = {
	getUserLoginById,
	addUser,
	userLogin,
	getSingleProduct,
	getListProduct,
};
