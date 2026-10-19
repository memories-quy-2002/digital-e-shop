import { describe, expect, it } from "vitest";
import { formatVietnamDateTime, getDefaultVietnamSchedule, toVietnamDateTimeInput } from "./deliveryTime";

describe("Vietnam delivery schedule time", () => {
    it("round trips UTC assignment times as Vietnam local input", () => {
        const input = toVietnamDateTimeInput("2026-10-16T02:00:00.000Z");
        expect(input).toBe("2026-10-16T09:00");
        expect(formatVietnamDateTime("2026-10-16T02:00:00.000Z", "en")).toContain("09:00");
    });

    it("creates a forward schedule in Vietnam local time", () => {
        expect(getDefaultVietnamSchedule(new Date("2026-10-16T02:00:00.000Z"))).toEqual({
            start: "2026-10-16T10:00",
            end: "2026-10-16T12:00",
        });
    });

});
