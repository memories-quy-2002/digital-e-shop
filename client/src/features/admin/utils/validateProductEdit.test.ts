import { describe, expect, it } from "vitest";
import { validateProductEdit } from "./validateProductEdit";

describe("validateProductEdit", () => {
    it("requires the identity and base price fields", () => {
        expect(validateProductEdit({
            name: "",
            sku: "",
            category: "",
            brand: "",
            price: "",
            salePrice: "",
            warrantyMonths: "",
        })).toEqual({
            name: "Product name is required.",
            sku: "SKU is required.",
            category: "Category is required.",
            brand: "Brand is required.",
            price: "Price must be a valid non-negative number.",
        });
    });

    it("allows blank optional pricing metadata and rejects invalid values", () => {
        expect(validateProductEdit({
            name: "Product",
            sku: "SKU-1",
            category: "Category",
            brand: "Brand",
            price: 0,
            salePrice: -1,
            warrantyMonths: "12.5",
        })).toEqual({
            salePrice: "Sale price must be empty or a valid non-negative number.",
            warrantyMonths: "Warranty must be empty or a whole non-negative number of months.",
        });
    });
});
