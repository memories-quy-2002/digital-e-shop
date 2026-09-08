import Redis from "ioredis";

const FIXED_WINDOW_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
return { current, ttl }
`;

export type RateLimitResult = {
    totalHits: number;
    resetMs: number;
    allowed: boolean;
};

export interface RedisRateLimitClient {
    eval(script: string, numberOfKeys: number, ...args: string[]): Promise<unknown>;
}

export class RedisFixedWindowLimiter {
    private readonly redis: RedisRateLimitClient;

    constructor(redisUrl: string, redisClient?: RedisRateLimitClient) {
        this.redis = redisClient ?? new Redis(redisUrl);
    }

    async consume(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
        if (!key.trim()) {
            throw new Error("Rate limit key is required");
        }
        if (!Number.isFinite(limit) || limit < 1) {
            throw new Error("Rate limit must be a positive number");
        }
        if (!Number.isFinite(windowMs) || windowMs < 1) {
            throw new Error("Rate limit window must be a positive number");
        }

        const redisKey = `digital-e:rl:${key}`;
        const result = await this.redis.eval(FIXED_WINDOW_SCRIPT, 1, redisKey, String(windowMs));
        const [rawTotalHits, rawResetMs] = Array.isArray(result) ? result : [];
        const totalHits = Number(rawTotalHits);
        const resetMs = Math.max(Number(rawResetMs), 0);

        if (!Number.isFinite(totalHits)) {
            throw new Error("Redis returned an invalid rate limit count");
        }

        return {
            totalHits,
            resetMs,
            allowed: totalHits <= limit,
        };
    }
}
