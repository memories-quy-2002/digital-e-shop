import { describe, expect, it } from "vitest";
import { calculateEarnedPoints, calculatePointsDiscount } from "./loyalty.policy";

describe("loyalty policy", () => {
    it.each([
        [0, 0],
        [999, 0],
        [1_000, 1],
        [1_999, 1],
        [2_000, 2],
    ])("awards floor(%s / 1000) points", (eligibleVnd, points) => {
        expect(calculateEarnedPoints(eligibleVnd)).toBe(points);
    });

    it("rejects non-safe and negative earning amounts", () => {
        expect(() => calculateEarnedPoints(-1)).toThrow();
        expect(() => calculateEarnedPoints(Number.MAX_SAFE_INTEGER + 1)).toThrow();
    });

    it("uses one point for one VND and never discounts shipping or more than merchandise", () => {
        expect(calculatePointsDiscount(20_000, 4_000, 8_000)).toBe(8_000);
        expect(calculatePointsDiscount(20_000, 19_000, 8_000)).toBe(1_000);
        expect(calculatePointsDiscount(20_000, 20_000, 8_000)).toBe(0);
    });
});
