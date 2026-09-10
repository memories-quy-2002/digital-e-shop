import { describe, expect, it, vi } from "vitest";
import type { MiddlewareConsumer } from "@nestjs/common";
import { AuthModule } from "./auth.module";

describe("AuthModule CSRF middleware", () => {
    it("excludes the global-prefix-free auth endpoints from CSRF protection", () => {
        const excludedRoutes: unknown[] = [];
        const middlewareConfig = {
            exclude: vi.fn((...routes: unknown[]) => {
                excludedRoutes.push(...routes);
                return middlewareConfig;
            }),
            forRoutes: vi.fn(),
        };
        const consumer = {
            apply: vi.fn(() => middlewareConfig),
        } as unknown as MiddlewareConsumer;

        new AuthModule().configure(consumer);

        expect(excludedRoutes).toEqual([
            "users/login",
            "users/register",
            "users/refresh",
            "orders/webhooks/stripe",
            "orders/webhooks/payos",
        ]);
        expect(middlewareConfig.forRoutes).toHaveBeenCalledWith("*");
    });
});
