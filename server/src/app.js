const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const rateLimit = require('express-rate-limit');
const bodyParser = require("body-parser");

const PORT = process.env.PORT || 4000;
const db = require("./database/models");
const limiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 phút
	max: 1000, // Giới hạn mỗi IP chỉ được 100 request trong 15 phút
	message: 'Too many requests, please try again later.'
});

const app = express();

/* Middleware */
app.use(bodyParser.json());
app.use(cookieParser());
app.use(
	cors({
		origin: "http://localhost:3000",
		credentials: true,
	})
);
app.use(limiter)

// User
app.get("/api/users/:id", db.getUserLoginById);
app.get("/api/users/", db.getAllUsers)
app.post("/api/users", db.addUser);
app.post("/api/users/login", db.userLogin);

// Product
app.get("/api/products/:id", db.getSingleProduct);
app.get("/api/products/", db.getListProduct);
app.post("/api/products/delete/", db.deleteProduct)
app.get("/api/products/relevant/:pid", db.retrieveRelevantProducts)

// Wishlist
app.post("/api/wishlist/", db.addItemToWishlist);
app.get("/api/wishlist/:uid", db.getWishlist);
app.post("/api/wishlist/delete/:wid", db.deleteWishlistItem)

// Cart
app.post("/api/cart/", db.addItemToCart);
app.get("/api/cart/:uid", db.getCartItems);
app.post("/api/cart/delete", db.deleteCartItem)

// Purchase
app.post("/api/purchase/:uid", db.makePurchase);
app.get("/api/orders/", db.getOrders)
app.post("/api/discount", db.applyDiscount)

// Review
app.post("/api/reviews/", db.addReview)
app.get("/api/reviews/:pid", db.getReviews)

app.listen(PORT, () => {
	console.log(`Server is running on port ${PORT}.`);
});