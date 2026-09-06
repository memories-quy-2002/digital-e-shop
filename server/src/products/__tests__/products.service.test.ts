import { describe, expect, it } from "vitest";
import { productCreateSchema, productUpdateSchema } from "../products.validator";

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
});
