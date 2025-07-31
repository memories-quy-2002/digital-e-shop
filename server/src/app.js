require('dotenv').config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const bodyParser = require("body-parser");
const db = require("./models");
const path = require("path");

const PORT = process.env.PORT || 4000;

const app = express();

const rateLimit = require('express-rate-limit');

const apiLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 100, // Limit each IP to 100 requests per windowMs
	standardHeaders: true,
	legacyHeaders: false,
	message: 'Too many requests from this IP, please try again later.'
});

app.use('/api/', apiLimiter); // Apply to all /api/ routes

const allowedOrigins = [
	"http://localhost:5173",
	"https://e-commerce-website-1-1899.vercel.app",
	"https://digital-e.vercel.app"
];
const corsOptions = {
	origin: (origin, callback) => {
		// Allow requests with no origin (like mobile apps, curl, Postman, server-to-server)
		if (!origin) return callback(null, true);
		if (allowedOrigins.includes(origin)) {
			return callback(null, true);
		} else {
			return callback(new Error('CORS policy: This origin is not allowed.'));
		}
	},
	methods: ['GET', 'POST', 'PUT', 'DELETE'],
	allowedHeaders: ['Content-Type', 'Authorization'],
	credentials: true,
};

/* Middleware */
app.use(cors(corsOptions));
app.use(bodyParser.json());
app.use(cookieParser());


// Async handler utility
const asyncHandler = fn => (req, res, next) => {
	Promise.resolve(fn(req, res, next)).catch(next);
};

// User
app.get("/api/session/check", asyncHandler(db.checkSessionToken));
app.get("/api/users/:id", asyncHandler(db.getUserLoginById));
app.post("/api/users/login", cors(corsOptions), asyncHandler(db.userLogin));
app.post("/api/users/logout", asyncHandler(db.userLogout));
app.get("/api/users", asyncHandler(db.getAllUsers));
app.post("/api/users", asyncHandler(db.addUser));

// Product
app.get("/api/products/:id", asyncHandler(db.getSingleProduct));
app.get("/api/products/", asyncHandler(db.getListProduct));
app.post("/api/products/add", asyncHandler(db.addSingleProduct));
app.post("/api/products/delete", asyncHandler(db.deleteProduct));
app.get("/api/products/relevant/:pid", asyncHandler(db.retrieveRelevantProducts));
app.get('/api/products/images/:filename', asyncHandler(async (req, res, next) => {
	const imagePath = path.join(__dirname, '..', '..', 'server', 'src', 'uploads', req.params.filename + '.jpg');
	res.sendFile(imagePath);
}));

// Wishlist
app.post("/api/wishlist", asyncHandler(db.addItemToWishlist));
app.get("/api/wishlist/:uid", asyncHandler(db.getWishlist));
app.post("/api/wishlist/delete", asyncHandler(db.deleteWishlistItem));

// Cart
app.post("/api/cart", asyncHandler(db.addItemToCart));
app.get("/api/cart/:uid", asyncHandler(db.getCartItems));
app.post("/api/cart/delete", asyncHandler(db.deleteCartItem));

// Purchase
app.post("/api/purchase/:uid", cors(corsOptions), asyncHandler(db.makePurchase));
app.get("/api/orders", asyncHandler(db.getOrders));
app.post("/api/orders/status/:oid", asyncHandler(db.changeOrderStatus));
app.get("/api/orders/item", asyncHandler(db.getOrderItems));
app.post("/api/discount", asyncHandler(db.applyDiscount));

// Review
app.post("/api/reviews", asyncHandler(db.addReview));
app.get("/api/reviews/:pid", asyncHandler(db.getReviews));


// General routes
app.get('/', (req, res) => {
	res.send("Hello World from Express");
});

app.get('/get-user', (req, res) => {
	res.send(req.cookies);
});

app.get('/clear-user', (req, res) => {
	res.clearCookie("username");
	res.clearCookie("userInfo");
	res.clearCookie("rememberMe");
	res.send("All cookies are clear");
});

// 404 handler
app.use((req, res, next) => {
	res.status(404).json({ error: 'Not Found' });
});

// Centralized error handler
app.use((err, req, res, next) => {
	console.error(err.stack || err);
	res.status(err.status || 500).json({
		error: err.message || 'Internal Server Error',
		details: process.env.NODE_ENV === 'development' ? err.stack : undefined
	});
});

app.listen(PORT, () => {
	console.log(`Server is running on port ${PORT}.`);
});

module.exports = app;