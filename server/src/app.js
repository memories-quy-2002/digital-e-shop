require('dotenv').config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const bodyParser = require("body-parser");
const app = express();
const rateLimit = require('express-rate-limit');
const csrf = require('lusca').csrf;

const PORT = process.env.PORT || 4000;

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

const apiLimiter = rateLimit({
	windowMs: 5 * 60 * 1000, // 15 minutes
	max: 1000, // Limit each IP to 100 requests per windowMs
	standardHeaders: true,
	legacyHeaders: false,
	message: 'Too many requests from this IP, please try again later.'
});

app.use(cors(corsOptions));
app.use('/api/', apiLimiter);
app.use(bodyParser.json());
app.use(cookieParser());
app.use(csrf());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use((req, res, next) => {
	console.log(`${req.method} request for '${req.url}'`);
	next();
});
app.use((err, req, res, next) => {
	console.error(err.stack);
	res.status(500).json({ error: "Something broke!" });
});

const userRoutes = require("./routes/userRoutes");
const productRoutes = require("./routes/productRoutes");
const cartRoutes = require("./routes/cartRoutes");
const orderRoutes = require("./routes/orderRoutes");
const reviewRoutes = require("./routes/reviewRoutes");
const wishlistRoutes = require("./routes/wishlistRoutes");

// Routes
app.use("/api/users", userRoutes);
app.use("/api/products", productRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/wishlist", wishlistRoutes);

app.get('/get-user', (req, res) => {
	res.send(req.cookies);
});

app.get('/clear-user', (req, res) => {
	res.clearCookie("username");
	res.clearCookie("userInfo");
	res.clearCookie("rememberMe");
	res.send("All cookies are clear");
});

app.listen(PORT, () => {
	console.log(`Server is running on port ${PORT}.`);
});

module.exports = app;