import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { IncrementResponse, Store } from "express-rate-limit";
import type { Request, RequestHandler } from "express";
import { env, isProduction } from "#src/config/env.config";
import { getRouteLimit } from "#src/shared/utils/rateLimit";
import { RedisFixedWindowLimiter } from "#src/shared/rate-limit/redis-rate-limit";

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const redisLimiters = new Map<string, RedisFixedWindowLimiter>();

class RedisRateLimitStore implements Store {
    readonly windowMs = RATE_LIMIT_WINDOW_MS;

    constructor(
        private readonly limiter: RedisFixedWindowLimiter,
        private readonly limit: number,
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
    if (!isProduction || !env.redisUrl) return null;
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

export function createRateLimitMiddleware(productionLimit: number): RequestHandler {
    const redisLimiter = getRedisLimiter();
    return rateLimit({
        windowMs: RATE_LIMIT_WINDOW_MS,
        max: getRouteLimit(productionLimit),
        ...(redisLimiter
            ? {
                store: new RedisRateLimitStore(redisLimiter, productionLimit),
                keyGenerator: getRedisKey,
            }
            : {}),
        standardHeaders: true,
        legacyHeaders: false,
        message: "Too many requests, please try again later.",
    });
}
