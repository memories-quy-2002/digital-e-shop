import { describe, it, expect } from "vitest";
import { formatUtcDate, formatUtcDateTime, toUtcIsoString } from "../dateTime";

describe("formatUtcDate", () => {
    it("returns Invalid date for unparseable input", () => {
        expect(formatUtcDate("not-a-real-date")).toBe("Invalid date");
    });

    it("falls back to current time for empty string", () => {
        const now = new Date();
        const expected = new Intl.DateTimeFormat("en-GB", {
            timeZone: "UTC",
            day: "2-digit",
            month: "short",
            year: "numeric",
        }).format(now);
        expect(formatUtcDate("")).toBe(expected);
    });

    it("falls back to current time for null", () => {
        const now = new Date();
        const expected = new Intl.DateTimeFormat("en-GB", {
            timeZone: "UTC",
            day: "2-digit",
            month: "short",
            year: "numeric",
        }).format(now);
        expect(formatUtcDate(null)).toBe(expected);
    });

    it("uses UTC regardless of the system timezone", () => {
        const date = new Date(Date.UTC(2025, 0, 5, 23, 0, 0));
        const result = formatUtcDate(date);
        expect(result).toBe("05 Jan 2025");
    });

    it("accepts an ISO string input", () => {
        const result = formatUtcDate("2025-01-05T00:00:00.000Z");
        expect(result).toBe("05 Jan 2025");
    });

    it("falls back to current time when no value is provided", () => {
        const result = formatUtcDate(undefined);
        const now = new Date();
        const expected = new Intl.DateTimeFormat("en-GB", {
            timeZone: "UTC",
            day: "2-digit",
            month: "short",
            year: "numeric",
        }).format(now);
        expect(result).toBe(expected);
    });
});

describe("formatUtcDateTime", () => {
    it("returns Invalid date for bad input", () => {
        expect(formatUtcDateTime("garbage")).toBe("Invalid date");
    });

    it("appends UTC suffix", () => {
        const date = new Date(Date.UTC(2025, 5, 15, 12, 30, 0));
        const result = formatUtcDateTime(date);
        expect(result).toMatch(/UTC$/);
        expect(result).toContain("15 Jun 2025");
    });

    it("renders hours and minutes in two-digit format", () => {
        const date = new Date(Date.UTC(2025, 0, 1, 9, 5, 0));
        const result = formatUtcDateTime(date);
        expect(result).toMatch(/\b09:05\b/);
    });
});

describe("toUtcIsoString", () => {
    it("returns the current ISO string for invalid input", () => {
        const before = new Date().toISOString();
        const result = toUtcIsoString("not-valid");
        const after = new Date().toISOString();
        expect(result >= before && result <= after).toBe(true);
    });

    it("converts a Date to ISO string", () => {
        const date = new Date("2025-03-10T08:00:00.000Z");
        expect(toUtcIsoString(date)).toBe("2025-03-10T08:00:00.000Z");
    });

    it("preserves timezone of the original date", () => {
        const result = toUtcIsoString("2025-03-10T10:00:00+02:00");
        expect(result).toBe("2025-03-10T08:00:00.000Z");
    });

    it("returns current ISO when called with undefined", () => {
        const result = toUtcIsoString(undefined);
        expect(() => new Date(result).toISOString()).not.toThrow();
    });
});
