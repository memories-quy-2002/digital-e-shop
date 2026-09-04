import { describe, expect, it } from "vitest";
import { formatProductRating, normalizeProduct, normalizeProducts } from "../product";

describe("normalizeProduct", () => {
    it("converts MySQL string fields into the Product numeric contract", () => {
        const product = normalizeProduct({
            id: "190",
            name: "Demo Intel Core Ultra Kit",
            category: "PC",
            brand: "Intel",
            price: "449.00",
            sale_price: "419.00",
            rating: "4.0",
            reviews: "2",
            stock: "39",
            main_image: null,
            description: "Desktop kit",
            specifications: "Core Ultra 7, integrated graphics",
        });

        expect(product).toMatchObject({
            id: 190,
            price: 449,
            sale_price: 419,
            rating: 4,
            reviews: 2,
            stock: 39,
        });
    });

    it("keeps absent sale prices null and rejects invalid collection values", () => {
        expect(normalizeProduct({ id: "bad", sale_price: "", price: "bad" })).toMatchObject({
            id: 0,
            price: 0,
            sale_price: null,
        });
        expect(normalizeProducts(null)).toEqual([]);
    });
});

describe("formatProductRating", () => {
    it("formats numeric strings returned by MySQL", () => {
        expect(formatProductRating("4.0")).toBe("4.0");
    });
});
