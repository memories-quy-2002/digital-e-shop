import { Controller, Post, Req, Res, HttpStatus } from "@nestjs/common";
import type { Request, Response } from "express";
import type Stripe from "stripe";
import { stripeClient } from "#src/config/stripe.config";
import { env } from "#src/config/env.config";
import { logger } from "#src/shared/utils/logger";
import { NestOrdersStripeService } from "../orders/orders.stripe.service";

@Controller("orders/webhooks/stripe")
export class StripeWebhookController {
    constructor(private readonly ordersStripeService: NestOrdersStripeService) {}

    @Post()
    async handleStripeWebhook(
        @Req() req: Request,
        @Res() res: Response,
    ) {
        const signature = req.headers["stripe-signature"];
        if (!signature || typeof signature !== "string") {
            return res.status(HttpStatus.BAD_REQUEST).send("Missing Stripe signature");
        }

        // Nest's global body parser (registered before any module middleware,
        // including this module's own express.raw()) already consumes the
        // stream and parses req.body as JSON; the raw buffer needed for HMAC
        // signature verification is only available via req.rawBody (populated
        // by the `rawBody: true` NestFactory option), not req.body.
        const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
        if (!rawBody) {
            logger.error("[stripeWebhook] req.rawBody missing — check rawBody: true bootstrap option");
            return res.status(HttpStatus.BAD_REQUEST).send("Missing raw body");
        }
        let event: Stripe.Event;
        try {
            event = stripeClient.webhooks.constructEvent(rawBody, signature, env.stripeWebhookSecret);
        } catch (err) {
            logger.error(err, "[stripeWebhook] signature verification failed");
            return res.status(HttpStatus.BAD_REQUEST).send("Invalid signature");
        }

        try {
            if (event.type === "checkout.session.completed") {
                await this.ordersStripeService.handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
            }
            return res.status(HttpStatus.OK).json({ received: true });
        } catch (err) {
            logger.error(err, "[stripeWebhook] handler error");
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ received: false });
        }
    }
}
