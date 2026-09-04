import { beforeEach, describe, expect, it, vi } from "vitest";
import { firstValueFrom, of } from "rxjs";

const { logger } = vi.hoisted(() => ({
    logger: { info: vi.fn() },
}));

vi.mock("#src/shared/utils/logger", () => ({ logger }));

import { RequestLoggerInterceptor } from "./request-logger.interceptor";

describe("RequestLoggerInterceptor", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("adds success metadata and writes a correlated structured access log", async () => {
        let finish: (() => void) | undefined;
        const req = {
            method: "GET",
            originalUrl: "/api/products",
            url: "/api/products",
            requestId: "req-logger-1",
        };
        const res = {
            statusCode: 200,
            headersSent: false,
            setHeader: vi.fn(),
            on: vi.fn((event: string, callback: () => void) => {
                if (event === "finish") finish = callback;
            }),
        };
        const context = {
            switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
        } as never;
        const next = { handle: () => of({ products: [] }) } as never;

        const result = await firstValueFrom(new RequestLoggerInterceptor().intercept(context, next));

        expect(result).toEqual({
            products: [],
            success: true,
            requestId: "req-logger-1",
        });
        expect(res.setHeader).toHaveBeenCalledWith("X-Request-Id", "req-logger-1");

        finish?.();

        expect(logger.info).toHaveBeenCalledWith(
            expect.objectContaining({
                method: "GET",
                url: "/api/products",
                statusCode: 200,
                requestId: "req-logger-1",
            }),
            "http request",
        );
    });
});
