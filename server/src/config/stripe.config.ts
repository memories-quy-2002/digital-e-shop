import Stripe from "stripe";
import { env } from "#src/config/env.config";

export const stripeClient = new Stripe(env.stripeSecretKey || "sk_test_placeholder_key_not_configured");
