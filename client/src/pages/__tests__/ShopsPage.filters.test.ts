import { describe, expect, it } from "vitest";
import { parseShopPriceRange } from "../ShopsPage";

describe("parseShopPriceRange", () => {
    it("keeps the default range when price params are missing", () => {
        expect(parseShopPriceRange(null, null, [0, 5000])).toEqual([0, 5000]);
    });

    it("uses numeric query params when they are present", () => {
        expect(parseShopPriceRange("25", "1200", [0, 5000])).toEqual([25, 1200]);
    });

    it("falls back independently for invalid price params", () => {
        expect(parseShopPriceRange("invalid", "", [10, 900])).toEqual([10, 900]);
    });
});
