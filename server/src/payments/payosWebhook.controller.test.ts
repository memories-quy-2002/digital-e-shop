import { beforeEach, describe, expect, it, vi } from "vitest";
import { PayOSWebhookController } from "./payosWebhook.controller";

const buildResponse = () => {
    const response = {
        status: vi.fn(),
        json: vi.fn(),
    };
    response.status.mockReturnValue(response);
    return response;
};

describe("PayOSWebhookController", () => {
    beforeEach(() => vi.clearAllMocks());

    it("verifies the signed webhook and finalizes the exact VND payment", async () => {
        const ordersPayOSService = { handlePaymentWebhook: vi.fn().mockResolvedValue(undefined) };
        const payosService = {
            verifyWebhook: vi.fn().mockResolvedValue({
                orderCode: 123456,
                amount: 250000,
                currency: "VND",
                paymentLinkId: "link-123",
                code: "00",
            }),
        };
        const controller = new PayOSWebhookController(ordersPayOSService as never, payosService as never);
        const response = buildResponse();
        const payload = { code: "00", success: true, data: {}, signature: "signed" };

        await controller.handlePayOSWebhook({ body: payload, headers: {}, get: vi.fn() } as never, response as never);

        expect(payosService.verifyWebhook).toHaveBeenCalledWith(payload);
        expect(ordersPayOSService.handlePaymentWebhook).toHaveBeenCalledWith(123456, "link-123", 250000);
        expect(response.status).toHaveBeenCalledWith(200);
    });

    it("rejects invalid signatures without touching order state", async () => {
        const ordersPayOSService = { handlePaymentWebhook: vi.fn() };
        const payosService = { verifyWebhook: vi.fn().mockRejectedValue(new Error("invalid")) };
        const controller = new PayOSWebhookController(ordersPayOSService as never, payosService as never);
        const response = buildResponse();

        await controller.handlePayOSWebhook({ body: { signature: "bad" }, headers: {}, get: vi.fn() } as never, response as never);

        expect(ordersPayOSService.handlePaymentWebhook).not.toHaveBeenCalled();
        expect(response.status).toHaveBeenCalledWith(400);
    });

    it("rejects non-VND or malformed payment data", async () => {
        const ordersPayOSService = { handlePaymentWebhook: vi.fn() };
        const payosService = {
            verifyWebhook: vi.fn().mockResolvedValue({
                orderCode: 123456,
                amount: 250000,
                currency: "USD",
                paymentLinkId: "link-123",
                code: "00",
            }),
        };
        const controller = new PayOSWebhookController(ordersPayOSService as never, payosService as never);
        const response = buildResponse();

        await controller.handlePayOSWebhook({ body: { code: "00", success: true }, headers: {}, get: vi.fn() } as never, response as never);

        expect(ordersPayOSService.handlePaymentWebhook).not.toHaveBeenCalled();
        expect(response.status).toHaveBeenCalledWith(400);
    });
});
