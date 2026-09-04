import { describe, expect, it, vi, beforeEach } from "vitest";
import { StripeWebhookController } from "../stripeWebhook.controller";
import type { NestOrdersStripeService } from "../../orders/orders.stripe.service";

vi.mock("#src/config/stripe.config", () => ({
    stripeClient: { webhooks: { constructEvent: vi.fn() } },
}));

import { stripeClient } from "#src/config/stripe.config";

function mockRes() {
    const res: { status: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> } = {
        status: vi.fn(),
        send: vi.fn(),
        json: vi.fn(),
    };
    res.status.mockReturnValue(res);
    res.send.mockReturnValue(res);
    res.json.mockReturnValue(res);
    return res;
}

describe("StripeWebhookController", () => {
    let controller: StripeWebhookController;
    let ordersStripeService: { handleCheckoutSessionCompleted: ReturnType<typeof vi.fn> };

    beforeEach(() => {
        ordersStripeService = { handleCheckoutSessionCompleted: vi.fn() };
        controller = new StripeWebhookController(ordersStripeService as unknown as NestOrdersStripeService);
        vi.clearAllMocks();
    });

    it("rejects when the stripe-signature header is missing", async () => {
        const req = { headers: {} } as never;
        const res = mockRes();

        await controller.handleStripeWebhook(req, res as never);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            success: false,
            error: "Missing Stripe signature",
            msg: "Missing Stripe signature",
            code: "STRIPE_SIGNATURE_MISSING",
            requestId: "unknown",
        });
    });

    it("rejects when req.rawBody is missing, without ever calling constructEvent on the parsed JSON body", async () => {
        const req = {
            headers: { "stripe-signature": "sig" },
            body: { type: "checkout.session.completed" },
        } as never;
        const res = mockRes();

        await controller.handleStripeWebhook(req, res as never);

        expect(stripeClient.webhooks.constructEvent).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            success: false,
            error: "Missing raw body",
            msg: "Missing raw body",
            code: "STRIPE_RAW_BODY_MISSING",
            requestId: "unknown",
        });
    });

    it("verifies the signature against req.rawBody (the raw buffer), not req.body", async () => {
        const rawBuffer = Buffer.from('{"type":"checkout.session.completed"}');
        const req = {
            headers: { "stripe-signature": "sig" },
            body: { type: "checkout.session.completed" },
            rawBody: rawBuffer,
        } as never;
        const res = mockRes();
        vi.mocked(stripeClient.webhooks.constructEvent).mockReturnValue({
            type: "checkout.session.completed",
            data: { object: { id: "sess_1" } },
        } as never);

        await controller.handleStripeWebhook(req, res as never);

        expect(stripeClient.webhooks.constructEvent).toHaveBeenCalledWith(rawBuffer, "sig", expect.any(String));
        expect(ordersStripeService.handleCheckoutSessionCompleted).toHaveBeenCalledWith({ id: "sess_1" });
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ received: true, success: true, requestId: "unknown" });
    });

    it("returns 400 when signature verification throws", async () => {
        const req = {
            headers: { "stripe-signature": "bad-sig" },
            rawBody: Buffer.from("payload"),
        } as never;
        const res = mockRes();
        vi.mocked(stripeClient.webhooks.constructEvent).mockImplementation(() => {
            throw new Error("invalid signature");
        });

        await controller.handleStripeWebhook(req, res as never);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            success: false,
            error: "Invalid signature",
            msg: "Invalid signature",
            code: "STRIPE_SIGNATURE_INVALID",
            requestId: "unknown",
        });
    });
});
