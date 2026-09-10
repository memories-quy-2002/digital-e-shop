import { BadRequestException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EmailVerificationService } from "./email-verification.service";

describe("EmailVerificationService", () => {
    const usersRepository = {
        findByEmail: vi.fn(),
        findByVerificationTokenHash: vi.fn(),
        setEmailVerificationToken: vi.fn(),
        consumeEmailVerificationToken: vi.fn(),
        findById: vi.fn(),
    };
    const resendEmailService = {
        sendEmailVerification: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
        resendEmailService.sendEmailVerification.mockResolvedValue(true);
        usersRepository.setEmailVerificationToken.mockResolvedValue({ affectedRows: 1 });
    });

    it("stores only a hash and sends the raw token through the email adapter", async () => {
        const service = new EmailVerificationService(usersRepository as never, resendEmailService as never);
        const user = { id: "user-1", email: "Customer@Example.com", username: "customer", email_verified_at: null as Date | null };

        const result = await service.createAndSend(user as never);

        expect(result).toEqual({ sent: true, emailVerified: false });
        expect(usersRepository.setEmailVerificationToken).toHaveBeenCalledWith(
            "user-1",
            expect.stringMatching(/^[a-f0-9]{64}$/),
            expect.any(Date),
        );
        const emailInput = resendEmailService.sendEmailVerification.mock.calls[0][0];
        expect(emailInput).toEqual(expect.objectContaining({
            userId: "user-1",
            email: "customer@example.com",
            tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        }));
        expect(emailInput.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(emailInput.token).not.toBe(emailInput.tokenHash);
    });

    it("returns a generic result for an unknown resend email", async () => {
        usersRepository.findByEmail.mockResolvedValue(null);
        const service = new EmailVerificationService(usersRepository as never, resendEmailService as never);

        await expect(service.resendByEmail("missing@example.com")).resolves.toEqual({ sent: false });
        expect(resendEmailService.sendEmailVerification).not.toHaveBeenCalled();
    });

    it("consumes a valid token and rejects an invalid token", async () => {
        usersRepository.findByVerificationTokenHash.mockResolvedValue({
            id: "user-1",
            email: "user@example.com",
            email_verification_expires_at: new Date(Date.now() + 60_000),
            email_verified_at: null,
        });
        usersRepository.consumeEmailVerificationToken.mockResolvedValue({ affectedRows: 1 });
        usersRepository.findById.mockResolvedValue({ id: "user-1", email: "user@example.com", email_verified_at: new Date() });
        const service = new EmailVerificationService(usersRepository as never, resendEmailService as never);

        await expect(service.confirm("valid-token")).resolves.toEqual(expect.objectContaining({
            user: expect.objectContaining({ id: "user-1" }),
            emailVerified: true,
        }));
        expect(usersRepository.consumeEmailVerificationToken).toHaveBeenCalledWith(
            "user-1",
            expect.stringMatching(/^[a-f0-9]{64}$/),
        );

        usersRepository.findByVerificationTokenHash.mockResolvedValue(null);
        await expect(service.confirm("invalid-token")).rejects.toBeInstanceOf(BadRequestException);
    });
});
