import { MemoryRouter } from "react-router-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "../../../context/LocaleContext";
import { ComparisonProvider } from "../../../context/ComparisonContext";

const toastMock = vi.hoisted(() => ({ addToast: vi.fn() }));

vi.mock("../../../context/ToastContext", () => ({
    useToast: () => toastMock,
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
    beforeEach(() => {
        window.localStorage.clear();
        toastMock.addToast.mockClear();
    });

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

    it("exposes selected comparison styling after selection", () => {
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

        fireEvent.click(screen.getByRole("button", { name: "Add to compare" }));

        expect(screen.getByRole("button", { name: "Remove from compare" })).toHaveClass("border-electric");
    });

    it("rejects products from a different category with feedback", () => {
        const phoneProduct = { ...product, id: 191, name: "Demo Phone", category: "Phones" };

        toastMock.addToast.mockClear();
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
                    <ProductCard
                        product={phoneProduct}
                        uid=""
                        isWishlist={false}
                        onToggleWishlist={vi.fn()}
                        onAddingCart={vi.fn()}
                    />
                </MemoryRouter></ComparisonProvider>
            </LocaleProvider>,
        );

        const addButtons = screen.getAllByRole("button", { name: "Add to compare" });
        fireEvent.click(addButtons[0]);
        fireEvent.click(addButtons[1]);

        expect(screen.getAllByRole("button", { name: "Remove from compare" })).toHaveLength(1);
        expect(toastMock.addToast).toHaveBeenCalledWith(
            "Choose products from one category",
            "Products from different categories cannot be compared together.",
        );
    });

    it("limits comparison selection to four products with feedback", () => {
        const products = Array.from({ length: 5 }, (_, index) => ({
            ...product,
            id: product.id + index,
            name: `Demo Product ${index + 1}`,
        }));

        toastMock.addToast.mockClear();
        render(
            <LocaleProvider>
                <ComparisonProvider><MemoryRouter>
                    {products.map((item) => (
                        <ProductCard
                            key={item.id}
                            product={item}
                            uid=""
                            isWishlist={false}
                            onToggleWishlist={vi.fn()}
                            onAddingCart={vi.fn()}
                        />
                    ))}
                </MemoryRouter></ComparisonProvider>
            </LocaleProvider>,
        );

        screen.getAllByRole("button", { name: "Add to compare" }).slice(0, 4).forEach((button) => fireEvent.click(button));
        fireEvent.click(screen.getByRole("button", { name: "Add to compare" }));

        expect(screen.getAllByRole("button", { name: "Remove from compare" })).toHaveLength(4);
        expect(toastMock.addToast).toHaveBeenCalledWith(
            "Comparison list is full",
            "You can compare up to four products at a time.",
        );
    });
});
