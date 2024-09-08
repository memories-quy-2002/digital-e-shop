const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const rateLimit = require('express-rate-limit');
const bodyParser = require("body-parser");
const db = require("./database/models");

const PORT = process.env.PORT || 4000;
const limiter = rateLimit({
	windowMs: 60 * 60 * 1000,
	max: 100000,
	message: 'Too many requests, please try again later.'
});
const allowedOrigins = ["http://localhost:3000", "http://192.168.100.8:3000", "https://e-commerce-website-1-1899.vercel.app/"];
const app = express();

/* Middleware */
app.use(bodyParser.json());
app.use(cookieParser());

app.use(
	cors({
		origin: allowedOrigins,
		credentials: true,
		methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
	})
);
app.use(limiter)

app.use(function (req, res, next) {

	// Website you wish to allow to connect
	res.setHeader('Access-Control-Allow-Origin', allowedOrigins);

	// Request methods you wish to allow
	res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');

	// Request headers you wish to allow
	res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');

	// Set to true if you need the website to include cookies in the requests sent
	// to the API (e.g. in case you use sessions)
	res.setHeader('Access-Control-Allow-Credentials', true);

	// Pass to next layer of middleware
	next();
})

// User
app.get("/api/session/check", db.checkSessionToken)
app.get("/api/users/:id", db.getUserLoginById);
app.post("/api/users/login", db.userLogin);
app.post("/api/users/logout", db.userLogout);
app.get("/api/users/", db.getAllUsers)
app.post("/api/users", db.addUser);

// Product
app.get("/api/products/:id", db.getSingleProduct);
app.get("/api/products/", db.getListProduct);
app.post("/api/products/add", db.addSingleProduct)
app.post("/api/products/delete/", db.deleteProduct)
app.get("/api/products/relevant/:pid", db.retrieveRelevantProducts)

// Wishlist
app.post("/api/wishlist/", db.addItemToWishlist);
app.get("/api/wishlist/:uid", db.getWishlist);
app.post("/api/wishlist/delete/", db.deleteWishlistItem)

// Cart
app.post("/api/cart/", db.addItemToCart);
app.get("/api/cart/:uid", db.getCartItems);
app.post("/api/cart/delete", db.deleteCartItem)

// Purchase
app.post("/api/purchase/:uid", db.makePurchase);
app.get("/api/orders/", db.getOrders)
app.get("/api/orders/item", db.getOrderItems)
app.post("/api/discount", db.applyDiscount)

// Review
app.post("/api/reviews/", db.addReview)
app.get("/api/reviews/:pid", db.getReviews)

app.get('/getuser', (req, res) => {
	//shows all the cookies 
	res.send(req.cookies);
});

app.get('/clearuser', (request, response) => {
	response.clearCookie("username");
	response.clearCookie("userInfo");
	response.clearCookie("rememberMe");
	response.send("All cookies are clear")
})

app.listen(PORT, () => {
	console.log(`Server is running on port ${PORT}.`);
});