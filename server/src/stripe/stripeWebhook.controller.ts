import { Controller, Post, Req, Res, HttpStatus } from "@nestjs/common";
import type { Request, Response } from "express";
import type Stripe from "stripe";
import { logger } from "#src/shared/utils/logger";
import { buildErrorResponse, buildSuccessResponse, requestIdFrom } from "#src/shared/http/api-response";
import { NestOrdersStripeService } from "../orders/orders.stripe.service";
import { StripeService } from "./stripe.service";

@Controller("orders/webhooks/stripe")
export class StripeWebhookController {
    constructor(
        private readonly ordersStripeService: NestOrdersStripeService,
        private readonly stripeService: StripeService,
    ) {}

    @Post()
    async handleStripeWebhook(
        @Req() req: Request,
        @Res() res: Response,
    ) {
        const requestId = requestIdFrom(req);
        const signature = req.headers["stripe-signature"];
        if (!signature || typeof signature !== "string") {
            return res.status(HttpStatus.BAD_REQUEST).json(buildErrorResponse({
                statusCode: HttpStatus.BAD_REQUEST,
                code: "STRIPE_SIGNATURE_MISSING",
                message: "Missing Stripe signature",
                requestId,
            }));
        }

        const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
        if (!rawBody) {
            logger.error({ requestId }, "[stripeWebhook] req.rawBody missing — check rawBody: true bootstrap option");
            return res.status(HttpStatus.BAD_REQUEST).json(buildErrorResponse({
                statusCode: HttpStatus.BAD_REQUEST,
                code: "STRIPE_RAW_BODY_MISSING",
                message: "Missing raw body",
                requestId,
            }));
        }

        let event: Stripe.Event;
        try {
            event = this.stripeService.constructWebhookEvent(rawBody, signature);
        } catch (err) {
            logger.error({ err, requestId }, "[stripeWebhook] signature verification failed");
            return res.status(HttpStatus.BAD_REQUEST).json(buildErrorResponse({
                statusCode: HttpStatus.BAD_REQUEST,
                code: "STRIPE_SIGNATURE_INVALID",
                message: "Invalid signature",
                requestId,
            }));
        }

        try {
            if (event.type === "checkout.session.completed") {
                await this.ordersStripeService.handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
            }
            return res.status(HttpStatus.OK).json(buildSuccessResponse({ received: true }, requestId));
        } catch (err) {
            logger.error({ err, requestId }, "[stripeWebhook] handler error");
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(buildErrorResponse({
                statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
                code: "STRIPE_WEBHOOK_FAILED",
                message: "Unable to process Stripe webhook",
                details: { received: false },
                requestId,
            }));
        }
    }
}
