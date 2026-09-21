import { MemoryRouter } from "react-router-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "../../../context/LocaleContext";
import { ComparisonProvider } from "../../../context/ComparisonContext";

vi.mock("../../../context/ToastContext", () => ({
    useToast: () => ({ addToast: vi.fn() }),
}));
import ProductCard from "../ProductCard";

const product = {
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

describe("ProductCard", () => {
    it("exposes one shared product link and accessible card actions", () => {
        render(
            <LocaleProvider>
                <ComparisonProvider><MemoryRouter>
                    <ProductCard
                        product={product}
                        uid=""
                        isWishlist={false}
                        onToggleWishlist={vi.fn()}
                        onAddingCart={vi.fn()}
                    />
                </MemoryRouter></ComparisonProvider>
            </LocaleProvider>,
        );

        expect(screen.getByRole("link", { name: product.name })).toHaveAttribute("href", "/product?id=190");
        expect(screen.getByRole("button", { name: "Save to wishlist" })).toHaveAttribute("aria-pressed", "false");
        expect(screen.getByRole("button", { name: /Add to cart/i })).toBeEnabled();
    });

    it("keeps the product media full-width without a hover border treatment", () => {
        render(
            <LocaleProvider>
                <ComparisonProvider><MemoryRouter>
                    <ProductCard
                        product={product}
                        uid=""
                        isWishlist={false}
                        onToggleWishlist={vi.fn()}
                        onAddingCart={vi.fn()}
                    />
                </MemoryRouter></ComparisonProvider>
            </LocaleProvider>,
        );

        const media = screen.getByTestId("product-card-image");

        expect(media).toHaveClass("w-full", "max-w-none");
        expect(media).not.toHaveClass("group-hover:border-electric");
    });

    it("keeps product content scannable with discount, rating, price, and stock", () => {
        render(
            <LocaleProvider>
                <ComparisonProvider><MemoryRouter>
                    <ProductCard
                        product={product}
                        uid=""
                        isWishlist={false}
                        onToggleWishlist={vi.fn()}
                        onAddingCart={vi.fn()}
                    />
                </MemoryRouter></ComparisonProvider>
            </LocaleProvider>,
        );

        expect(screen.getByTestId("product-card-price")).toHaveTextContent("419");
        expect(screen.getByTestId("product-card-rating")).toHaveTextContent("4.0");
        expect(screen.getByTestId("product-card-stock")).toHaveTextContent("39");
        expect(screen.getByText("-7%")).toBeInTheDocument();
    });

    it("toggles comparison selection with an accessible pressed state", () => {
        render(
            <LocaleProvider>
                <ComparisonProvider><MemoryRouter>
                    <ProductCard
                        product={product}
                        uid=""
                        isWishlist={false}
                        onToggleWishlist={vi.fn()}
                        onAddingCart={vi.fn()}
                    />
                </MemoryRouter></ComparisonProvider>
            </LocaleProvider>,
        );

        const addButton = screen.getByRole("button", { name: "Add to compare" });
        expect(addButton).toHaveAttribute("aria-pressed", "false");
        fireEvent.click(addButton);

        expect(screen.getByRole("button", { name: "Remove from compare" })).toHaveAttribute("aria-pressed", "true");
    });
});
