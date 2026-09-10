import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    env: {
        resendApiKey: "",
        resendFromEmail: "Digital-E <onboarding@resend.dev>",
        clientUrl: "http://localhost:5173",
    },
    logger: {
        error: vi.fn(),
        warn: vi.fn(),
    },
}));

vi.mock("#src/config/env.config", () => ({ env: mocks.env }));
vi.mock("#src/shared/utils/logger", () => ({ logger: mocks.logger }));

import { ResendEmailService } from "../resend-email.service";

const confirmation = {
    orderId: 42,
    email: "buyer@example.com",
    name: "Buyer Name",
    total: 18,
    paymentMethod: "cash",
    shipping: { address: "1 Main Street", city: "HCMC", country: "VN" },
    items: [{ name: "Widget", quantity: 2, total: 16 }],
    customerType: "guest" as const,
    emailVerified: true,
    guestOrderToken: "must-not-be-sent",
};

describe("ResendEmailService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal("fetch", vi.fn());
        mocks.env.resendApiKey = "";
    });

    it("does not call Resend when the API key is not configured", async () => {
        const service = new ResendEmailService();

        await service.sendOrderConfirmation(confirmation);

        expect(fetch).not.toHaveBeenCalled();
    });

    it("sends a confirmation through Resend without including the access token", async () => {
        mocks.env.resendApiKey = "re_test_key";
        vi.mocked(fetch).mockResolvedValue({ ok: true, status: 200 } as Response);
        const service = new ResendEmailService();

        await service.sendOrderConfirmation(confirmation);

        expect(fetch).toHaveBeenCalledWith("https://api.resend.com/emails", expect.objectContaining({
            method: "POST",
            headers: {
                Authorization: "Bearer re_test_key",
                "Content-Type": "application/json",
                "User-Agent": "digital-e-server/1.0",
                "Idempotency-Key": "order-confirmation-42",
            },
        }));
        const request = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
        expect(String(request.body)).toContain("buyer@example.com");
        expect(String(request.body)).toContain("Order #42");
        expect(String(request.body)).not.toContain("must-not-be-sent");
    });

    it("throws a safe delivery error without logging the response body", async () => {
        mocks.env.resendApiKey = "re_test_key";
        vi.mocked(fetch).mockResolvedValue({ ok: false, status: 422, text: vi.fn().mockResolvedValue("secret response") } as never);
        const service = new ResendEmailService();

        await expect(service.sendOrderConfirmation(confirmation)).rejects.toThrow("Resend email delivery failed (422)");
        expect(mocks.logger.error).toHaveBeenCalledWith(expect.objectContaining({ orderId: 42, status: 422 }), expect.any(String));
        expect(JSON.stringify(mocks.logger.error.mock.calls)).not.toContain("secret response");
    });

    it("does not call Resend for an invalid recipient email", async () => {
        mocks.env.resendApiKey = "re_test_key";
        const service = new ResendEmailService();

        await service.sendOrderConfirmation({ ...confirmation, email: "not-an-email" });

        expect(fetch).not.toHaveBeenCalled();
    });

    it("uses the authenticated order link without guest-token instructions", async () => {
        mocks.env.resendApiKey = "re_test_key";
        vi.mocked(fetch).mockResolvedValue({ ok: true, status: 200 } as Response);
        const service = new ResendEmailService();

        await service.sendOrderConfirmation({ ...confirmation, customerType: "authenticated" });

        const request = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
        expect(String(request.body)).toContain("/orders");
        expect(String(request.body)).not.toContain("guest-order");
        expect(String(request.body)).not.toContain("must-not-be-sent");
    });

    it("does not send an authenticated order confirmation to an unverified email", async () => {
        mocks.env.resendApiKey = "re_test_key";
        const service = new ResendEmailService();

        await service.sendOrderConfirmation({
            ...confirmation,
            customerType: "authenticated",
            emailVerified: false,
        });

        expect(fetch).not.toHaveBeenCalled();
    });

    it("sends a server-owned verification link with an idempotency key", async () => {
        mocks.env.resendApiKey = "re_test_key";
        vi.mocked(fetch).mockResolvedValue({ ok: true, status: 200 } as Response);
        const service = new ResendEmailService();

        await expect(service.sendEmailVerification({
            userId: "user-1",
            email: "buyer@example.com",
            name: "Buyer",
            token: "raw-verification-token",
            tokenHash: "a".repeat(64),
        })).resolves.toBe(true);

        const request = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
        expect((request.headers as Record<string, string>)["Idempotency-Key"]).toBe("email-verification-user-1-aaaaaaaaaaaaaaaa");
        expect(String(request.body)).toContain("raw-verification-token");
        expect(String(request.body)).toContain("/verify-email?token=");
    });

    it("sends a password reset link without logging or exposing the token outside the link", async () => {
        mocks.env.resendApiKey = "re_test_key";
        vi.mocked(fetch).mockResolvedValue({ ok: true, status: 200 } as Response);
        const service = new ResendEmailService();

        await service.sendPasswordReset({
            userId: "user-1",
            email: "buyer@example.com",
            name: "Buyer",
            resetUrl: "http://localhost:5173/reset-password?token=raw-reset-token",
            tokenHash: "b".repeat(64),
            emailVerified: true,
        });

        const request = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
        expect((request.headers as Record<string, string>)["Idempotency-Key"])
            .toBe("password-reset-user-1-bbbbbbbbbbbbbbbb");
        expect(String(request.body)).toContain("raw-reset-token");
        expect(JSON.stringify(mocks.logger.error.mock.calls)).not.toContain("raw-reset-token");
    });

    it("does not send a password reset link to an unverified email", async () => {
        mocks.env.resendApiKey = "re_test_key";
        const service = new ResendEmailService();

        await service.sendPasswordReset({
            userId: "user-1",
            email: "buyer@example.com",
            name: "Buyer",
            resetUrl: "http://localhost:5173/reset-password?token=raw-reset-token",
            tokenHash: "b".repeat(64),
            emailVerified: false,
        });

        expect(fetch).not.toHaveBeenCalled();
    });

    it("sends email-change confirmation and security notices to the intended recipients", async () => {
        mocks.env.resendApiKey = "re_test_key";
        vi.mocked(fetch).mockResolvedValue({ ok: true, status: 200 } as Response);
        const service = new ResendEmailService();

        await service.sendEmailChangeConfirmation({
            userId: "user-1",
            email: "new@example.com",
            name: "Buyer",
            confirmUrl: "http://localhost:5173/confirm-email-change?token=raw-email-token",
            tokenHash: "c".repeat(64),
        });
        await service.sendEmailChangeNotice({
            userId: "user-1",
            email: "old@example.com",
            name: "Buyer",
            newEmail: "new@example.com",
            event: "changed",
            emailVerified: true,
        });

        expect(fetch).toHaveBeenCalledTimes(2);
        const confirmationRequest = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
        const noticeRequest = vi.mocked(fetch).mock.calls[1][1] as RequestInit;
        expect((confirmationRequest.headers as Record<string, string>)["Idempotency-Key"])
            .toBe("email-change-confirmation-user-1-cccccccccccccccc");
        expect((noticeRequest.headers as Record<string, string>)["Idempotency-Key"])
            .toBe("email-change-notice-user-1-changed-old@example.com");
        expect(String(noticeRequest.body)).toContain("new@example.com");
        expect(String(noticeRequest.body)).not.toContain("raw-email-token");
    });

    it("does not send a security notice to an unverified email", async () => {
        mocks.env.resendApiKey = "re_test_key";
        const service = new ResendEmailService();

        await service.sendEmailChangeNotice({
            userId: "user-1",
            email: "old@example.com",
            name: "Buyer",
            newEmail: "new@example.com",
            event: "requested",
            emailVerified: false,
        });

        expect(fetch).not.toHaveBeenCalled();
    });

    it("sends a marketing welcome email with an unsubscribe link", async () => {
        mocks.env.resendApiKey = "re_test_key";
        vi.mocked(fetch).mockResolvedValue({ ok: true, status: 200 } as Response);
        const service = new ResendEmailService();

        await service.sendMarketingWelcome({
            subscriptionId: 7,
            email: "buyer@example.com",
            unsubscribeUrl: "http://localhost:5173/unsubscribe?token=raw-unsubscribe-token",
            tokenHash: "d".repeat(64),
            emailVerified: true,
        });

        const request = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
        expect((request.headers as Record<string, string>)["Idempotency-Key"])
            .toBe("marketing-welcome-7-dddddddddddddddd");
        expect(String(request.body)).toContain("raw-unsubscribe-token");
        expect(String(request.body)).toContain("unsubscribe");
    });

    it("does not send a marketing welcome email to an unverified account email", async () => {
        mocks.env.resendApiKey = "re_test_key";
        const service = new ResendEmailService();

        await service.sendMarketingWelcome({
            subscriptionId: 7,
            email: "buyer@example.com",
            unsubscribeUrl: "http://localhost:5173/unsubscribe?token=raw-unsubscribe-token",
            tokenHash: "d".repeat(64),
            emailVerified: false,
        });

        expect(fetch).not.toHaveBeenCalled();
    });
});
