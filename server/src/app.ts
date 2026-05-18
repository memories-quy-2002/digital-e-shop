const path = require("path");
const process = require("process");
require("dotenv").config({ path: path.join(process.cwd(), ".env") });
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { doubleCsrf } = require("csrf-csrf");
const app = express();
const rateLimit = require("express-rate-limit");
const requestLogger = require("./middlewares/requestLogger");
const errorHandler = require("./middlewares/errorHandler");
const { getRouteLimit } = require("./utils/rateLimitConfig");
import type { AppNextFunction, AppRequest, AppResponse } from "./types/domain";

const PORT = process.env.PORT || 4000;

app.use((req: AppRequest, res: AppResponse, next: AppNextFunction) => {
    res.header(
        "Access-Control-Allow-Origin",
        process.env.NODE_ENV === "production" ? "https://digital-e.vercel.app" : "http://localhost:5173",
    );
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type,Authorization,X-CSRF-Token");

    if (req.method === "OPTIONS") {
        return res.sendStatus(200);
    }

    next();
});

const allowedOrigins = [
    "http://localhost:5173", // local dev
    "https://digital-e.vercel.app", // production
];

app.use(
    cors({
        origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
            if (!origin || allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                callback(new Error("Not allowed by CORS"));
            }
        },
        credentials: true,
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Token"],
    }),
);

const csrfSecret = process.env.CSRF_SECRET || process.env.JWT_SECRET_KEY || "dev_csrf_secret";
if (!process.env.CSRF_SECRET) {
    console.warn("CSRF_SECRET is not set. Using a fallback secret. Set CSRF_SECRET in production.");
}

const { doubleCsrfProtection, generateCsrfToken, invalidCsrfTokenError } = doubleCsrf({
    getSecret: () => csrfSecret,
    getSessionIdentifier: (req: AppRequest) => req.cookies?.session || req.ip || "anonymous",
    cookieName: "csrfToken",
    cookieOptions: {
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        path: "/",
    },
    size: 64,
    ignoredMethods: ["GET", "HEAD", "OPTIONS"],
    getCsrfTokenFromRequest: (req: AppRequest) => req.headers["x-csrf-token"],
    skipCsrfProtection: (req: AppRequest) =>
        req.path === "/api/users/login" ||
        req.path === "/api/users/register" ||
        req.path === "/api/users/refresh" ||
        req.path === "/users/login" ||
        req.path === "/users/register" ||
        req.path === "/users/refresh",
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: getRouteLimit(500),
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many authentication attempts, please try again later.",
});

app.options(/.*/, cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.get("/api/csrf", (req: AppRequest, res: AppResponse) => {
    res.status(200).json({ csrfToken: generateCsrfToken(req, res) });
});
app.get("/csrf", (req: AppRequest, res: AppResponse) => {
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
const blobRoutes = require("./routes/blobRoutes");
const promotionRoutes = require("./routes/promotionRoutes");
const analyticsRoutes = require("./routes/analyticsRoutes");

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
app.use("/api/blob", blobRoutes);
app.use("/api/promotions", promotionRoutes);
app.use("/api/analytics", analyticsRoutes);

// Fallback routes for serverless environments that strip the /api prefix
app.use("/users/login", authLimiter);
app.use("/users/register", authLimiter);
app.use("/users", userRoutes);
app.use("/products", productRoutes);
app.use("/cart", cartRoutes);
app.use("/orders", orderRoutes);
app.use("/reviews", reviewRoutes);
app.use("/wishlist", wishlistRoutes);
app.use("/blob", blobRoutes);
app.use("/promotions", promotionRoutes);
app.use("/analytics", analyticsRoutes);

app.get("/get-user", (req: AppRequest, res: AppResponse) => {
    res.send(req.cookies);
});

app.get("/clear-user", (req: AppRequest, res: AppResponse) => {
    res.clearCookie("username");
    res.clearCookie("userInfo");
    res.clearCookie("rememberMe");
    res.send("All cookies are clear");
});

app.get("/api/health", (req: AppRequest, res: AppResponse) => {
    res.status(200).json({
        status: "ok",
        timestamp: new Date().toISOString(),
    });
});

app.use((err: Error, req: AppRequest, res: AppResponse, next: AppNextFunction) => {
    if (err === invalidCsrfTokenError) {
        return res.status(403).json({ error: "Invalid CSRF token" });
    }
    return next(err);
});

app.use(errorHandler);

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}.`);
    });
}

module.exports = app;
