import { BadRequestException, ConflictException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EmailChangeService } from "./email-change.service";

describe("EmailChangeService", () => {
    const usersRepository = {
        findById: vi.fn(),
        findByEmail: vi.fn(),
        setPendingEmailChange: vi.fn(),
        findByEmailChangeTokenHash: vi.fn(),
        consumeEmailChangeToken: vi.fn(),
    };
    const resendEmailService = {
        sendEmailChangeConfirmation: vi.fn(),
        sendEmailChangeNotice: vi.fn(),
    };
    const firebaseAdminAuthService = { updateEmail: vi.fn() };

    beforeEach(() => {
        vi.clearAllMocks();
        usersRepository.setPendingEmailChange.mockResolvedValue({ affectedRows: 1 });
        usersRepository.consumeEmailChangeToken.mockResolvedValue({ affectedRows: 1 });
        resendEmailService.sendEmailChangeConfirmation.mockResolvedValue(undefined);
        resendEmailService.sendEmailChangeNotice.mockResolvedValue(undefined);
        firebaseAdminAuthService.updateEmail.mockResolvedValue(undefined);
    });

    it("stores a pending email and sends confirmation plus a notice to the old email", async () => {
        usersRepository.findById.mockResolvedValue({
            id: "user-1",
            email: "old@example.com",
            username: "customer",
            auth_provider: "local",
            status: "Active",
        });
        usersRepository.findByEmail.mockResolvedValue(null);
        const service = new EmailChangeService(
            usersRepository as never,
            resendEmailService as never,
            firebaseAdminAuthService as never,
        );

        await expect(service.request("user-1", " New@Example.com ")).resolves.toEqual({ email: "new@example.com" });
        expect(usersRepository.setPendingEmailChange).toHaveBeenCalledWith(
            "user-1",
            "new@example.com",
            expect.stringMatching(/^[a-f0-9]{64}$/),
            expect.any(Date),
        );
        expect(resendEmailService.sendEmailChangeConfirmation).toHaveBeenCalledWith(expect.objectContaining({
            userId: "user-1",
            email: "new@example.com",
            confirmUrl: expect.stringMatching(/\/confirm-email-change\?token=/),
        }));
        expect(resendEmailService.sendEmailChangeNotice).toHaveBeenCalledWith(expect.objectContaining({
            email: "old@example.com",
            newEmail: "new@example.com",
            event: "requested",
        }));
    });

    it("rejects an email already owned by another account", async () => {
        usersRepository.findById.mockResolvedValue({ id: "user-1", email: "old@example.com", status: "Active" });
        usersRepository.findByEmail.mockResolvedValue({ id: "user-2", email: "new@example.com" });
        const service = new EmailChangeService(
            usersRepository as never,
            resendEmailService as never,
            firebaseAdminAuthService as never,
        );

        await expect(service.request("user-1", "new@example.com")).rejects.toBeInstanceOf(ConflictException);
        expect(usersRepository.setPendingEmailChange).not.toHaveBeenCalled();
    });

    it("confirms a local email change and notifies both addresses", async () => {
        usersRepository.findByEmailChangeTokenHash.mockResolvedValue({
            id: "user-1",
            email: "old@example.com",
            pending_email: "new@example.com",
            username: "customer",
            auth_provider: "local",
            status: "Active",
        });
        usersRepository.findById.mockResolvedValue({ id: "user-1", email: "new@example.com", email_verified_at: new Date() });
        const service = new EmailChangeService(
            usersRepository as never,
            resendEmailService as never,
            firebaseAdminAuthService as never,
        );

        await expect(service.confirm("raw-email-token")).resolves.toEqual(expect.objectContaining({
            id: "user-1",
            email: "new@example.com",
        }));
        expect(usersRepository.consumeEmailChangeToken).toHaveBeenCalledWith(
            "user-1",
            expect.stringMatching(/^[a-f0-9]{64}$/),
            "new@example.com",
        );
        expect(firebaseAdminAuthService.updateEmail).not.toHaveBeenCalled();
        expect(resendEmailService.sendEmailChangeNotice).toHaveBeenCalledTimes(2);
        expect(resendEmailService.sendEmailChangeNotice).toHaveBeenCalledWith(expect.objectContaining({
            email: "old@example.com",
            event: "changed",
        }));
        expect(resendEmailService.sendEmailChangeNotice).toHaveBeenCalledWith(expect.objectContaining({
            email: "new@example.com",
            event: "changed",
        }));
    });

    it("updates the Firebase identity before completing a Firebase email change", async () => {
        usersRepository.findByEmailChangeTokenHash.mockResolvedValue({
            id: "firebase-1",
            email: "old@example.com",
            pending_email: "new@example.com",
            auth_provider: "firebase",
            status: "Active",
        });
        usersRepository.findById.mockResolvedValue({ id: "firebase-1", email: "new@example.com" });
        const service = new EmailChangeService(
            usersRepository as never,
            resendEmailService as never,
            firebaseAdminAuthService as never,
        );

        await service.confirm("raw-email-token");

        expect(firebaseAdminAuthService.updateEmail).toHaveBeenCalledWith("firebase-1", "new@example.com");
        expect(usersRepository.consumeEmailChangeToken).toHaveBeenCalled();
    });

    it("rejects an invalid or expired email-change token", async () => {
        usersRepository.findByEmailChangeTokenHash.mockResolvedValue(null);
        const service = new EmailChangeService(
            usersRepository as never,
            resendEmailService as never,
            firebaseAdminAuthService as never,
        );

        await expect(service.confirm("invalid-token")).rejects.toBeInstanceOf(BadRequestException);
        expect(usersRepository.consumeEmailChangeToken).not.toHaveBeenCalled();
    });
});
