import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { env } from "#/config/env.config";
import { authService } from "./auth.service";
import { usersRepository } from "#/modules/users/users.repository";

const authzLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10000,
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many requests, please try again later.",
});

const normalizeRole = (role?: string | null) => (role ? String(role).toLowerCase() : "");

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
    authzLimiter(req, res, async (limitErr?: unknown) => {
        if (limitErr) {
            return next(limitErr instanceof Error ? limitErr : new Error(String(limitErr)));
        }

        const { valid, message } = await authService.verifySessionToken(req);
        if (!valid) {
            return res.status(401).json({ msg: message || "Not authenticated" });
        }

        const accessToken = req.cookies.accessToken;
        try {
            const payload = jwt.verify(accessToken, env.jwtSecret) as { id?: string; role?: string; [key: string]: unknown };
            if (!payload.role && payload.id) {
                const user = await usersRepository.findById(payload.id);
                if (user?.role) {
                    payload.role = user.role;
                }
            }

            req.user = payload;
            return next();
        } catch {
            return res.status(403).json({ msg: "Invalid or expired token" });
        }
    });
};

const requireRole = (role: string) => (req: Request, res: Response, next: NextFunction) => {
    const expected = normalizeRole(role);
    const actual = normalizeRole(req.user?.role as string | undefined);
    if (!actual || actual !== expected) {
        return res.status(403).json({ msg: "Forbidden" });
    }

    return next();
};

export const requireAdmin = [requireAuth, requireRole("admin")];

export const requireCustomerOrAdmin = (req: Request, res: Response, next: NextFunction) => {
    const actual = normalizeRole(req.user?.role as string | undefined);
    if (actual === "customer" || actual === "admin") {
        return next();
    }

    return res.status(403).json({ msg: "Forbidden" });
};

export const requireOwnerOrAdmin = (paramKey: string) => (req: Request, res: Response, next: NextFunction) => {
    const actual = normalizeRole(req.user?.role as string | undefined);
    if (actual === "admin") {
        return next();
    }

    const targetId = (req.params as Record<string, unknown>)[paramKey] || (req.body as Record<string, unknown>)[paramKey];
    if (String(req.user?.id) === String(targetId)) {
        return next();
    }

    return res.status(403).json({ msg: "Forbidden" });
};
