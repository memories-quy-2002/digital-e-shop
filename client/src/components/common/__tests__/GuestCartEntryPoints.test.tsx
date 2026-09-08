import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PaginatedItems from "../PaginatedItems";
import HomePage from "../../../pages/HomePage";
import ProductPage from "../../../features/products/pages/ProductPage";
import { LocaleProvider } from "../../../context/LocaleContext";

const mocks = vi.hoisted(() => ({
    cart: {
        addItem: vi.fn(),
    },
    auth: {
        userData: null as { id: string } | null,
        loading: false,
    },
    toast: {
        addToast: vi.fn(),
        toasts: [],
        removeToast: vi.fn(),
    },
    axios: {
        get: vi.fn(),
        post: vi.fn(),
        delete: vi.fn(),
    },
    productsApi: {
        fetchProduct: vi.fn(),
        fetchRelevantProducts: vi.fn(),
        fetchWishlist: vi.fn(),
        fetchReviews: vi.fn(),
        submitReview: vi.fn(),
        addToWishlist: vi.fn(),
        removeFromWishlist: vi.fn(),
    },
}));

vi.mock("../ShopsItem", () => ({
    default: ({
        product,
        uid,
        onAddingCart,
        onToggleWishlist,
    }: {
        product: { id: number; name: string };
        uid: string;
        onAddingCart: (uid: string, productId: number) => void;
        onToggleWishlist: (uid: string, productId: number) => void;
    }) => (
        <article>
            <span>{product.name}</span>
            <button type="button" onClick={() => onAddingCart(uid, product.id)}>
                Add to cart
            </button>
            <button type="button" onClick={() => onToggleWishlist(uid, product.id)}>
                Add to wishlist
            </button>
        </article>
    ),
}));

vi.mock("../WishlistItem", () => ({
    default: () => <div>Wishlist item</div>,
}));

vi.mock("../../../components/common/ProductItem", () => ({
    default: ({
        product,
        uid,
        onAddingCart,
    }: {
        product: { id: number; name: string };
        uid: string;
        onAddingCart: (uid: string, productId: number) => void;
    }) => (
        <article>
            <span>{product.name}</span>
            <button type="button" onClick={() => onAddingCart(uid, product.id)}>
                Add to cart
            </button>
        </article>
    ),
}));

vi.mock("../../../api/axios", () => ({ default: mocks.axios }));

vi.mock("../../../context/AuthContext", () => ({
    useAuth: () => mocks.auth,
}));

vi.mock("../../../context/ToastContext", () => ({
    useToast: () => mocks.toast,
}));

vi.mock("../../../context/CartContext", () => ({
    useCart: () => mocks.cart,
}));

vi.mock("../../../features/products/api", () => mocks.productsApi);

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
    useRecentlyViewed: () => ({ items: [], track: vi.fn(), prune: vi.fn() }),
}));

vi.mock("../../../features/products/components/RecommendedProduct", () => ({
    default: () => <div data-testid="mock-recommended-product" />,
}));

