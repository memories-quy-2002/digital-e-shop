import type { NextFunction, Request, Response } from "express";
import { getRedisClient } from "#src/core/redis";

const CACHE_TTL_SECONDS = 300;
const CACHE_PREFIX = "cache:";

function shouldCache(method: string, path: string): boolean {
    if (method !== "GET") return false;
    if (path.includes("/api/products/images/")) return false;
    return true;
}

export function cacheResponse(ttlSeconds: number = CACHE_TTL_SECONDS) {
    return async (req: Request, res: Response, next: NextFunction) => {
        if (!shouldCache(req.method, req.path)) {
            return next();
        }

        const redis = await getRedisClient();
        if (!redis) return next();

        const cacheKey = `${CACHE_PREFIX}${req.originalUrl}`;

        try {
            const cached = await redis.get(cacheKey);
            if (cached) {
                res.setHeader("X-Cache", "HIT");
                return res.status(200).json(JSON.parse(cached));
            }

            const originalJson = res.json.bind(res);
            res.json = function (body: unknown) {
                if (res.statusCode === 200 && body && typeof body === "object") {
                    redis.set(cacheKey, JSON.stringify(body), "EX", ttlSeconds).catch(() => {});
                    res.setHeader("X-Cache", "MISS");
                }
                return originalJson(body);
            };

            next();
        } catch {
            next();
        }
    };
}

export async function invalidateByPattern(pattern: string): Promise<void> {
    const redis = await getRedisClient();
    if (!redis) return;

    try {
        const fullPattern = `${CACHE_PREFIX}${pattern}`;
        const stream = redis.scanStream({ match: fullPattern, count: 100 });

        const keys: string[] = [];
        for await (const resultKeys of stream) {
            keys.push(...(resultKeys as string[]));
        }

        if (keys.length > 0) {
            await redis.del(...keys);
        }
    } catch {
        // silently ignore invalidation errors
    }
}
