import { beforeEach, describe, expect, it, vi } from "vitest";
import { PayOSWebhookController } from "./payos-webhook.controller";

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

    it("verifies the signed webhook and delegates the exact VND event", async () => {
        const reconciliationService = {
            handleVerifiedPayOSWebhook: vi.fn().mockResolvedValue({
                kind: "processed",
                httpStatus: 200,
                eventId: 7,
                orderId: 42,
            }),
        };
        const payosService = {
            verifyWebhook: vi.fn().mockResolvedValue({
                orderCode: 123456,
                amount: 250000,
                currency: "VND",
                paymentLinkId: "link-123",
                reference: "reference-123",
                transactionDateTime: "2026-09-16T10:00:00Z",
                code: "00",
            }),
        };
        const controller = new PayOSWebhookController(payosService as never, reconciliationService as never);
        const response = buildResponse();
        const payload = { code: "00", success: true, data: {}, signature: "signed" };

        await controller.handlePayOSWebhook({ body: payload, headers: {}, get: vi.fn() } as never, response as never);

        expect(payosService.verifyWebhook).toHaveBeenCalledWith(payload);
        expect(reconciliationService.handleVerifiedPayOSWebhook).toHaveBeenCalledWith({
            data: {
                orderCode: 123456,
                amount: 250000,
                currency: "VND",
                paymentLinkId: "link-123",
                reference: "reference-123",
                transactionDateTime: "2026-09-16T10:00:00Z",
                code: "00",
                status: "PAID",
            },
        });
        expect(response.status).toHaveBeenCalledWith(200);
        expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
            success: true,
            received: true,
            finalized: true,
            outcome: "processed",
            orderId: 42,
        }));
    });

    it("rejects invalid signatures without touching reconciliation state", async () => {
        const reconciliationService = { handleVerifiedPayOSWebhook: vi.fn() };
        const payosService = { verifyWebhook: vi.fn().mockRejectedValue(new Error("invalid")) };
        const controller = new PayOSWebhookController(payosService as never, reconciliationService as never);
        const response = buildResponse();

        await controller.handlePayOSWebhook({ body: { signature: "bad" }, headers: {}, get: vi.fn() } as never, response as never);

        expect(reconciliationService.handleVerifiedPayOSWebhook).not.toHaveBeenCalled();
        expect(response.status).toHaveBeenCalledWith(400);
        expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
            code: "PAYOS_SIGNATURE_INVALID",
        }));
    });

    it("returns 400 for malformed signed success data", async () => {
        const reconciliationService = {
            handleVerifiedPayOSWebhook: vi.fn().mockRejectedValue(Object.assign(new Error("Invalid PayOS payment data"), { statusCode: 400 })),
        };
        const payosService = {
            verifyWebhook: vi.fn().mockResolvedValue({
                orderCode: 123456,
                amount: 250000,
                currency: "USD",
                paymentLinkId: "link-123",
                code: "00",
            }),
        };
        const controller = new PayOSWebhookController(payosService as never, reconciliationService as never);
        const response = buildResponse();

        await controller.handlePayOSWebhook({ body: { code: "00", success: true }, headers: {}, get: vi.fn() } as never, response as never);

        expect(reconciliationService.handleVerifiedPayOSWebhook).toHaveBeenCalled();
        expect(response.status).toHaveBeenCalledWith(400);
        expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
            code: "PAYOS_WEBHOOK_DATA_INVALID",
        }));
    });

    it("acknowledges a durable business mismatch without retrying", async () => {
        const reconciliationService = {
            handleVerifiedPayOSWebhook: vi.fn().mockResolvedValue({
                kind: "mismatch",
                httpStatus: 200,
                eventId: 7,
                message: "amount mismatch",
            }),
        };
        const payosService = {
            verifyWebhook: vi.fn().mockResolvedValue({
                orderCode: 123456,
                amount: 250000,
                currency: "VND",
                paymentLinkId: "link-123",
                code: "00",
            }),
        };
        const controller = new PayOSWebhookController(payosService as never, reconciliationService as never);
        const response = buildResponse();

        await controller.handlePayOSWebhook({ body: { code: "00", success: true }, headers: {}, get: vi.fn() } as never, response as never);

        expect(response.status).toHaveBeenCalledWith(200);
        expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
            received: true,
            finalized: false,
            outcome: "mismatch",
        }));
    });

    it("returns 500 for retryable processing failures", async () => {
        const reconciliationService = {
            handleVerifiedPayOSWebhook: vi.fn().mockResolvedValue({
                kind: "retryable",
                httpStatus: 500,
                eventId: 7,
            }),
        };
        const payosService = {
            verifyWebhook: vi.fn().mockResolvedValue({
                orderCode: 123456,
                amount: 250000,
                currency: "VND",
                paymentLinkId: "link-123",
                code: "00",
            }),
        };
        const controller = new PayOSWebhookController(payosService as never, reconciliationService as never);
        const response = buildResponse();

        await controller.handlePayOSWebhook({ body: { code: "00", success: true }, headers: {}, get: vi.fn() } as never, response as never);

        expect(response.status).toHaveBeenCalledWith(500);
        expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
            code: "PAYOS_WEBHOOK_FAILED",
            received: false,
        }));
    });

    it("does not pass unsigned envelope fields to payment reconciliation", async () => {
        const reconciliationService = {
            handleVerifiedPayOSWebhook: vi.fn().mockResolvedValue({
                kind: "ignored",
                httpStatus: 200,
                eventId: 7,
            }),
        };
        const payosService = {
            verifyWebhook: vi.fn().mockResolvedValue({
                orderCode: 123456,
                amount: 250000,
                currency: "VND",
                paymentLinkId: "link-123",
                code: "00",
            }),
        };
        const controller = new PayOSWebhookController(payosService as never, reconciliationService as never);
        const response = buildResponse();

        await controller.handlePayOSWebhook({ body: { code: "00", success: "true" }, headers: {}, get: vi.fn() } as never, response as never);

        const verifiedWebhook = reconciliationService.handleVerifiedPayOSWebhook.mock.calls[0][0];
        expect(verifiedWebhook).toEqual(expect.objectContaining({
            data: expect.objectContaining({ code: "00", status: "PAID" }),
        }));
        expect(verifiedWebhook).not.toHaveProperty("envelope");
        expect(response.status).toHaveBeenCalledWith(200);
    });
});
