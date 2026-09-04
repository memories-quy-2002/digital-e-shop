import { beforeEach, describe, expect, it, vi } from "vitest";
import { StripeWebhookController } from "./stripeWebhook.controller";
import type { NestOrdersStripeService } from "../orders/orders.stripe.service";
import type { StripeService } from "./stripe.service";

const { logger } = vi.hoisted(() => ({
    logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("#src/shared/utils/logger", () => ({ logger }));

function mockResponse() {
    const response = { status: vi.fn(), send: vi.fn(), json: vi.fn() };
    response.status.mockReturnValue(response);
    response.send.mockReturnValue(response);
    response.json.mockReturnValue(response);
    return response;
}

describe("Stripe checkout webhook flow", () => {
    beforeEach(() => vi.clearAllMocks());

    it("verifies the raw body and returns a canonical success response", async () => {
        const ordersStripeService = { handleCheckoutSessionCompleted: vi.fn() };
        const stripeService = { constructWebhookEvent: vi.fn() };
        const controller = new StripeWebhookController(
            ordersStripeService as unknown as NestOrdersStripeService,
            stripeService as unknown as StripeService,
        );
        const rawBody = Buffer.from('{"type":"checkout.session.completed"}');
        const response = mockResponse();
        stripeService.constructWebhookEvent.mockReturnValue({
            type: "checkout.session.completed",
            data: { object: { id: "cs_flow_1" } },
        });

        await controller.handleStripeWebhook({
            requestId: "stripe-1",
            headers: { "stripe-signature": "sig" },
            rawBody,
        } as never, response as never);

        expect(stripeService.constructWebhookEvent).toHaveBeenCalledWith(rawBody, "sig");
        expect(ordersStripeService.handleCheckoutSessionCompleted).toHaveBeenCalledWith({ id: "cs_flow_1" });
        expect(response.json).toHaveBeenCalledWith({
            received: true,
            success: true,
            requestId: "stripe-1",
        });
    });

    it("returns a canonical client error when the Stripe signature is missing", async () => {
        const controller = new StripeWebhookController(
            {} as NestOrdersStripeService,
            {} as StripeService,
        );
        const response = mockResponse();

        await controller.handleStripeWebhook({ requestId: "stripe-2", headers: {} } as never, response as never);

        expect(response.status).toHaveBeenCalledWith(400);
        expect(response.json).toHaveBeenCalledWith({
            success: false,
            error: "Missing Stripe signature",
            msg: "Missing Stripe signature",
            code: "STRIPE_SIGNATURE_MISSING",
            requestId: "stripe-2",
        });
    });
});
