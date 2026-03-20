const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const app = express();
const rateLimit = require('express-rate-limit');
const requestLogger = require("./middlewares/requestLogger");
const errorHandler = require("./middlewares/errorHandler");

const PORT = process.env.PORT || 4000;

const allowedOrigins = [
	"http://localhost:5173",
	"https://digital-e.vercel.app"
];
const vercelPreviewPattern = /^https:\/\/[a-z0-9-]+\.vercel\.app$/i;

const corsOptions = {
	origin: (origin, callback) => {
		// Allow requests with no origin (like mobile apps, curl, Postman, server-to-server)
		if (!origin) return callback(null, true);
		if (allowedOrigins.includes(origin) || vercelPreviewPattern.test(origin)) {
			return callback(null, true);
		}
		// Do not throw here; let CORS respond without a hard error
		return callback(null, false);
	},
	methods: ['GET', 'POST', 'PUT', 'DELETE'],
	allowedHeaders: ['Content-Type', 'Authorization'],
	credentials: true,
};

const apiLimiter = rateLimit({
	windowMs: 5 * 60 * 1000, // 5 minutes
	max: 1000, // Limit each IP to 1000 requests per windowMs
	standardHeaders: true,
	legacyHeaders: false,
	message: 'Too many requests from this IP, please try again later.'
});

app.use((req, res, next) => {
	const origin = req.headers.origin;
	if (origin && (allowedOrigins.includes(origin) || vercelPreviewPattern.test(origin))) {
		res.header("Access-Control-Allow-Origin", origin);
	}
	res.header("Access-Control-Allow-Credentials", "true");
	res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
	res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
	if (req.method === "OPTIONS") {
		return res.sendStatus(204);
	}
	return next();
});
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use('/api/', apiLimiter);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(requestLogger);

const userRoutes = require("./routes/userRoutes");
const productRoutes = require("./routes/productRoutes");
const cartRoutes = require("./routes/cartRoutes");
const orderRoutes = require("./routes/orderRoutes");
const reviewRoutes = require("./routes/reviewRoutes");
const wishlistRoutes = require("./routes/wishlistRoutes");

// Routes
app.use("/api/users", userRoutes);
// Backward-compatible alias (some clients call /api/user/*)
app.use("/api/user", userRoutes);
app.use("/api/products", productRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/wishlist", wishlistRoutes);

// Fallback routes for serverless environments that strip the /api prefix
app.use("/users", userRoutes);
app.use("/products", productRoutes);
app.use("/cart", cartRoutes);
app.use("/orders", orderRoutes);
app.use("/reviews", reviewRoutes);
app.use("/wishlist", wishlistRoutes);

app.get('/get-user', (req, res) => {
	res.send(req.cookies);
});

app.get('/clear-user', (req, res) => {
	res.clearCookie("username");
	res.clearCookie("userInfo");
	res.clearCookie("rememberMe");
	res.send("All cookies are clear");
});

app.use(errorHandler);

app.listen(PORT, () => {
	console.log(`Server is running on port ${PORT}.`);
});

module.exports = app;
