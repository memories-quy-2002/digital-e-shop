import express, { type ErrorRequestHandler, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { doubleCsrf } from "csrf-csrf";
import passport from "#src/modules/auth/auth.passport";
import { env, isProduction } from "#src/config/env.config";
import { allowedOrigins, defaultClientOrigin } from "#src/config/cors.config";
import { errorHandler } from "#src/core/middlewares/errorHandler";
import { requestLogger } from "#src/core/middlewares/requestLogger";
import { getRouteLimit } from "#src/shared/utils/rateLimit";

import authRoutes from "#src/modules/auth/auth.routes";
import usersRoutes from "#src/modules/users/users.routes";
import addressesRoutes from "#src/modules/addresses/addresses.routes";
import notificationsRoutes from "#src/modules/notifications/notifications.routes";
import productsRoutes from "#src/modules/products/products.routes";
import inventoryRoutes from "#src/modules/inventory/inventory.routes";
import cartRoutes from "#src/modules/cart/cart.routes";
import ordersRoutes from "#src/modules/orders/orders.routes";
import reviewsRoutes from "#src/modules/reviews/reviews.routes";
import wishlistRoutes from "#src/modules/wishlist/wishlist.routes";
import blobRoutes from "#src/modules/blob/blob.routes";
import promotionsRoutes from "#src/modules/promotions/promotions.routes";
import analyticsRoutes from "#src/modules/analytics/analytics.routes";

const app = express();

app.use((req: Request, res: Response, next: NextFunction) => {
    res.header("Access-Control-Allow-Origin", defaultClientOrigin);
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type,Authorization,X-CSRF-Token");

    if (req.method === "OPTIONS") {
        return res.sendStatus(200);
    }

    return next();
});

app.use(
    cors({
        origin: (origin, callback) => {
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

const { doubleCsrfProtection, generateCsrfToken, invalidCsrfTokenError } = doubleCsrf({
    getSecret: () => env.csrfSecret,
    getSessionIdentifier: (req: Request) => String(req.cookies?.session || req.ip || "anonymous"),
    cookieName: "csrfToken",
    cookieOptions: {
        httpOnly: false,
        secure: isProduction,
        sameSite: isProduction ? "none" : "lax",
        path: "/",
    },
    size: 64,
    ignoredMethods: ["GET", "HEAD", "OPTIONS"],
    getCsrfTokenFromRequest: (req: Request) => String(req.headers["x-csrf-token"] || ""),
    skipCsrfProtection: (req: Request) =>
        req.path === "/api/users/login" ||
        req.path === "/api/users/register" ||
        req.path === "/api/users/refresh" ||
        req.path === "/users/login" ||
        req.path === "/users/register" ||
        req.path === "/users/refresh",
});

const csrfProtection: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
    doubleCsrfProtection(req, res, next);
};

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
app.use(passport.initialize());

app.get("/api/csrf", (req: Request, res: Response) => {
    res.status(200).json({ csrfToken: generateCsrfToken(req, res) });
});
app.get("/csrf", (req: Request, res: Response) => {
    res.status(200).json({ csrfToken: generateCsrfToken(req, res) });
});

app.use(csrfProtection);
app.use(requestLogger);

app.use("/api/users/login", authLimiter);
app.use("/api/users/register", authLimiter);
app.use("/users/login", authLimiter);
app.use("/users/register", authLimiter);

app.use("/api/users", authRoutes, usersRoutes, addressesRoutes, notificationsRoutes);
app.use("/api/user", authRoutes, usersRoutes, addressesRoutes, notificationsRoutes);
app.use("/api/products/admin", inventoryRoutes);
app.use("/api/products", productsRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/orders", ordersRoutes);
app.use("/api/reviews", reviewsRoutes);
app.use("/api/wishlist", wishlistRoutes);
app.use("/api/blob", blobRoutes);
app.use("/api/promotions", promotionsRoutes);
app.use("/api/analytics", analyticsRoutes);

app.get("/", (_req: Request, res: Response) => {
    res.status(200).json({
        status: "ok",
        service: "digital-e-server",
        timestamp: new Date().toISOString(),
    });
});

app.get("/api/health", (_req: Request, res: Response) => {
    res.status(200).json({
        status: "ok",
        timestamp: new Date().toISOString(),
    });
});

const csrfErrorHandler: ErrorRequestHandler = (
    err: Error,
    _req: Request,
    res: Response,
    next: NextFunction,
) => {
    if (err === invalidCsrfTokenError) {
        return res.status(403).json({ error: "Invalid CSRF token" });
    }

    return next(err);
};

app.use(csrfErrorHandler);

app.use(errorHandler);

export default app;

