import { BadRequestException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MarketingService } from "./marketing.service";

describe("MarketingService", () => {
    const subscriptionsRepository = {
        findByEmail: vi.fn(),
        upsertSubscription: vi.fn(),
        findByUnsubscribeTokenHash: vi.fn(),
        unsubscribeByTokenHash: vi.fn(),
    };
    const resendEmailService = { sendMarketingWelcome: vi.fn() };
    const usersRepository = { findByEmail: vi.fn() };

    beforeEach(() => {
        vi.clearAllMocks();
        resendEmailService.sendMarketingWelcome.mockResolvedValue(undefined);
        usersRepository.findByEmail.mockResolvedValue(null);
        subscriptionsRepository.upsertSubscription.mockResolvedValue({
            id: 7,
            email: "buyer@example.com",
            status: "ACTIVE",
            unsubscribe_token_hash: "a".repeat(64),
        });
        subscriptionsRepository.unsubscribeByTokenHash.mockResolvedValue({ affectedRows: 1 });
    });

    it("stores a new subscriber and sends a welcome email with a private unsubscribe token", async () => {
        subscriptionsRepository.findByEmail.mockResolvedValue(null);
        const service = new MarketingService(subscriptionsRepository as never, resendEmailService as never);

        await expect(service.subscribe(" Buyer@Example.com ", "footer")).resolves.toEqual({
            subscribed: true,
            alreadySubscribed: false,
        });
        expect(subscriptionsRepository.upsertSubscription).toHaveBeenCalledWith(
            "buyer@example.com",
            expect.stringMatching(/^[a-f0-9]{64}$/),
            "footer",
        );
        expect(resendEmailService.sendMarketingWelcome).toHaveBeenCalledWith(expect.objectContaining({
            subscriptionId: 7,
            email: "buyer@example.com",
            unsubscribeUrl: expect.stringMatching(/\/unsubscribe\?token=/),
        }));
    });

    it("does not send another welcome email for an active subscriber", async () => {
        subscriptionsRepository.findByEmail.mockResolvedValue({
            id: 7,
            email: "buyer@example.com",
            status: "ACTIVE",
        });
        const service = new MarketingService(subscriptionsRepository as never, resendEmailService as never);

        await expect(service.subscribe("buyer@example.com", "footer")).resolves.toEqual({
            subscribed: true,
            alreadySubscribed: true,
        });
        expect(subscriptionsRepository.upsertSubscription).not.toHaveBeenCalled();
        expect(resendEmailService.sendMarketingWelcome).not.toHaveBeenCalled();
    });

    it("does not send a welcome email to an existing unverified customer", async () => {
        usersRepository.findByEmail.mockResolvedValue({
            id: "user-1",
            email: "buyer@example.com",
            email_verified_at: null,
        });
        subscriptionsRepository.findByEmail.mockResolvedValue(null);
        const service = new MarketingService(
            subscriptionsRepository as never,
            resendEmailService as never,
            usersRepository as never,
        );

        await expect(service.subscribe("buyer@example.com", "footer")).resolves.toEqual({
            subscribed: true,
            alreadySubscribed: false,
        });

        expect(resendEmailService.sendMarketingWelcome).toHaveBeenCalledWith(expect.objectContaining({
            email: "buyer@example.com",
            emailVerified: false,
        }));
    });

    it("reactivates an unsubscribed address and sends a fresh welcome email", async () => {
        subscriptionsRepository.findByEmail.mockResolvedValue({
            id: 7,
            email: "buyer@example.com",
            status: "UNSUBSCRIBED",
        });
        const service = new MarketingService(subscriptionsRepository as never, resendEmailService as never);

        await expect(service.subscribe("buyer@example.com", "footer")).resolves.toEqual({
            subscribed: true,
            alreadySubscribed: false,
        });
        expect(subscriptionsRepository.upsertSubscription).toHaveBeenCalled();
        expect(resendEmailService.sendMarketingWelcome).toHaveBeenCalled();
    });

    it("unsubscribes using only the hashed token", async () => {
        subscriptionsRepository.findByUnsubscribeTokenHash.mockResolvedValue({ id: 7, status: "ACTIVE" });
        const service = new MarketingService(subscriptionsRepository as never, resendEmailService as never);

        await expect(service.unsubscribe("raw-unsubscribe-token")).resolves.toEqual({ unsubscribed: true });
        expect(subscriptionsRepository.unsubscribeByTokenHash).toHaveBeenCalledWith(expect.stringMatching(/^[a-f0-9]{64}$/));
    });

    it("rejects an invalid unsubscribe token", async () => {
        subscriptionsRepository.findByUnsubscribeTokenHash.mockResolvedValue(null);
        const service = new MarketingService(subscriptionsRepository as never, resendEmailService as never);

        await expect(service.unsubscribe("invalid-token")).rejects.toBeInstanceOf(BadRequestException);
        expect(subscriptionsRepository.unsubscribeByTokenHash).not.toHaveBeenCalled();
    });
});
