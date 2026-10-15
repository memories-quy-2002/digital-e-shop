import { describe, expect, it } from "vitest";
import { verifyCarrierSecret, carrierWebhookSchema } from "../shipping-webhook.validator";

describe("carrier callback boundary", () => {
    it("fails closed on missing and wrong custom header", () => {
        expect(() => verifyCarrierSecret(undefined, undefined)).toThrow();
        expect(() => verifyCarrierSecret("configured", "wrong")).toThrow();
        expect(() => verifyCarrierSecret("configured", "configured")).not.toThrow();
    });
    it("requires known references, timestamp and integer COD", () => {
        const input = { ShopID: 1, OrderCode: "GHN-1", ClientOrderCode: "digital-e-order-1", Type: "switch_status", Time: "2026-10-14T00:00:00Z", Status: "delivered", CODAmount: 8199000 };
        expect(carrierWebhookSchema.safeParse(input).success).toBe(true);
        expect(carrierWebhookSchema.safeParse({ ...input, CODAmount: -1 }).success).toBe(false);
        expect(carrierWebhookSchema.safeParse({ ...input, Time: "yesterday" }).success).toBe(false);
        expect(carrierWebhookSchema.safeParse({ ...input, ClientOrderCode: "" }).success).toBe(false);
    });
});
