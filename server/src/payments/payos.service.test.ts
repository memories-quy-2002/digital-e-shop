import { beforeEach, describe, expect, it, vi } from "vitest";

const payosMocks = vi.hoisted(() => ({
    client: {
        paymentRequests: {
            create: vi.fn(),
            cancel: vi.fn(),
        },
        webhooks: {
            verify: vi.fn(),
        },
    },
    PayOS: vi.fn(),
}));

vi.mock("@payos/node", () => ({ PayOS: payosMocks.PayOS }));

import { PayOSService } from "./payos.service";

const configValues = {
    payosClientId: "client-id",
    payosApiKey: "api-key",
    payosChecksumKey: "checksum-key",
    payosPartnerCode: "partner-code",
    payosBaseUrl: "https://api-merchant.payos.vn",
};

const buildService = (overrides: Partial<typeof configValues> = {}) => {
    const values = { ...configValues, ...overrides };
    const config = {
        get: vi.fn((key: keyof typeof values) => values[key]),
    };
    return {
        service: new PayOSService(config as never),
        config,
    };
};

describe("PayOSService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        payosMocks.PayOS.mockImplementation(class {
            paymentRequests = payosMocks.client.paymentRequests;
            webhooks = payosMocks.client.webhooks;
        });
    });

    it("creates a VND payment link through the official SDK", async () => {
        const { service } = buildService();
        payosMocks.client.paymentRequests.create.mockResolvedValue({
            orderCode: 123456,
            amount: 250000,
            currency: "VND",
            paymentLinkId: "link-123",
            checkoutUrl: "https://pay.payos.vn/web/link-123",
            status: "PENDING",
        });

        await expect(service.createPaymentLink({
            orderCode: 123456,
            amount: 250000,
            description: "DE123456",
            returnUrl: "https://shop.test/checkout-success?payos_order_code=123456",
            cancelUrl: "https://shop.test/cart",
            expiredAt: 1_800_000_000,
        })).resolves.toMatchObject({
            orderCode: 123456,
            amount: 250000,
            paymentLinkId: "link-123",
            checkoutUrl: "https://pay.payos.vn/web/link-123",
            currency: "VND",
        });

        expect(payosMocks.PayOS).toHaveBeenCalledWith({
            clientId: "client-id",
            apiKey: "api-key",
            checksumKey: "checksum-key",
            partnerCode: "partner-code",
            baseURL: "https://api-merchant.payos.vn",
        });
        expect(payosMocks.client.paymentRequests.create).toHaveBeenCalledWith(expect.objectContaining({
            orderCode: 123456,
            amount: 250000,
        }));
    });

    it("fails closed when PayOS credentials are incomplete", async () => {
        const { service } = buildService({ payosChecksumKey: "" });

        expect(service.isConfigured).toBe(false);
        await expect(service.createPaymentLink({
            orderCode: 123456,
            amount: 250000,
            description: "DE123456",
            returnUrl: "https://shop.test/checkout-success",
            cancelUrl: "https://shop.test/cart",
        })).rejects.toThrow("PayOS payments are not configured");
        expect(payosMocks.PayOS).not.toHaveBeenCalled();
    });

    it("delegates webhook verification and payment-link cancellation", async () => {
        const { service } = buildService();
        const payload = { code: "00", success: true, data: { orderCode: 123456 }, signature: "signature" };
        const webhookData = { orderCode: 123456, amount: 250000, currency: "VND", paymentLinkId: "link-123" };
        payosMocks.client.webhooks.verify.mockResolvedValue(webhookData);

        await expect(service.verifyWebhook(payload)).resolves.toEqual(webhookData);
        await service.cancelPaymentLink("link-123", "Checkout expired");

        expect(payosMocks.client.webhooks.verify).toHaveBeenCalledWith(payload);
        expect(payosMocks.client.paymentRequests.cancel).toHaveBeenCalledWith("link-123", "Checkout expired");
    });
});
