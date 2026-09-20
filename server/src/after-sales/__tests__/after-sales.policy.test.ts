import { describe, expect, it } from "vitest";
import { assertTransition, evaluateEligibility } from "../after-sales.policy";

describe("after-sales policy", () => {
    it("allows a return through the inclusive seven-day UTC boundary", () => {
        expect(evaluateEligibility({
            kind: "RETURN",
            orderStatus: 1,
            deliveredAt: "2026-09-01T00:00:00.000Z",
            warrantyMonths: null,
            now: "2026-09-08T00:00:00.000Z",
        })).toMatchObject({ eligible: true });
    });

    it("rejects canceled, undelivered, and expired return orders", () => {
        expect(evaluateEligibility({
            kind: "RETURN",
            orderStatus: 2,
            deliveredAt: "2026-09-01T00:00:00.000Z",
            warrantyMonths: null,
            now: "2026-09-02T00:00:00.000Z",
        })).toMatchObject({ eligible: false, code: "ORDER_NOT_ELIGIBLE" });
        expect(evaluateEligibility({
            kind: "RETURN",
            orderStatus: 1,
            deliveredAt: null,
            warrantyMonths: null,
            now: "2026-09-02T00:00:00.000Z",
        })).toMatchObject({ eligible: false, code: "ORDER_NOT_DELIVERED" });
        expect(evaluateEligibility({
            kind: "RETURN",
            orderStatus: 1,
            deliveredAt: "2026-09-01T00:00:00.000Z",
            warrantyMonths: null,
            now: "2026-09-09T00:00:00.000Z",
        })).toMatchObject({ eligible: false, code: "RETURN_WINDOW_EXPIRED" });
    });

    it("uses the item warranty snapshot for warranty eligibility", () => {
        expect(evaluateEligibility({
            kind: "WARRANTY",
            orderStatus: 1,
            deliveredAt: "2026-01-15T00:00:00.000Z",
            warrantyMonths: 6,
            now: "2026-07-15T00:00:00.000Z",
        })).toMatchObject({ eligible: true });
        expect(evaluateEligibility({
            kind: "WARRANTY",
            orderStatus: 1,
            deliveredAt: "2026-01-15T00:00:00.000Z",
            warrantyMonths: 0,
            now: "2026-02-01T00:00:00.000Z",
        })).toMatchObject({ eligible: false, code: "WARRANTY_NOT_ACTIVE" });
    });

    it("allows only legal state transitions", () => {
        expect(() => assertTransition("REQUESTED", "APPROVED")).not.toThrow();
        expect(() => assertTransition("APPROVED", "RECEIVED")).not.toThrow();
        expect(() => assertTransition("RECEIVED", "REFUND_PENDING")).not.toThrow();
        expect(() => assertTransition("REFUND_PENDING", "REFUNDED")).not.toThrow();
        expect(() => assertTransition("REFUNDED", "APPROVED")).toThrow("Invalid after-sales status transition");
    });
});
