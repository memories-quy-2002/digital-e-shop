const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const { verifySessionToken } = require("../services/sessionService");
const User = require("../models/userModel");
import type { AppNextFunction, AppRequest, AppResponse, UserRow } from "../types/domain";

type AuthenticatedRequest = AppRequest & {
    user?: {
        id?: string;
        role?: string;
        [key: string]: unknown;
    };
};

const authzLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10000,
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many requests, please try again later.",
});

const normalizeRole = (role?: string | null) => (role ? String(role).toLowerCase() : "");

const requireAuth = async (req: AuthenticatedRequest, res: AppResponse, next: AppNextFunction) => {
    authzLimiter(req, res, async (limitErr: Error | null) => {
        if (limitErr) {
            return next(limitErr);
        }
        const { valid, message } = await verifySessionToken(req);
        if (!valid) {
            return res.status(401).json({ msg: message || "Not authenticated" });
        }

        const accessToken = req.cookies.accessToken;
        try {
            const payload = jwt.verify(accessToken, process.env.JWT_SECRET_KEY);
            // Older tokens may not include a role. Load it lazily so existing
            // sessions still work after role-based route protection changes.
            if (!payload.role && payload.id) {
                const user = await new Promise((resolve, reject) => {
                    User.getUserById(payload.id, (err: Error | null, results: UserRow[]) => {
                        if (err) return reject(err);
                        resolve(results && results.length > 0 ? results[0] : null);
                    });
                }) as { role?: string } | null;
                if (user?.role) {
                    payload.role = user.role;
                }
            }
            req.user = payload;
            return next();
        } catch (err) {
            console.error("Authentication error:", err);
            return res.status(403).json({ msg: "Invalid or expired token" });
        }
    });
};

const requireRole = (role: string) => (req: AuthenticatedRequest, res: AppResponse, next: AppNextFunction) => {
    const expected = normalizeRole(role);
    const actual = normalizeRole(req.user?.role);
    if (!actual || actual !== expected) {
        return res.status(403).json({ msg: "Forbidden" });
    }
    return next();
};

const requireAdmin = [requireAuth, requireRole("admin")];

const requireCustomerOrAdmin = (req: AuthenticatedRequest, res: AppResponse, next: AppNextFunction) => {
    const actual = normalizeRole(req.user?.role);
    if (actual === "customer" || actual === "admin") {
        return next();
    }
    return res.status(403).json({ msg: "Forbidden" });
};

const requireOwnerOrAdmin = (paramKey: string) => (req: AuthenticatedRequest, res: AppResponse, next: AppNextFunction) => {
    const actual = normalizeRole(req.user?.role);
    if (actual === "admin") {
        return next();
    }
    // Customer routes pass the protected user id through different params, so
    // the caller chooses which field represents ownership.
    const targetId = req.params[paramKey] || req.body[paramKey];
    if (String(req.user?.id) === String(targetId)) {
        return next();
    }
    return res.status(403).json({ msg: "Forbidden" });
};

module.exports = {
    requireAuth,
    requireAdmin,
    requireCustomerOrAdmin,
    requireOwnerOrAdmin,
};
