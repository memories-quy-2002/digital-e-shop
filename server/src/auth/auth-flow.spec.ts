import { beforeEach, describe, expect, it, vi } from "vitest";
import { NestAuthController } from "./auth.controller";
import type { NestAuthService } from "./auth.service";

function mockResponse() {
    const response = {
        status: vi.fn(),
        json: vi.fn(),
        cookie: vi.fn(),
        clearCookie: vi.fn(),
    };
    response.status.mockReturnValue(response);
    response.json.mockReturnValue(response);
    return response;
}

describe("authentication flow response contract", () => {
    let authService: { verifySessionToken: ReturnType<typeof vi.fn>; refreshToken: ReturnType<typeof vi.fn> };
    let controller: NestAuthController;

    beforeEach(() => {
        authService = {
            verifySessionToken: vi.fn(),
            refreshToken: vi.fn(),
        };
        controller = new NestAuthController(authService as unknown as NestAuthService);
    });

    it("returns canonical success metadata when the customer session is valid", async () => {
        authService.verifySessionToken.mockResolvedValue({ valid: true });
        const response = mockResponse();

        await controller.checkSession({ requestId: "auth-session-1" } as never, response as never);

        expect(response.json).toHaveBeenCalledWith({
            sessionActive: true,
            msg: "Session is valid",
            success: true,
            requestId: "auth-session-1",
        });
    });

    it("returns canonical error metadata when refresh token is missing", async () => {
        const response = mockResponse();

        await controller.userRefreshToken({ requestId: "auth-refresh-1", cookies: {} } as never, response as never);

        expect(response.status).toHaveBeenCalledWith(401);
        expect(response.json).toHaveBeenCalledWith({
            success: false,
            error: "No refresh token",
            msg: "No refresh token",
            code: "UNAUTHORIZED",
            requestId: "auth-refresh-1",
        });
    });
});
