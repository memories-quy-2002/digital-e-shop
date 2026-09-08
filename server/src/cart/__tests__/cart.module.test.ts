import { describe, expect, it, vi } from "vitest";
import type { MiddlewareConsumer } from "@nestjs/common";
import { CartController } from "../cart.controller";
import { CartModule } from "../cart.module";

describe("CartModule rate limit composition", () => {
    it("applies the existing cart rate limiter to the whole cart controller, including public preview", () => {
        const middlewareConfig = { forRoutes: vi.fn() };
        const consumer = {
            apply: vi.fn(() => middlewareConfig),
        } as unknown as MiddlewareConsumer;

        new CartModule().configure(consumer);

        expect(middlewareConfig.forRoutes).toHaveBeenCalledWith(CartController);
    });
});
