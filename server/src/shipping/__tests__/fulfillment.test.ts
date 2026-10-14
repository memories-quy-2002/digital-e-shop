import { describe, expect, it } from "vitest";
import { assertFulfillmentTransition, assertCanShip, carrierState } from "../fulfillment.policy";

describe("fulfillment lifecycle policy", () => {
    it("allows the packing workflow and prevents jumping to delivery", () => {
        expect(() => assertFulfillmentTransition("UNFULFILLED", "CONFIRMED")).not.toThrow();
        expect(() => assertFulfillmentTransition("PACKED", "READY_TO_SHIP")).not.toThrow();
        expect(() => assertFulfillmentTransition("UNFULFILLED", "DELIVERED")).toThrow();
        expect(() => assertFulfillmentTransition("DELIVERED", "PICKING")).toThrow();
        expect(() => assertFulfillmentTransition("SHIPPED", "CANCELED")).toThrow();
    });
    it("requires ready state, VND, pending order, and genuine paid PayOS", () => {
        const order = { status: 0, currency: "VND", provider: "cash", paymentStatus: "pending", simulated: false };
        expect(() => assertCanShip("READY_TO_SHIP", order)).not.toThrow();
        expect(() => assertCanShip("PACKED", order)).toThrow();
        expect(() => assertCanShip("READY_TO_SHIP", { ...order, provider: "payos", paymentStatus: "paid", simulated: true })).toThrow();
        expect(() => assertCanShip("READY_TO_SHIP", { ...order, provider: "payos" })).toThrow();
        expect(() => assertCanShip("READY_TO_SHIP", { ...order, status: 1 })).toThrow();
        expect(() => assertCanShip("READY_TO_SHIP", { ...order, currency: "USD" })).toThrow();
    });
    it("never maps unknown or packing provider events to completed delivery", () => {
        expect(carrierState("UNKNOWN")).toBe(null);
        expect(carrierState("DELIVERED")).toBe("DELIVERED");
        expect(carrierState("IN_TRANSIT")).toBe("SHIPPED");
    });
});
