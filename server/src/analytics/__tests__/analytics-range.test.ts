import { describe, expect, it } from "vitest";
import { resolveAnalyticsRange } from "../analytics-range";

describe("analytics range resolver", () => {
    it("maps supported query values to day counts", () => {
        expect(resolveAnalyticsRange({ range: "7d" })).toEqual({ key: "7d", days: 7 });
        expect(resolveAnalyticsRange({ range: "30d" })).toEqual({ key: "30d", days: 30 });
        expect(resolveAnalyticsRange({ range: "90d" })).toEqual({ key: "90d", days: 90 });
    });

    it("uses the default range for missing or invalid values", () => {
        expect(resolveAnalyticsRange({})).toEqual({ key: "30d", days: 30 });
        expect(resolveAnalyticsRange({ range: "365d" })).toEqual({ key: "30d", days: 30 });
        expect(resolveAnalyticsRange(null)).toEqual({ key: "30d", days: 30 });
    });
});
