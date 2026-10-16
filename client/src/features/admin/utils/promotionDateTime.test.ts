import { describe, expect, it } from "vitest";
import { formatPromotionDateTimeInput, localPromotionDateTimeToIso } from "./promotionDateTime";

describe("promotion local date-time conversion", () => {
    it("round-trips a stored UTC instant through the local date-time input", () => {
        const saved = "2026-03-04T15:26:00.000Z";
        expect(localPromotionDateTimeToIso(formatPromotionDateTimeInput(saved))).toBe(saved);
    });

    it("returns an empty value for absent or invalid input", () => {
        expect(formatPromotionDateTimeInput(null)).toBe("");
        expect(localPromotionDateTimeToIso("")).toBeNull();
        expect(localPromotionDateTimeToIso("not-a-date")).toBeNull();
    });
});
