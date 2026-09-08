import { Injectable } from "@nestjs/common";
import Stripe from "stripe";
import { env } from "#src/config/env.config";

@Injectable()
export class StripeService {
    private client: Stripe | null = null;

    private getClient(): Stripe {
        if (this.client) {
            return this.client;
        }

        if (!env.stripeSecretKey) {
            throw new Error("STRIPE_SECRET_KEY is required");
        }

        this.client = new Stripe(env.stripeSecretKey);
        return this.client;
    }

    createCheckoutSession(params: Stripe.Checkout.SessionCreateParams) {
        return this.getClient().checkout.sessions.create(params);
    }

    expireCheckoutSession(sessionId: string) {
        return this.getClient().checkout.sessions.expire(sessionId);
    }

    refundPayment(paymentIntentId: string, amountCents?: number, idempotencyKey?: string) {
        const params = {
            payment_intent: paymentIntentId,
            ...(amountCents === undefined ? {} : { amount: amountCents }),
        };
        if (idempotencyKey) {
            return this.getClient().refunds.create(params, { idempotencyKey });
        }
        return this.getClient().refunds.create(params);
    }

    constructWebhookEvent(payload: Buffer, signature: string): Stripe.Event {
        return this.getClient().webhooks.constructEvent(payload, signature, env.stripeWebhookSecret);
    }
}
