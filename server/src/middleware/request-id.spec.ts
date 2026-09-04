import { describe, expect, it, vi } from "vitest";
import { requestIdMiddleware } from "./request-id.middleware";

describe("requestIdMiddleware", () => {
    it("reuses a safe incoming request id and exposes it on the response", () => {
        const req: { headers: Record<string, string>; requestId?: string } = { headers: { "x-request-id": "checkout-123" } };
        const res: { setHeader: ReturnType<typeof vi.fn> } = { setHeader: vi.fn() };
        const next = vi.fn();

        requestIdMiddleware(req as never, res as never, next);

        expect(req.requestId).toBe("checkout-123");
        expect(res.setHeader).toHaveBeenCalledWith("X-Request-Id", "checkout-123");
        expect(next).toHaveBeenCalledOnce();
    });

    it("replaces an unsafe incoming request id with a generated id", () => {
        const req: { headers: Record<string, string>; requestId?: string } = { headers: { "x-request-id": "bad id\nwith-header-injection" } };
        const res: { setHeader: ReturnType<typeof vi.fn> } = { setHeader: vi.fn() };
        const next = vi.fn();

        requestIdMiddleware(req as never, res as never, next);

        expect(req.requestId).toMatch(/^[0-9a-f-]{36}$/);
        expect(req.requestId).not.toContain("bad id");
        expect(res.setHeader).toHaveBeenCalledWith("X-Request-Id", req.requestId);
        expect(next).toHaveBeenCalledOnce();
    });
});
