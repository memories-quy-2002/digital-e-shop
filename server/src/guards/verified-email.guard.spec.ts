import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { VerifiedEmailGuard } from "./verified-email.guard";

const contextFor = (req: Record<string, unknown>) => ({
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => ({}),
    getClass: () => ({}),
});

describe("VerifiedEmailGuard", () => {
    it("allows routes without the verification metadata", async () => {
        const reflector = { getAllAndOverride: vi.fn().mockReturnValue(false) };
        const usersRepository = { findById: vi.fn() };
        const guard = new VerifiedEmailGuard(reflector as never, usersRepository as never);

        await expect(guard.canActivate(contextFor({ user: { id: "user-1" } }) as never)).resolves.toBe(true);
        expect(usersRepository.findById).not.toHaveBeenCalled();
    });

    it("blocks an unverified customer but allows an admin", async () => {
        const reflector = { getAllAndOverride: vi.fn().mockReturnValue(true) };
        const usersRepository = { findById: vi.fn() };
        const guard = new VerifiedEmailGuard(reflector as never, usersRepository as never);

        usersRepository.findById.mockResolvedValue({ id: "user-1", role: "Customer", email_verified_at: null });
        await expect(guard.canActivate(contextFor({ user: { id: "user-1" } }) as never)).rejects.toMatchObject({
            response: expect.objectContaining({ code: "EMAIL_VERIFICATION_REQUIRED" }),
            status: 403,
        });

        usersRepository.findById.mockResolvedValue({ id: "admin-1", role: "Admin", email_verified_at: null });
        await expect(guard.canActivate(contextFor({ user: { id: "admin-1" } }) as never)).resolves.toBe(true);
    });

    it("treats legacy rows without the new column as verified", async () => {
        const reflector = { getAllAndOverride: vi.fn().mockReturnValue(true) };
        const usersRepository = { findById: vi.fn().mockResolvedValue({ id: "legacy-user", role: "Customer" }) };
        const guard = new VerifiedEmailGuard(reflector as never, usersRepository as never);

        await expect(guard.canActivate(contextFor({ user: { id: "legacy-user" } }) as never)).resolves.toBe(true);
    });

    it("requires an authenticated request when metadata is enabled", async () => {
        const reflector = { getAllAndOverride: vi.fn().mockReturnValue(true) };
        const guard = new VerifiedEmailGuard(reflector as never, { findById: vi.fn() } as never);

        await expect(guard.canActivate(contextFor({}) as never)).rejects.toBeInstanceOf(UnauthorizedException);
    });
});
