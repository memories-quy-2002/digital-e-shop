import { describe, expect, it, vi, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import { UnauthorizedException, ForbiddenException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import { AuthGuard } from "../auth.guard";
import type { NestConfigService } from "../../config/nest-config.service";
import type { NestAuthService } from "../../auth/auth.service";
import type { UsersRepository } from "../../users/users.repository";
import type { AuthRepository } from "../../auth/auth.repository";

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
    const authRepository = { getActiveSessionById: vi.fn() } as unknown as AuthRepository;
    return { guard: new AuthGuard(config, authService, usersRepository, authRepository), authService, usersRepository, authRepository };
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
        const { guard, authService, authRepository, usersRepository } = buildGuard();
        vi.mocked(authService.verifySessionToken).mockResolvedValue({ valid: true });
        vi.mocked(jwt.verify).mockReturnValue({ id: "1", role: "customer", sid: 42 } as never);
        vi.mocked(authRepository.getActiveSessionById).mockResolvedValue({ user_id: "1" } as never);
        vi.mocked(usersRepository.findById).mockResolvedValue({ id: "1", role: "Admin", status: "Active" } as never);
        const req: Record<string, unknown> = { cookies: { accessToken: "good-token", session: "42" } };
        const context = buildContext(req);

        await expect(guard.canActivate(context)).resolves.toBe(true);
        expect(req.user).toEqual({ id: "1", role: "Admin", sid: 42 });
    });

    it("rejects an access token whose sid does not match the session cookie", async () => {
        const { guard, authService } = buildGuard();
        vi.mocked(authService.verifySessionToken).mockResolvedValue({ valid: true });
        vi.mocked(jwt.verify).mockReturnValue({ id: "1", sid: 42 } as never);
        const req: Record<string, unknown> = { cookies: { accessToken: "good-token", session: "43" } };
        const context = buildContext(req);

        await expect(guard.canActivate(context)).rejects.toMatchObject({
            response: { msg: "Session mismatch" },
            status: 401,
        });
    });

    it("rejects an access token when its database session is no longer active", async () => {
        const { guard, authService, authRepository } = buildGuard();
        vi.mocked(authService.verifySessionToken).mockResolvedValue({ valid: true });
        vi.mocked(jwt.verify).mockReturnValue({ id: "1", sid: 42 } as never);
        vi.mocked(authRepository.getActiveSessionById).mockResolvedValue(null);
        const req: Record<string, unknown> = { cookies: { accessToken: "good-token", session: "42" } };
        const context = buildContext(req);

        await expect(guard.canActivate(context)).rejects.toMatchObject({
            response: { msg: "Session invalid or expired" },
            status: 401,
        });
    });

    it("loads the live user role and rejects suspended users", async () => {
        const { guard, authService, authRepository, usersRepository } = buildGuard();
        vi.mocked(authService.verifySessionToken).mockResolvedValue({ valid: true });
        vi.mocked(jwt.verify).mockReturnValue({ id: "1", role: "Admin", sid: 42 } as never);
        vi.mocked(authRepository.getActiveSessionById).mockResolvedValue({ user_id: "1" } as never);
        vi.mocked(usersRepository.findById).mockResolvedValue({ id: "1", role: "Customer", status: "Suspended" } as never);
        const req: Record<string, unknown> = { cookies: { accessToken: "good-token", session: "42" } };
        const context = buildContext(req);

        await expect(guard.canActivate(context)).rejects.toMatchObject({
            response: { msg: "Account is suspended" },
            status: 401,
        });
    });
});
