import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "../../../context/LocaleContext";
import RecommendedProduct from "../../../features/products/components/RecommendedProduct";
import { Product } from "../../../types/product";
import ProductCard from "../ProductCard";
import RecentlyViewedStrip from "../RecentlyViewedStrip";

const product: Product = {
    id: 190,
    name: "Demo Intel Core Ultra Kit",
    sku: "INTEL-DEMO-190",
    manufacturerPartNumber: null,
    warrantyMonths: null,
    category: "PC",
    brand: "Intel",
    price: 449,
    sale_price: 419,
    rating: 4,
    reviews: 2,
    main_image: null,
    stock: 39,
    description: "Desktop kit",
    specifications: "Core Ultra 7",
};

describe("catalog product media surfaces", () => {
    it("uses the shared fixed media frame across cards, recently viewed, and recommendations", () => {
        render(
            <LocaleProvider>
                <MemoryRouter>
                    <ProductCard
                        product={product}
                        uid=""
                        isWishlist={false}
                        onToggleWishlist={vi.fn()}
                        onAddingCart={vi.fn()}
                    />
                    <RecentlyViewedStrip items={[product]} />
                    <RecommendedProduct relevantProducts={[product]} />
                </MemoryRouter>
            </LocaleProvider>,
        );

        expect(screen.getByTestId("product-card-image")).toHaveClass("de-product-media");
        expect(screen.getByTestId("recently-viewed-image")).toHaveClass("de-product-media");
        expect(screen.getByTestId("recommendation-image")).toHaveClass(
            "de-product-media",
            "product-page__recommendation-image--fixed",
        );
    });

    it("renders recently viewed sale prices with one currency prefix", () => {
        render(
            <LocaleProvider>
                <RecentlyViewedStrip items={[product]} />
            </LocaleProvider>,
        );

        expect(screen.getByText(/419\s+₫/)).toBeInTheDocument();
        expect(screen.queryByText(/\$419/)).not.toBeInTheDocument();
    });
});