vi.mock("react-helmet", () => ({
    Helmet: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const product = {
    id: 1,
    name: "Digital-E Widget",
    sku: "WIDGET-1",
    manufacturerPartNumber: null,
    warrantyMonths: 12,
    category: "Components",
    brand: "Digital-E",
    price: 100,
    sale_price: null,
    rating: 4,
    reviews: 1,
    main_image: "widget",
    stock: 5,
    available_stock: 5,
    description: "A widget.",
    specifications: "",
    attributes: [],
};

describe("guest cart entry points", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.auth.userData = null;
        mocks.auth.loading = false;
        mocks.cart.addItem.mockResolvedValue(true);
        mocks.axios.get.mockResolvedValue({ status: 200, data: { products: [product] } });
        mocks.axios.post.mockResolvedValue({ status: 200, data: {} });
        mocks.axios.delete.mockResolvedValue({ status: 200, data: {} });
        mocks.productsApi.fetchProduct.mockResolvedValue(product);
        mocks.productsApi.fetchRelevantProducts.mockResolvedValue([]);
        mocks.productsApi.fetchWishlist.mockResolvedValue([]);
        mocks.productsApi.fetchReviews.mockResolvedValue({
            reviews: [],
            summary: { total: 0, average: 0, distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 } },
        });
    });

    it("adds a signed-out home product through CartContext", async () => {
        render(
            <MemoryRouter>
                <LocaleProvider>
                    <HomePage />
                </LocaleProvider>
            </MemoryRouter>,
        );

        fireEvent.click(await screen.findByRole("button", { name: "Add to cart" }));

        await waitFor(() => expect(mocks.cart.addItem).toHaveBeenCalledWith(1, 1));
        expect(mocks.toast.addToast).toHaveBeenCalledWith("Add cart item", expect.stringContaining("success"));
    });

    it("shows an error instead of success when the home cart mutation fails", async () => {
        mocks.cart.addItem.mockResolvedValue(false);

        render(
            <MemoryRouter>
                <LocaleProvider>
                    <HomePage />
                </LocaleProvider>
            </MemoryRouter>,
        );

        fireEvent.click(await screen.findByRole("button", { name: "Add to cart" }));

        await waitFor(() => expect(mocks.toast.addToast).toHaveBeenCalledWith(
            "Add cart item",
            "Unable to add item to cart.",
        ));
        expect(mocks.toast.addToast).not.toHaveBeenCalledWith(
            "Add cart item",
            expect.stringContaining("success"),
        );
    });

    it("adds a signed-out catalog product through CartContext while keeping wishlist protected", async () => {
        render(
            <PaginatedItems
                itemsPerPage={6}
                items={[product]}
                uid=""
                wishlist={[]}
                isWishlistPage={false}
            />,
        );

        fireEvent.click(screen.getByRole("button", { name: "Add to cart" }));
        await waitFor(() => expect(mocks.cart.addItem).toHaveBeenCalledWith(1, 1));

        fireEvent.click(screen.getByRole("button", { name: "Add to wishlist" }));
        expect(mocks.toast.addToast).toHaveBeenCalledWith("Login required", "You need to login to use this feature.");
    });

    it("shows an error instead of success when the catalog cart mutation fails", async () => {
        mocks.cart.addItem.mockResolvedValue(false);

        render(
            <PaginatedItems
                itemsPerPage={6}
                items={[product]}
                uid=""
                wishlist={[]}
                isWishlistPage={false}
            />,
        );

        fireEvent.click(screen.getByRole("button", { name: "Add to cart" }));

        await waitFor(() => expect(mocks.toast.addToast).toHaveBeenCalledWith(
            "Add cart item",
            "Unable to add item to cart.",
        ));
        expect(mocks.toast.addToast).not.toHaveBeenCalledWith(
            "Add cart item",
            expect.stringContaining("success"),
        );
    });

    it("adds a signed-out product-detail item through CartContext", async () => {
        render(
            <MemoryRouter initialEntries={["/product?id=1"]}>
                <LocaleProvider>
                    <ProductPage />
                </LocaleProvider>
            </MemoryRouter>,
        );

        fireEvent.click(await screen.findByRole("button", { name: "Add to cart" }));

        await waitFor(() => expect(mocks.cart.addItem).toHaveBeenCalledWith(1, 1));
        expect(mocks.toast.addToast).toHaveBeenCalledWith("Add cart item", expect.stringContaining("success"));
    });

    it("shows an error instead of success when the product-detail cart mutation fails", async () => {
        mocks.cart.addItem.mockResolvedValue(false);

        render(
            <MemoryRouter initialEntries={["/product?id=1"]}>
                <LocaleProvider>
                    <ProductPage />
                </LocaleProvider>
            </MemoryRouter>,
        );

        fireEvent.click(await screen.findByRole("button", { name: "Add to cart" }));

        await waitFor(() => expect(mocks.toast.addToast).toHaveBeenCalledWith(
            "Add cart item",
            "Unable to add item to cart.",
        ));
        expect(mocks.toast.addToast).not.toHaveBeenCalledWith(
            "Add cart item",
            expect.stringContaining("success"),
        );
    });
});
