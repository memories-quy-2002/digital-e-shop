import { describe, expect, it } from "vitest";
import type { ProductWithAttributes } from "../api";
import { buildComparisonRows, filterComparisonRows } from "./compareMatrix";

const product = (
    id: number,
    attributes: ProductWithAttributes["attributes"],
    specifications: string | null = null,
): ProductWithAttributes => ({
    id,
    name: `Product ${id}`,
    sku: `SKU-${id}`,
    manufacturerPartNumber: null,
    warrantyMonths: null,
    category: "Laptops",
    brand: "Digital-E",
    price: 1000000,
    sale_price: null,
    rating: 0,
    reviews: 0,
    main_image: null,
    stock: 1,
    description: "",
    specifications,
    attributes,
});

describe("comparison matrix", () => {
    it("keeps first-seen order and represents missing values as an em dash", () => {
        expect(buildComparisonRows([
            product(12, [
                { id: "a", key: "memory", label: "Memory", type: "text", value: "16 GB", unit: "", filterable: true },
                { id: "b", key: "storage", label: "Storage", type: "text", value: "1 TB", unit: "", filterable: true },
            ]),
            product(18, [
                { id: "c", key: "memory", label: "Memory", type: "text", value: "32 GB", unit: "", filterable: true },
            ]),
        ])).toEqual([
            { key: "memory", label: "Memory", values: { "12": "16 GB", "18": "32 GB" }, isDifferent: true },
            { key: "storage", label: "Storage", values: { "12": "1 TB", "18": "—" }, isDifferent: true },
        ]);
    });

    it("uses legacy text specifications when structured attributes are absent", () => {
        expect(buildComparisonRows([
            product(30, [], "Display: 14 inch, Weight: 1.2 kg"),
            product(31, [], "Display: 16 inch"),
        ]).map((row) => row.key)).toEqual(["display", "weight"]);
    });

    it("compares values case-insensitively and filters only differing rows", () => {
        const rows = buildComparisonRows([
            product(40, [{ id: "a", key: "panel", label: "Panel", type: "text", value: "OLED", unit: "", filterable: true }]),
            product(41, [{ id: "b", key: "panel", label: "Panel", type: "text", value: " oled ", unit: "", filterable: true }]),
        ]);

        expect(rows[0].isDifferent).toBe(false);
        expect(filterComparisonRows(rows, true)).toEqual([]);
        expect(filterComparisonRows(rows, false)).toEqual(rows);
    });
});
