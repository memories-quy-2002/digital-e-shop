import { describe, expect, it, vi, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import { UnauthorizedException, ForbiddenException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import { AuthGuard } from "../auth.guard";
import { NestConfigService } from "../../config/nest-config.service";
import { authService } from "#src/modules/auth/auth.service";
import { usersRepository } from "#src/modules/users/users.repository";

vi.mock("#src/modules/auth/auth.service", () => ({
    authService: { verifySessionToken: vi.fn() },
}));
vi.mock("#src/modules/users/users.repository", () => ({
    usersRepository: { findById: vi.fn() },
}));
vi.mock("jsonwebtoken", () => ({
    default: { verify: vi.fn() },
}));

function buildContext(req: Record<string, unknown>): ExecutionContext {
    return {
        switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
}

describe("AuthGuard", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("throws UnauthorizedException when the session token is invalid", async () => {
        vi.mocked(authService.verifySessionToken).mockResolvedValue({ valid: false, message: "Missing session or access token" });
        const config = { get: vi.fn().mockReturnValue("secret") } as unknown as NestConfigService;
        const guard = new AuthGuard(config);
        const context = buildContext({ cookies: {} });

        await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    });

    it("throws ForbiddenException when the JWT fails to verify", async () => {
        vi.mocked(authService.verifySessionToken).mockResolvedValue({ valid: true });
        vi.mocked(jwt.verify).mockImplementation(() => {
            throw new Error("invalid signature");
        });
        const config = { get: vi.fn().mockReturnValue("secret") } as unknown as NestConfigService;
        const guard = new AuthGuard(config);
        const context = buildContext({ cookies: { accessToken: "bad-token" } });

        await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it("attaches req.user and returns true on a valid session + token", async () => {
        vi.mocked(authService.verifySessionToken).mockResolvedValue({ valid: true });
        vi.mocked(jwt.verify).mockReturnValue({ id: "1", role: "customer" } as never);
        const config = { get: vi.fn().mockReturnValue("secret") } as unknown as NestConfigService;
        const guard = new AuthGuard(config);
        const req: Record<string, unknown> = { cookies: { accessToken: "good-token" } };
        const context = buildContext(req);

        await expect(guard.canActivate(context)).resolves.toBe(true);
        expect(req.user).toEqual({ id: "1", role: "customer" });
    });

    it("backfills the role from usersRepository when the JWT payload has no role", async () => {
        vi.mocked(authService.verifySessionToken).mockResolvedValue({ valid: true });
        vi.mocked(jwt.verify).mockReturnValue({ id: "1" } as never);
        vi.mocked(usersRepository.findById).mockResolvedValue({ role: "admin" } as never);
        const config = { get: vi.fn().mockReturnValue("secret") } as unknown as NestConfigService;
        const guard = new AuthGuard(config);
        const req: Record<string, unknown> = { cookies: { accessToken: "good-token" } };
        const context = buildContext(req);

        await expect(guard.canActivate(context)).resolves.toBe(true);
        expect(req.user).toEqual({ id: "1", role: "admin" });
    });
});
