import { describe, expect, it } from "vitest";
import { productAttributesSchema, productCreateSchema, productUpdateSchema } from "../products.validator";

describe("product commerce identity validation", () => {
    it("keeps SKU optional for new products and validates warranty months", () => {
        const parsed = productCreateSchema.parse({
            name: "GPU",
            category: "Components",
            brand: "Digital-E",
            price: "499.99",
            inventory: "4",
            warrantyMonths: "24",
        });

        expect(parsed.sku).toBeUndefined();
        expect(parsed.warrantyMonths).toBe(24);
    });

    it("requires SKU when an existing product is edited", () => {
        expect(() => productUpdateSchema.parse({ name: "Renamed GPU" })).toThrow(/SKU is required/);
        expect(productUpdateSchema.parse({ sku: "GPU-000001", warrantyMonths: 36 })).toMatchObject({
            sku: "GPU-000001",
            warrantyMonths: 36,
        });
    });

    it("rejects negative warranty months", () => {
        expect(() => productCreateSchema.parse({
            name: "GPU",
            category: "Components",
            brand: "Digital-E",
            price: 499.99,
            inventory: 4,
            warrantyMonths: -1,
        })).toThrow(/Warranty cannot be negative/);
    });

    it("parses typed text and number attributes with normalized keys", () => {
        const parsed = productCreateSchema.parse({
            name: "Example GPU",
            category: "GPU",
            brand: "Example",
            price: 500,
            inventory: 5,
            attributes: [
                { key: "VRAM GB", label: "VRAM", type: "number", numberValue: 12, unit: "GB", filterable: true },
                { key: "memory_type", label: "Memory Type", type: "text", textValue: "GDDR7", filterable: true },
            ],
        });

        expect(parsed.attributes).toMatchObject([
            { key: "vram_gb", type: "number", numberValue: 12 },
            { key: "memory_type", type: "text", textValue: "GDDR7" },
        ]);
    });

    it("rejects duplicate keys and missing number values", () => {
        expect(() => productAttributesSchema.parse([
            { key: "socket", label: "Socket", type: "text", textValue: "AM5" },
            { key: "SOCKET", label: "Socket 2", type: "text", textValue: "LGA1700" },
        ])).toThrow(/Duplicate attribute key/);

        expect(() => productAttributesSchema.parse([
            { key: "vram_gb", label: "VRAM", type: "number" },
        ])).toThrow();
    });
});
