import Stripe from "stripe";
import { env } from "#src/config/env.config";

if (!env.stripeSecretKey) {
    throw new Error("STRIPE_SECRET_KEY is required");
}

export const stripeClient = new Stripe(env.stripeSecretKey);
