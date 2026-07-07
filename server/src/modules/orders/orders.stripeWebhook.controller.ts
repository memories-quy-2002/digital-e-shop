import type { Request, Response } from "express";
import type Stripe from "stripe";
import { stripeClient } from "#src/config/stripe.config";
import { env } from "#src/config/env.config";
import { logger } from "#src/shared/utils/logger";
const orderStripeService = require("./orders.stripe.service");

export async function handleStripeWebhook(req: Request, res: Response) {
    const signature = req.headers["stripe-signature"];
    if (!signature || typeof signature !== "string") {
        return res.status(400).send("Missing Stripe signature");
    }

    let event: Stripe.Event;
    try {
        event = stripeClient.webhooks.constructEvent(req.body as Buffer, signature, env.stripeWebhookSecret);
    } catch (err) {
        logger.error(err, "[stripeWebhook] signature verification failed");
        return res.status(400).send("Invalid signature");
    }

    try {
        if (event.type === "checkout.session.completed") {
            await orderStripeService.handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
        }
        return res.status(200).json({ received: true });
    } catch (err) {
        logger.error(err, "[stripeWebhook] handler error");
        return res.status(500).json({ received: false });
    }
}
