import Stripe from "stripe";
import { env } from "#src/config/env.config";

/**
 * Compatibility helper for code that needs a raw Stripe client.
 * Prefer injecting StripeService in NestJS application code.
 */
export function createStripeClient(): Stripe {
    if (!env.stripeSecretKey) {
        throw new Error("STRIPE_SECRET_KEY is required");
    }

    return new Stripe(env.stripeSecretKey);
}
