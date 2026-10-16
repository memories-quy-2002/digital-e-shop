import { describe, expect, it } from "vitest";
import { assertFulfillmentTransition } from "../fulfillment.policy";

describe("fulfillment lifecycle policy", () => {
    it("allows the packing workflow and prevents jumping to delivery", () => {
        expect(() => assertFulfillmentTransition("UNFULFILLED", "CONFIRMED")).not.toThrow();
        expect(() => assertFulfillmentTransition("PACKED", "READY_TO_SHIP")).not.toThrow();
        expect(() => assertFulfillmentTransition("UNFULFILLED", "DELIVERED")).toThrow();
        expect(() => assertFulfillmentTransition("DELIVERED", "PICKING")).toThrow();
        expect(() => assertFulfillmentTransition("SHIPPED", "DELIVERED")).toThrow();
    });
    it("keeps all historical carrier states read-only", () => {
        for (const state of ["SHIPPED", "DELIVERY_FAILED", "RETURNING", "RETURNED", "DELIVERED"] as const) {
            expect(() => assertFulfillmentTransition(state, "PICKING")).toThrow();
        }
    });
});
