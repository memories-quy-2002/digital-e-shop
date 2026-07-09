import { describe, expect, it, vi, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import { UnauthorizedException, ForbiddenException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import { AuthGuard } from "../auth.guard";
import type { NestConfigService } from "../../config/nest-config.service";
import type { NestAuthService } from "../../auth/auth.service";
import type { UsersRepository } from "../../users/users.repository";

vi.mock("jsonwebtoken", () => ({
    default: { verify: vi.fn() },
}));

function buildContext(req: Record<string, unknown>): ExecutionContext {
    return {
        switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
}

function buildGuard() {
    const config = { get: vi.fn().mockReturnValue("secret") } as unknown as NestConfigService;
    const authService = { verifySessionToken: vi.fn() } as unknown as NestAuthService;
    const usersRepository = { findById: vi.fn() } as unknown as UsersRepository;
    return { guard: new AuthGuard(config, authService, usersRepository), authService, usersRepository };
}

describe("AuthGuard", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("throws UnauthorizedException with the existing { msg } shape when the session token is invalid", async () => {
        const { guard, authService } = buildGuard();
        vi.mocked(authService.verifySessionToken).mockResolvedValue({ valid: false, message: "Missing session or access token" });
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
        const { guard, authService } = buildGuard();
        vi.mocked(authService.verifySessionToken).mockResolvedValue({ valid: true });
        vi.mocked(jwt.verify).mockImplementation(() => {
            throw new Error("invalid signature");
        });
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
        const { guard, authService } = buildGuard();
        vi.mocked(authService.verifySessionToken).mockResolvedValue({ valid: true });
        vi.mocked(jwt.verify).mockReturnValue({ id: "1", role: "customer" } as never);
        const req: Record<string, unknown> = { cookies: { accessToken: "good-token" } };
        const context = buildContext(req);

        await expect(guard.canActivate(context)).resolves.toBe(true);
        expect(req.user).toEqual({ id: "1", role: "customer" });
    });

    it("backfills the role from usersRepository when the JWT payload has no role", async () => {
        const { guard, authService, usersRepository } = buildGuard();
        vi.mocked(authService.verifySessionToken).mockResolvedValue({ valid: true });
        vi.mocked(jwt.verify).mockReturnValue({ id: "1" } as never);
        vi.mocked(usersRepository.findById).mockResolvedValue({ role: "admin" } as never);
        const req: Record<string, unknown> = { cookies: { accessToken: "good-token" } };
        const context = buildContext(req);

        await expect(guard.canActivate(context)).resolves.toBe(true);
        expect(req.user).toEqual({ id: "1", role: "admin" });
    });
});
