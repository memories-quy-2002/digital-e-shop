import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import { createAttemptRateLimitKey } from "../rate-limit.middleware";
import {
    RedisFixedWindowLimiter,
    type RedisRateLimitClient,
} from "../../shared/rate-limit/redis-rate-limit";

const { rateLimitMock, redisLimiterMock } = vi.hoisted(() => ({
    rateLimitMock: vi.fn((options: unknown) => {
        const handler = vi.fn();
        Object.assign(handler, { options });
        return handler;
    }),
    redisLimiterMock: vi.fn(function RedisLimiterMock() {
        return { consume: vi.fn() };
    }),
}));

vi.mock("express-rate-limit", () => ({
    default: rateLimitMock,
}));

class FakeRedis implements RedisRateLimitClient {
    readonly scripts: string[] = [];
    private readonly entries = new Map<string, { hits: number; expiresAt: number }>();
    private now = 0;

    async eval(script: string, _numberOfKeys: number, key: string, windowMs: string): Promise<[number, number]> {
        this.scripts.push(script);

        const duration = Number(windowMs);
        const existing = this.entries.get(key);
        if (!existing || existing.expiresAt <= this.now) {
            const entry = { hits: 1, expiresAt: this.now + duration };
            this.entries.set(key, entry);
            return [entry.hits, duration];
        }

        existing.hits += 1;
        return [existing.hits, existing.expiresAt - this.now];
    }

    advance(ms: number) {
        this.now += ms;
    }
}

describe("RedisFixedWindowLimiter", () => {
    it("increments atomically, sets the first expiry, and rejects hits over the limit", async () => {
        const redis = new FakeRedis();
        const limiter = new RedisFixedWindowLimiter("redis://test", redis);

        await expect(limiter.consume("auth:127.0.0.1", 2, 1_000)).resolves.toEqual({
            totalHits: 1,
            resetMs: 1_000,
            allowed: true,
        });
        await expect(limiter.consume("auth:127.0.0.1", 2, 1_000)).resolves.toEqual({
            totalHits: 2,
            resetMs: 1_000,
            allowed: true,
        });
        await expect(limiter.consume("auth:127.0.0.1", 2, 1_000)).resolves.toEqual({
            totalHits: 3,
            resetMs: 1_000,
            allowed: false,
        });

        expect(redis.scripts[0]).toContain("local current = redis.call('INCR', KEYS[1])");
        expect(redis.scripts[0]).toContain("redis.call('PEXPIRE', KEYS[1], ARGV[1])");
        expect(redis.scripts[0]).toContain("local ttl = redis.call('PTTL', KEYS[1])");
    });

    it("starts a new window after the Redis key expires", async () => {
        const redis = new FakeRedis();
        const limiter = new RedisFixedWindowLimiter("redis://test", redis);

        await limiter.consume("payments:user-42", 1, 500);
        await expect(limiter.consume("payments:user-42", 1, 500)).resolves.toMatchObject({
            totalHits: 2,
            allowed: false,
        });

        redis.advance(500);

        await expect(limiter.consume("payments:user-42", 1, 500)).resolves.toEqual({
            totalHits: 1,
            resetMs: 500,
            allowed: true,
        });
    });
});

describe("createRateLimitMiddleware", () => {
    beforeEach(() => {
        rateLimitMock.mockClear();
        redisLimiterMock.mockClear();
    });

    async function loadMiddleware(nodeEnv: "development" | "test" | "production", redisUrl = "") {
        vi.resetModules();
        vi.doMock("#src/config/env.config", () => ({
            env: { nodeEnv, redisUrl },
            isProduction: nodeEnv === "production",
        }));
        vi.doMock("#src/shared/rate-limit/redis-rate-limit", () => ({
            RedisFixedWindowLimiter: redisLimiterMock,
        }));
        return import("../rate-limit.middleware");
    }

    it("keeps the local/test memory limiter ceiling in development", async () => {
        const { createRateLimitMiddleware } = await loadMiddleware("development");

        const middleware = createRateLimitMiddleware(5) as typeof rateLimitMock;

        expect(middleware).toBeDefined();
        expect(redisLimiterMock).not.toHaveBeenCalled();
        expect(rateLimitMock).toHaveBeenCalledWith(expect.objectContaining({
            max: 10_000,
            standardHeaders: true,
            legacyHeaders: false,
        }));
    });

    it("uses configured route ceilings in test mode for capacity testing", async () => {
        const { createRateLimitMiddleware } = await loadMiddleware("test");

        createRateLimitMiddleware(100_000);

        expect(rateLimitMock).toHaveBeenCalledWith(expect.objectContaining({
            max: 100_000,
            standardHeaders: true,
            legacyHeaders: false,
        }));
    });

    it("uses the configured production ceiling for the memory fallback when Redis is absent", async () => {
        const { createRateLimitMiddleware } = await loadMiddleware("production");

        createRateLimitMiddleware(5);

        expect(redisLimiterMock).not.toHaveBeenCalled();
        expect(rateLimitMock).toHaveBeenCalledWith(expect.objectContaining({
            max: 5,
            standardHeaders: true,
            legacyHeaders: false,
        }));
    });

    it.each([
        { nodeEnv: "development", expectedLimit: 10_000 },
        { nodeEnv: "production", expectedLimit: 5 },
    ] as const)("selects the Redis store in $nodeEnv when Redis is configured", async ({ nodeEnv, expectedLimit }) => {
        const { createRateLimitMiddleware } = await loadMiddleware(nodeEnv, "redis://configured");

        createRateLimitMiddleware(5);

        expect(redisLimiterMock).toHaveBeenCalledWith("redis://configured");
        expect(rateLimitMock).toHaveBeenCalledWith(expect.objectContaining({
            max: expectedLimit,
            store: expect.objectContaining({ limit: expectedLimit, windowMs: 15 * 60 * 1000 }),
            keyGenerator: expect.any(Function),
        }));
    });
});

