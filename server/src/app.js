const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { doubleCsrf } = require("csrf-csrf");
const app = express();
const rateLimit = require("express-rate-limit");
const requestLogger = require("./middlewares/requestLogger");
const errorHandler = require("./middlewares/errorHandler");

const PORT = process.env.PORT || 4000;

const allowedOrigins = ["http://localhost:5173", "https://digital-e.vercel.app"];
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
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Token"],
    credentials: true,
};

const csrfSecret = process.env.CSRF_SECRET || process.env.JWT_SECRET_KEY || "dev_csrf_secret";
if (!process.env.CSRF_SECRET) {
    console.warn("CSRF_SECRET is not set. Using a fallback secret. Set CSRF_SECRET in production.");
}

const { doubleCsrfProtection, generateCsrfToken, invalidCsrfTokenError } = doubleCsrf({
    getSecret: () => csrfSecret,
    getSessionIdentifier: (req) => req.cookies?.session || req.ip || "anonymous",
    cookieName: "csrfToken",
    cookieOptions: {
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        path: "/",
    },
    size: 64,
    ignoredMethods: ["GET", "HEAD", "OPTIONS"],
    getCsrfTokenFromRequest: (req) => req.headers["x-csrf-token"],
    skipCsrfProtection: (req) =>
        req.path === "/api/users/login" ||
        req.path === "/api/users/register" ||
        req.path === "/api/users/refresh" ||
        req.path === "/users/login" ||
        req.path === "/users/register" ||
        req.path === "/users/refresh",
});

const apiLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many requests from this IP, please try again later.",
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50,
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many authentication attempts, please try again later.",
});

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use("/api/", apiLimiter);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.get("/api/csrf", (req, res) => {
    res.status(200).json({ csrfToken: generateCsrfToken(req, res) });
});
app.get("/csrf", (req, res) => {
    res.status(200).json({ csrfToken: generateCsrfToken(req, res) });
});
app.use(doubleCsrfProtection);
app.use(requestLogger);

const userRoutes = require("./routes/userRoutes");
const productRoutes = require("./routes/productRoutes");
const cartRoutes = require("./routes/cartRoutes");
const orderRoutes = require("./routes/orderRoutes");
const reviewRoutes = require("./routes/reviewRoutes");
const wishlistRoutes = require("./routes/wishlistRoutes");

app.use("/api/users/login", authLimiter);
app.use("/api/users/register", authLimiter);
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
app.use("/users/login", authLimiter);
app.use("/users/register", authLimiter);
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

app.get("/api/health", (req, res) => {
    res.status(200).json({
        status: "ok",
        timestamp: new Date().toISOString(),
    });
});

app.use((err, req, res, next) => {
    if (err === invalidCsrfTokenError) {
        return res.status(403).json({ error: "Invalid CSRF token" });
    }
    return next(err);
});

app.use(errorHandler);

app.listen(PORT, () => {
	console.log(`Server is running on port ${PORT}.`);
});

module.exports = app;
