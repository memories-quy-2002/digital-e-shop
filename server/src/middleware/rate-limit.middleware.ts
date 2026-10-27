import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { IncrementResponse, Store } from "express-rate-limit";
import type { Request, RequestHandler } from "express";
import { createHash } from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "#src/config/env.config";
import { getRouteLimit } from "#src/shared/utils/rate-limit";
import { RedisFixedWindowLimiter } from "#src/shared/rate-limit/redis-rate-limit";

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const redisLimiters = new Map<string, RedisFixedWindowLimiter>();

class RedisRateLimitStore implements Store {
    constructor(
        private readonly limiter: RedisFixedWindowLimiter,
        private readonly limit: number,
        readonly windowMs: number,
    ) {}

    async increment(key: string): Promise<IncrementResponse> {
        const result = await this.limiter.consume(key, this.limit, this.windowMs);
        return {
            totalHits: result.totalHits,
            resetTime: new Date(Date.now() + result.resetMs),
        };
    }

    async decrement(): Promise<void> {}

    async resetKey(): Promise<void> {}
}

const getRedisLimiter = () => {
    if (!env.redisUrl) return null;
    let limiter = redisLimiters.get(env.redisUrl);
    if (!limiter) {
        limiter = new RedisFixedWindowLimiter(env.redisUrl);
        redisLimiters.set(env.redisUrl, limiter);
    }
    return limiter;
};

const getRouteGroup = (request: Request) => {
    const route = request.baseUrl || request.route?.path || request.path || "global";
    return route.replace(/^\/+|\/+$/g, "").replace(/[^a-zA-Z0-9._:-]+/g, ":") || "global";
};

const getRedisKey = (request: Request) => {
    const userId = (request.user as { id?: string; uid?: string } | undefined)?.id
        || (request.user as { id?: string; uid?: string } | undefined)?.uid;
    const identity = userId || ipKeyGenerator(request.ip || request.socket.remoteAddress || "unknown");
    return `${getRouteGroup(request)}:${identity}`;
};

export type ScopedRateLimitPolicy = { name: string; limit: number; windowMs: number };

export function createAttemptRateLimitKey(request: Request, policyName: string): string {
    const pathSegments = request.path.split("/").filter(Boolean);
    const attemptIndex = pathSegments.indexOf("payment-attempts");
    const attemptId = String(request.params?.attemptId || (attemptIndex >= 0 ? pathSegments[attemptIndex + 1] : "unknown"));
    const guestCartId = request.cookies?.digitalEGuestCartId;
    const accessToken = request.cookies?.accessToken;
    let authenticatedOwnerId = "";
    if (typeof accessToken === "string") {
        try {
            const payload = jwt.verify(accessToken, env.jwtSecret);
            if (typeof payload !== "string") authenticatedOwnerId = String(payload.id || payload.sub || "");
        } catch {
            authenticatedOwnerId = "";
        }
    }
    const isGuestRoute = request.path.split("/").includes("guest");
    let identity: string;
    if (authenticatedOwnerId) identity = `user:${authenticatedOwnerId}`;
    else if (isGuestRoute && typeof guestCartId === "string" && guestCartId) identity = `guest:${guestCartId}`;
    else if (typeof accessToken === "string" && accessToken) identity = `session:${accessToken}`;
    else identity = `ip:${ipKeyGenerator(request.ip || request.socket.remoteAddress || "unknown")}`;
    const ownerHash = createHash("sha256").update(identity).digest("hex");
    return `orders:payos:${policyName}:${ownerHash}:${attemptId}`;
}

export function createRateLimitMiddleware(productionLimit: number, scopedPolicy?: ScopedRateLimitPolicy): RequestHandler {
    const redisLimiter = getRedisLimiter();
    const windowMs = scopedPolicy?.windowMs || RATE_LIMIT_WINDOW_MS;
    const limit = scopedPolicy?.limit || getRouteLimit(productionLimit);
    return rateLimit({
        windowMs,
        max: scopedPolicy ? limit : getRouteLimit(productionLimit),
        ...(redisLimiter
            ? {
                store: new RedisRateLimitStore(redisLimiter, limit, windowMs),
                keyGenerator: scopedPolicy ? (request) => createAttemptRateLimitKey(request, scopedPolicy.name) : getRedisKey,
            }
            : {}),
        ...(scopedPolicy && !redisLimiter ? { keyGenerator: (request) => createAttemptRateLimitKey(request, scopedPolicy.name) } : {}),
        standardHeaders: true,
        legacyHeaders: false,
        message: "Too many requests, please try again later.",
    });
}
