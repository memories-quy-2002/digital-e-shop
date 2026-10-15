import { describe, expect, it } from "vitest";
import { productCreateSchema } from "../products.validator";
const product = { name: "Device", category: "Components", brand: "Test", price: 100000, inventory: 2 };
describe("product parcel metadata", () => {
    it("parses multipart parcel dimensions and rejects incomplete metadata", () => {
        const parsed = productCreateSchema.parse({ ...product, parcelWeightGrams: "500", parcelLengthCm: "20", parcelWidthCm: "10", parcelHeightCm: "5" });
        expect(parsed).toMatchObject({ parcelWeightGrams: 500, parcelLengthCm: 20, parcelWidthCm: 10, parcelHeightCm: 5 });
        expect(productCreateSchema.safeParse({ ...product, parcelWeightGrams: 500 }).success).toBe(false);
        expect(productCreateSchema.safeParse({ ...product, parcelWeightGrams: 0, parcelLengthCm: 20, parcelWidthCm: 10, parcelHeightCm: 5 }).success).toBe(false);
    });
});
