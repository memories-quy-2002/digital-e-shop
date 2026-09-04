import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ProductCard from "../ProductCard";

const product = {
    id: 190,
    name: "Demo Intel Core Ultra Kit",
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
            <MemoryRouter>
                <ProductCard
                    product={product}
                    uid=""
                    isWishlist={false}
                    onToggleWishlist={vi.fn()}
                    onAddingCart={vi.fn()}
                />
            </MemoryRouter>,
        );

        expect(screen.getByRole("link", { name: product.name })).toHaveAttribute("href", "/product?id=190");
        expect(screen.getByRole("button", { name: "Add to wishlist" })).toHaveAttribute("aria-pressed", "false");
        expect(screen.getByRole("button", { name: /Add to cart/i })).toBeEnabled();
    });
});
