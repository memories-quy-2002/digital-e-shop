import { describe, expect, it } from "vitest";
import { productCreateSchema } from "../products.validator";

const product = { name: "Device", category: "Components", brand: "Test", price: 100000, inventory: 2 };

describe("retired parcel product inputs", () => {
    it("ignores legacy parcel fields instead of persisting GHN-only metadata", () => {
        const parsed = productCreateSchema.parse({
            ...product,
            parcelWeightGrams: "500",
            parcelLengthCm: "20",
            parcelWidthCm: "10",
            parcelHeightCm: "5",
        });

        expect(parsed).toMatchObject(product);
        expect(parsed).not.toHaveProperty("parcelWeightGrams");
        expect(parsed).not.toHaveProperty("parcelLengthCm");
    });
});
