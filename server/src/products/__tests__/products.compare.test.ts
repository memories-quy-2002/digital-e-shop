import { describe, expect, it } from "vitest";
import {
    assertComparisonCategory,
    ComparisonValidationError,
    normalizeComparisonAttributes,
    parseComparisonIds,
} from "../products.compare";

describe("product comparison policies", () => {
    it.each([
        ["", "COMPARE_INVALID_IDS"],
        ["12", "COMPARE_INVALID_IDS"],
        ["12,12", "COMPARE_INVALID_IDS"],
        ["12,18,24,30,42", "COMPARE_INVALID_IDS"],
        ["12,zero", "COMPARE_INVALID_IDS"],
        ["12,-4", "COMPARE_INVALID_IDS"],
    ])("rejects invalid ids %s", (value, code) => {
        expect(() => parseComparisonIds(value)).toThrowError(
            expect.objectContaining({ code }),
        );
    });

    it("preserves distinct positive ids in order", () => {
        expect(parseComparisonIds("24, 12, 18")).toEqual([24, 12, 18]);
    });

    it("rejects different categories and accepts one category", () => {
        expect(() => assertComparisonCategory([
            { id: 12, categoryId: 3, category: "Laptops" },
            { id: 18, categoryId: 4, category: "Phones" },
        ])).toThrowError(
            expect.objectContaining({ code: "COMPARE_CATEGORY_MISMATCH" }),
        );

        expect(() => assertComparisonCategory([
            { id: 12, categoryId: 3, category: "Laptops" },
            { id: 18, categoryId: 3, category: "Laptops" },
        ])).not.toThrow();
    });

    it("exposes the status and code on validation errors", () => {
        expect(new ComparisonValidationError(
            "COMPARE_INVALID_IDS",
            "Two to four valid products are required.",
            400,
        )).toMatchObject({ code: "COMPARE_INVALID_IDS", statusCode: 400 });
    });

    it("normalizes typed attributes to comparison-safe string values", () => {
        expect(normalizeComparisonAttributes([
            { key: "screen_size", label: "Screen size", type: "number", numberValue: 15.6, unit: "in" },
            { key: "panel", label: "Panel", type: "text", textValue: "OLED" },
        ])).toEqual([
            { key: "screen_size", label: "Screen size", type: "number", value: "15.6", unit: "in" },
            { key: "panel", label: "Panel", type: "text", value: "OLED", unit: "" },
        ]);
    });
});
