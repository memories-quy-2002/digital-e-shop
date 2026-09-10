import { describe, expect, it } from "vitest";
import {
    getDashboardRangeLabel,
    parseDashboardRange,
} from "./dashboardRange";

describe("dashboard range", () => {
    it.each([
        ["7d", "7d", "Last 7 days"],
        ["30d", "30d", "Last 30 days"],
        ["90d", "90d", "Last 90 days"],
    ])("maps %s to %s and its visible label", (value, range, label) => {
        const parsed = parseDashboardRange(value);
        expect(parsed).toBe(range);
        expect(getDashboardRangeLabel(parsed)).toBe(label);
    });

    it("falls back to the default range for an invalid query value", () => {
        expect(parseDashboardRange("365d")).toBe("30d");
        expect(parseDashboardRange(null)).toBe("30d");
        expect(parseDashboardRange(undefined)).toBe("30d");
    });
});
