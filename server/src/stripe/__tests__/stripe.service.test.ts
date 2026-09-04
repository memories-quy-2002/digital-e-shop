import { describe, expect, it, vi } from "vitest";

vi.mock("#src/config/env.config", () => ({
    env: {
        stripeSecretKey: "",
        stripeWebhookSecret: "",
    },
}));

import { StripeService } from "../stripe.service";

describe("StripeService", () => {
    it("does not require STRIPE_SECRET_KEY just to construct the provider", () => {
        expect(() => new StripeService()).not.toThrow();
    });

    it("requires STRIPE_SECRET_KEY only when Stripe is actually used", () => {
        const service = new StripeService();

        expect(() => service.constructWebhookEvent(Buffer.from("{}"), "sig")).toThrow(
            "STRIPE_SECRET_KEY is required",
        );
    });
});
