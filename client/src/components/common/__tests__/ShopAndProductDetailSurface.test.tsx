import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PaginatedItems from "../PaginatedItems";
import ProductPage from "../../../features/products/pages/ProductPage";
import { LocaleProvider } from "../../../context/LocaleContext";

const apiMocks = vi.hoisted(() => ({
    fetchProduct: vi.fn(),
    fetchRelevantProducts: vi.fn(),
    fetchWishlist: vi.fn(),
    fetchReviews: vi.fn(),
    submitReview: vi.fn(),
    addToWishlist: vi.fn(),
    removeFromWishlist: vi.fn(),
}));

const toastMocks = vi.hoisted(() => ({
    addToast: vi.fn(),
    toasts: [],
    removeToast: vi.fn(),
}));

const cartMocks = vi.hoisted(() => ({
    addItem: vi.fn(),
}));

vi.mock("../ShopsItem", () => ({
    default: ({ product }: { product: { name: string } }) => <div>{product.name}</div>,
}));

vi.mock("../WishlistItem", () => ({
    default: () => <div>Wishlist item</div>,
}));

vi.mock("../../../api/axios", () => ({
    default: {
        post: vi.fn(),
        delete: vi.fn(),
    },
}));

vi.mock("../../../features/products/api", () => apiMocks);

vi.mock("../../../context/AuthContext", () => ({
    useAuth: () => ({ userData: null, loading: false, setUserData: vi.fn() }),
}));

vi.mock("../../../context/CartContext", () => ({
    useCart: () => cartMocks,
}));

vi.mock("../../../context/ToastContext", async () => {
    const actual = await vi.importActual<typeof import("../../../context/ToastContext")>("../../../context/ToastContext");
    return {
        ...actual,
        useToast: () => toastMocks,
    };
});

vi.mock("../../../components/layout/Layout", () => ({
    default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("../../../components/common/ImageLightbox", () => ({
    default: () => null,
}));

vi.mock("../../../utils/LazyLoadingImage", () => ({
    default: ({ src, alt, ...props }: { src: string; alt: string; [key: string]: unknown }) => {
        const { eager, ...imageProps } = props;
        void eager;
        return <img src={src} alt={alt} {...imageProps} />;
    },
}));

vi.mock("../../../hooks/useRecentlyViewed", () => ({
    useRecentlyViewed: () => ({ track: vi.fn() }),
}));

vi.mock("../../../features/products/components/RecommendedProduct", () => ({
    default: () => <div data-testid="mock-recommended-product" />,
}));

vi.mock("react-helmet", () => ({
    Helmet: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const product = {
    id: 1,
    name: "Dell XPS 13 OLED 9320",
    sku: "DELL-XPS-13",
    manufacturerPartNumber: null,
    warrantyMonths: 24,
    category: "Laptop",
    brand: "Dell",
    price: 1599,
    sale_price: 1399,
    rating: 4.5,
    reviews: 2,
    main_image: "dell-xps-13-oled-9320",
    stock: 5,
    available_stock: 5,
    description: "A premium laptop.",
    specifications: "13.4-inch OLED",
    attributes: [],
};

describe("shop and product detail surfaces", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        apiMocks.fetchProduct.mockResolvedValue(product);
        apiMocks.fetchRelevantProducts.mockResolvedValue([]);
        apiMocks.fetchWishlist.mockResolvedValue([]);
        apiMocks.fetchReviews.mockResolvedValue({
            reviews: [],
            summary: { total: 0, average: 0, distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 } },
        });
    });

    it("renders pagination with styles that match react-paginate output", () => {
        render(
            <PaginatedItems
                itemsPerPage={6}
                items={Array.from({ length: 7 }, (_, index) => ({ ...product, id: index + 1 }))}
                uid=""
                wishlist={[]}
                isWishlistPage={false}
                serverSide
                totalItems={7}
                currentPage={1}
                onPageChange={vi.fn()}
            />,
        );

        expect(screen.getByRole("navigation", { name: "Pagination" })).toHaveClass("shops__pagination");
        expect(screen.getAllByRole("listitem")[0]).toHaveClass("shops__pagination__item");
        expect(screen.getByRole("button", { name: "Previous page" }).parentElement).toHaveClass("shops__pagination__item--edge");
        expect(screen.getByRole("button", { name: "Next page" }).parentElement).toHaveClass("shops__pagination__item--edge");
        expect(screen.getByRole("button", { name: "Page-1" })).toHaveClass("shops__pagination__link");
    });

    it("keeps quantity availability and reviews in explicit layout regions", async () => {
        render(
            <MemoryRouter initialEntries={["/product?id=1"]}>
                <LocaleProvider>
                    <ProductPage />
                </LocaleProvider>
            </MemoryRouter>,
        );

        expect(await screen.findByTestId("product-quantity-field")).toHaveClass("product-page__quantity-field");
        expect(screen.getByTestId("product-availability")).toHaveClass("product-page__availability");

        fireEvent.click(screen.getByRole("button", { name: /Reviews/ }));

        expect(screen.getByTestId("product-reviews-card")).toHaveClass("product-page__reviews-card");
        expect(screen.getByTestId("product-reviews-summary")).toHaveClass("product-page__reviews-summary");
        expect(screen.getByTestId("product-reviews-list")).toHaveClass("product-page__reviews-list");
    });

    it("places recommendations before the product detail tabs", async () => {
        render(
            <MemoryRouter initialEntries={["/product?id=1"]}>
                <LocaleProvider>
                    <ProductPage />
                </LocaleProvider>
            </MemoryRouter>,
        );

        const recommendations = await screen.findByTestId("product-recommendations-shell");
        const tabs = screen.getByTestId("product-tabs");

        expect(recommendations.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(screen.getByTestId("product-gallery-main")).toHaveClass("product-page__gallery-main--fixed");
    });
});