describe("attempt-scoped rate limit keys", () => {
    afterEach(() => vi.restoreAllMocks());

    it("separates owners, attempts, and operation classes without including raw credentials", () => {
        vi.spyOn(jwt, "verify").mockImplementation((token) => ({ id: token === "secret-token" || token === "rotated-token" ? "owner-1" : "owner-2" }) as never);
        const base = { path: "/orders/payment-attempts/attempt-1/status", params: {}, cookies: { accessToken: "secret-token" }, ip: "127.0.0.1", socket: {} } as never;
        const ownerKey = createAttemptRateLimitKey(base, "status");
        const sameOwnerRotatedToken = createAttemptRateLimitKey({ ...base, cookies: { accessToken: "rotated-token" } } as never, "status");
        const differentOwner = createAttemptRateLimitKey({ ...base, cookies: { accessToken: "other-token" } } as never, "status");
        const differentPolicy = createAttemptRateLimitKey(base, "mutation");
        expect(ownerKey).not.toContain("secret-token");
        expect(ownerKey).toBe(sameOwnerRotatedToken);
        expect(ownerKey).not.toBe(differentOwner);
        expect(ownerKey).not.toBe(differentPolicy);
    });

    it("uses the verified account before any guest cookie on an authenticated route", () => {
        vi.spyOn(jwt, "verify").mockReturnValue({ id: "owner-1" } as never);
        const request = { path: "/orders/payment-attempts/attempt-1/status", params: {}, cookies: { accessToken: "valid-token", digitalEGuestCartId: "guest-1" }, ip: "127.0.0.1", socket: {} } as never;
        const key = createAttemptRateLimitKey(request, "status");
        const rotatedGuestCookie = createAttemptRateLimitKey({ ...request, cookies: { accessToken: "valid-token", digitalEGuestCartId: "guest-2" } } as never, "status");

        expect(key).toBe(rotatedGuestCookie);
    });

    it("does not trust forged JWT claims and hashes the rejected token fallback", () => {
        vi.spyOn(jwt, "verify").mockImplementation((token) => {
            if (token === "forged-token") throw new Error("invalid signature");
            return { id: "victim-owner" } as never;
        });
        const validOwnerKey = createAttemptRateLimitKey({ path: "/orders/payment-attempts/attempt-1/status", params: {}, cookies: { accessToken: "valid-token" }, ip: "127.0.0.1", socket: {} } as never, "status");
        const forgedKey = createAttemptRateLimitKey({ path: "/orders/payment-attempts/attempt-1/status", params: {}, cookies: { accessToken: "forged-token", digitalEGuestCartId: "ignored-guest" }, ip: "127.0.0.1", socket: {} } as never, "status");

        expect(forgedKey).not.toBe(validOwnerKey);
        expect(forgedKey).not.toContain("forged-token");
        expect(forgedKey).not.toContain("victim-owner");
    });

    it("uses a guest cookie plus the attempt ID instead of allowing the attempt ID alone", () => {
        const request = { path: "/orders/guest/payment-attempts/attempt-1/status", params: { attemptId: "attempt-1" }, cookies: { digitalEGuestCartId: "guest-1" }, ip: "127.0.0.1", socket: {} } as never;
        const key = createAttemptRateLimitKey(request, "status");
        const otherGuest = createAttemptRateLimitKey({ ...request, cookies: { digitalEGuestCartId: "guest-2" } } as never, "status");
        expect(key).not.toBe(otherGuest);
    });
});
