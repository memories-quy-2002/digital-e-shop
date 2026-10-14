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
            "orders/webhooks/payos",
            { path: "shipping/webhooks/ghn", method: 1 },
            { path: "email/webhooks/resend", method: 1 },
            { path: "operations/run", method: 1 },
        ]);
        expect(middlewareConfig.forRoutes).toHaveBeenCalledWith("*");
    });
});
