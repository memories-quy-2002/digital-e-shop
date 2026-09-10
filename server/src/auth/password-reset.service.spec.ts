import { BadRequestException } from "@nestjs/common";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "#src/config/env.config";
import { PasswordResetService } from "./password-reset.service";

describe("PasswordResetService", () => {
    const usersRepository = {
        findByEmail: vi.fn(),
        setPasswordResetToken: vi.fn(),
        findByPasswordResetTokenHash: vi.fn(),
        consumePasswordResetToken: vi.fn(),
        findById: vi.fn(),
    };
    const authRepository = { revokeAllSessions: vi.fn() };
    const resendEmailService = {
        sendPasswordReset: vi.fn(),
        sendPasswordChangedNotice: vi.fn(),
    };
    const firebaseAdminAuthService = { generatePasswordResetLink: vi.fn() };
    const originalAuthProvider = env.authProvider;

    beforeEach(() => {
        vi.clearAllMocks();
        env.authProvider = "local";
        usersRepository.setPasswordResetToken.mockResolvedValue({ affectedRows: 1 });
        usersRepository.consumePasswordResetToken.mockResolvedValue({ affectedRows: 1 });
        authRepository.revokeAllSessions.mockResolvedValue(undefined);
        resendEmailService.sendPasswordReset.mockResolvedValue(undefined);
        resendEmailService.sendPasswordChangedNotice.mockResolvedValue(undefined);
    });

    afterAll(() => {
        env.authProvider = originalAuthProvider;
    });

    it("stores only a token hash and sends a generic local reset link", async () => {
        usersRepository.findByEmail.mockResolvedValue({
            id: "user-1",
            email: "Customer@Example.com",
            username: "customer",
            auth_provider: "local",
            status: "Active",
        });
        const service = new PasswordResetService(
            usersRepository as never,
            authRepository as never,
            resendEmailService as never,
            firebaseAdminAuthService as never,
        );

        await expect(service.request(" Customer@Example.com ")).resolves.toBeUndefined();

        expect(usersRepository.setPasswordResetToken).toHaveBeenCalledWith(
            "user-1",
            expect.stringMatching(/^[a-f0-9]{64}$/),
            expect.any(Date),
        );
        expect(resendEmailService.sendPasswordReset).toHaveBeenCalledWith(expect.objectContaining({
            userId: "user-1",
            email: "customer@example.com",
            resetUrl: expect.stringMatching(/\/reset-password\?token=/),
            tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        }));
        const emailInput = resendEmailService.sendPasswordReset.mock.calls[0][0];
        expect(emailInput.resetUrl).not.toContain(emailInput.tokenHash);
    });

    it("does not reveal whether an unknown email has an account", async () => {
        usersRepository.findByEmail.mockResolvedValue(null);
        const service = new PasswordResetService(
            usersRepository as never,
            authRepository as never,
            resendEmailService as never,
            firebaseAdminAuthService as never,
        );

        await expect(service.request("missing@example.com")).resolves.toBeUndefined();
        expect(resendEmailService.sendPasswordReset).not.toHaveBeenCalled();
    });

    it("does not prepare or send a reset link for an unverified account", async () => {
        usersRepository.findByEmail.mockResolvedValue({
            id: "unverified-user",
            email: "unverified@example.com",
            username: "unverified",
            auth_provider: "local",
            status: "Active",
            email_verified_at: null,
        });
        const service = new PasswordResetService(
            usersRepository as never,
            authRepository as never,
            resendEmailService as never,
            firebaseAdminAuthService as never,
        );

        await expect(service.request("unverified@example.com")).resolves.toBeUndefined();

        expect(usersRepository.setPasswordResetToken).not.toHaveBeenCalled();
        expect(resendEmailService.sendPasswordReset).not.toHaveBeenCalled();
    });

    it("uses a server-generated Firebase reset link and an independent delivery key", async () => {
        env.authProvider = "firebase";
        usersRepository.findByEmail.mockResolvedValue({
            id: "firebase-1",
            email: "firebase@example.com",
            username: "firebase-user",
            auth_provider: "firebase",
            status: "Active",
        });
        const resetUrl = "https://firebase.test/reset?oobCode=code";
        firebaseAdminAuthService.generatePasswordResetLink.mockResolvedValue(resetUrl);
        const service = new PasswordResetService(
            usersRepository as never,
            authRepository as never,
            resendEmailService as never,
            firebaseAdminAuthService as never,
        );

        await service.request("firebase@example.com");

        expect(firebaseAdminAuthService.generatePasswordResetLink).toHaveBeenCalledWith("firebase@example.com");
        expect(usersRepository.setPasswordResetToken).not.toHaveBeenCalled();
        expect(resendEmailService.sendPasswordReset).toHaveBeenCalledWith(expect.objectContaining({
            resetUrl,
            tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        }));
        const emailInput = resendEmailService.sendPasswordReset.mock.calls[0][0];
        expect(emailInput.tokenHash).not.toBe(resetUrl);
    });

    it("changes a local password, revokes sessions, and sends a security notice", async () => {
        usersRepository.findByPasswordResetTokenHash.mockResolvedValue({
            id: "user-1",
            email: "customer@example.com",
            username: "customer",
            auth_provider: "local",
            status: "Active",
        });
        usersRepository.findById.mockResolvedValue({
            id: "user-1",
            email: "customer@example.com",
            username: "customer",
            email_verified_at: new Date(),
        });
        const service = new PasswordResetService(
            usersRepository as never,
            authRepository as never,
            resendEmailService as never,
            firebaseAdminAuthService as never,
        );

        await expect(service.confirm("raw-reset-token", "NewPassword1!")).resolves.toEqual(expect.objectContaining({ id: "user-1" }));
        expect(usersRepository.consumePasswordResetToken).toHaveBeenCalledWith(
            "user-1",
            expect.stringMatching(/^[a-f0-9]{64}$/),
            expect.not.stringContaining("NewPassword1!"),
        );
        expect(authRepository.revokeAllSessions).toHaveBeenCalledWith("user-1");
        expect(resendEmailService.sendPasswordChangedNotice).toHaveBeenCalledWith(expect.objectContaining({
            userId: "user-1",
            email: "customer@example.com",
        }));
    });

    it("rejects an invalid or expired reset token", async () => {
        usersRepository.findByPasswordResetTokenHash.mockResolvedValue(null);
        const service = new PasswordResetService(
            usersRepository as never,
            authRepository as never,
            resendEmailService as never,
            firebaseAdminAuthService as never,
        );

        await expect(service.confirm("invalid-token", "NewPassword1!")).rejects.toBeInstanceOf(BadRequestException);
        expect(usersRepository.consumePasswordResetToken).not.toHaveBeenCalled();
    });
});
