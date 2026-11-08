import { describe, expect, it } from "vitest";
import { buildProductStructuredData, serializeStructuredData } from "./productStructuredData";
import type { Product } from "../../types/product";

const product: Product = {
    id: 7,
    name: "Laptop",
    sku: "LAP-7",
    manufacturerPartNumber: null,
    warrantyMonths: 12,
    category: "Laptop",
    brand: "Digital",
    price: 25000000,
    sale_price: 22000000,
    rating: 4.5,
    reviews: 8,
    main_image: null,
    stock: 3,
    available_stock: 0,
    description: "Portable computer",
    specifications: null,
};

describe("product structured data", () => {
    it("uses the displayed sale price and available stock", () => {
        expect(buildProductStructuredData(product, "https://shop.test/product?id=7", "image.webp")).toMatchObject({
            "@type": "Product",
            name: "Laptop",
            offers: {
                "@type": "Offer",
                priceCurrency: "VND",
                price: 22000000,
                availability: "https://schema.org/OutOfStock",
            },
            aggregateRating: { ratingValue: 4.5, reviewCount: 8 },
        });
    });

    it("escapes script closing characters before embedding JSON-LD", () => {
        expect(serializeStructuredData({ name: "</script>" })).toBe('{"name":"\\u003c/script>"}');
    });
});
