import type { Redis as RedisType } from "ioredis";
import { env } from "#src/config/env.config";
import { logger } from "#src/shared/utils/logger";

let client: RedisType | null = null;

export async function getRedisClient(): Promise<RedisType | null> {
    if (client) return client;

    if (!env.redisUrl) return null;

    try {
        const RedisModule = await import("ioredis");
        const Redis = (RedisModule.default || RedisModule) as unknown as new (...args: unknown[]) => RedisType;

        client = new Redis(env.redisUrl, {
            maxRetriesPerRequest: 3,
            retryStrategy(times: number) {
                if (times > 3) {
                    logger.warn("Redis connection failed after 3 retries, disabling cache");
                    return null;
                }
                return Math.min(times * 200, 2000);
            },
            lazyConnect: true,
        });

        client.on("error", (err: Error) => {
            logger.warn({ err: err.message }, "Redis client error");
        });

        client.on("connect", () => {
            logger.info("Redis connected");
        });

        await client.connect();
        return client;
    } catch (err) {
        logger.warn({ err: (err as Error).message }, "Redis not available, caching disabled");
        client = null;
        return null;
    }
}

export async function closeRedis(): Promise<void> {
    if (client) {
        await client.quit();
        client = null;
    }
}
