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

    it("throws UnauthorizedException with the existing { msg } shape when the session token is invalid", async () => {
        vi.mocked(authService.verifySessionToken).mockResolvedValue({ valid: false, message: "Missing session or access token" });
        const config = { get: vi.fn().mockReturnValue("secret") } as unknown as NestConfigService;
        const guard = new AuthGuard(config);
        const context = buildContext({ cookies: {} });

        try {
            await guard.canActivate(context);
            expect.unreachable("expected canActivate to throw");
        } catch (err) {
            expect(err).toBeInstanceOf(UnauthorizedException);
            expect((err as UnauthorizedException).getResponse()).toEqual({ msg: "Missing session or access token" });
        }
    });

    it("throws ForbiddenException with the existing { msg } shape when the JWT fails to verify", async () => {
        vi.mocked(authService.verifySessionToken).mockResolvedValue({ valid: true });
        vi.mocked(jwt.verify).mockImplementation(() => {
            throw new Error("invalid signature");
        });
        const config = { get: vi.fn().mockReturnValue("secret") } as unknown as NestConfigService;
        const guard = new AuthGuard(config);
        const context = buildContext({ cookies: { accessToken: "bad-token" } });

        try {
            await guard.canActivate(context);
            expect.unreachable("expected canActivate to throw");
        } catch (err) {
            expect(err).toBeInstanceOf(ForbiddenException);
            expect((err as ForbiddenException).getResponse()).toEqual({ msg: "Invalid or expired token" });
        }
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
