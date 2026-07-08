import rateLimit from "express-rate-limit";
import type { RequestHandler } from "express";
import { getRouteLimit } from "#src/shared/utils/rateLimit";

export function createRateLimitMiddleware(productionLimit: number): RequestHandler {
    return rateLimit({
        windowMs: 15 * 60 * 1000,
        max: getRouteLimit(productionLimit),
        standardHeaders: true,
        legacyHeaders: false,
        message: "Too many requests, please try again later.",
    });
}
