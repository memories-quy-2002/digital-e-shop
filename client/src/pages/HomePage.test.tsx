import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HomePage from "./HomePage";

const mocks = vi.hoisted(() => ({
    axiosGet: vi.fn(),
    axiosPost: vi.fn(),
    axiosDelete: vi.fn(),
    addItem: vi.fn(),
    addToast: vi.fn(),
    fetchProduct: vi.fn(),
    trackRecentlyViewed: vi.fn(),
    pruneRecentlyViewed: vi.fn(),
}));

vi.mock("../components/layout/Layout", () => ({
    default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("../api/axios", () => ({
    default: {
        get: mocks.axiosGet,
        post: mocks.axiosPost,
        delete: mocks.axiosDelete,
    },
}));

vi.mock("../context/AuthContext", () => ({
    useAuth: () => ({ userData: null, loading: false }),
}));

vi.mock("../context/CartContext", () => ({
    useCart: () => ({ addItem: mocks.addItem }),
}));

vi.mock("../context/ToastContext", () => ({
    useToast: () => ({ addToast: mocks.addToast }),
}));

vi.mock("../features/products/api", () => ({
    fetchProduct: mocks.fetchProduct,
}));

vi.mock("../hooks/useT", () => ({
    useT: () => (key: string) =>
        ({
            "home.tabRecommended": "Recommended",
            "home.tabPopular": "Popular",
            "home.tabNew": "New arrivals",
            "home.heroKicker": "The everyday electronics desk",
            "home.heroTitle": "Find gear that keeps up.",
            "home.heroBody":
                "Laptops, cameras, audio, and the pieces between — chosen for real work, play, and everything after.",
            "home.heroPrimary": "Browse the collection",
            "home.heroSecondary": "See what’s new",
            "home.heroFeaturedLabel": "Featured deal",
            "home.heroPreviewLabel": "Featured product preview",
            "home.heroAvailability": "Availability",
            "home.heroDealLabel": "Featured deal",
            "home.heroDealBody":
                "A practical pick for creators and everyday setups.",
            "home.heroCarouselLabel": "Featured products",
            "home.heroPrevious": "Previous featured product",
            "home.heroNext": "Next featured product",
            "home.heroPause": "Pause featured product rotation",
            "home.heroPlay": "Play featured product rotation",
            "home.heroSignalsLabel": "Digital-E shopping signals",
            "home.heroSignalWork": "Work",
            "home.heroSignalPlay": "Play",
            "home.heroSignalCreate": "Create",
            "home.heroSignalLive": "Live",
            "home.categoryKicker": "Explore our collections",
            "home.categoryTitle": "Shop by category",
            "home.categoryGaming": "Gaming",
            "home.categoryGamingBody": "Consoles, games, and accessories.",
            "home.categoryLaptops": "Laptops",
            "home.categoryLaptopsBody": "Work, study, and create.",
            "home.categoryAudio": "Audio",
            "home.categoryAudioBody": "Headphones, speakers, and microphones.",
            "home.categoryComponents": "Components",
            "home.categoryComponentsBody": "GPUs, CPUs, RAM, and storage.",
            "home.categorySmartHome": "Smart home",
            "home.categorySmartHomeBody":
                "Cameras, lighting, and everyday automation.",
            "home.categoryAccessories": "Accessories",
            "home.categoryAccessoriesBody":
                "Cables, chargers, and useful extras.",
            "home.viewAllCategories": "View all categories",
            "home.trendingKicker": "Trending products",
            "home.trendingTitle": "Good choices, ready now",
            "home.valueKicker": "Why shop with Digital-E",
            "home.valueTitle": "A better way to shop tech.",
            "home.valueLink": "Learn more about us",
            "home.valueShipping": "Free shipping",
            "home.valueShippingBody": "On orders over 2,000,000 ₫",
            "home.valueCheckout": "Fast & easy checkout",
            "home.valueCheckoutBody": "Save time, shop faster",
            "home.valuePayments": "Secure payments",
            "home.valuePaymentsBody": "Multiple trusted methods",
            "home.valueSupport": "Expert support",
            "home.valueSupportBody": "Get help when you need it",
            "home.valueReturns": "Easy returns",
            "home.valueReturnsBody": "14-day hassle-free",
            "home.bundleKicker": "Bundle & save",
            "home.bundleTitle": "Level up your setup for less.",
            "home.bundleBody":
                "Curated bundles for gaming, work, and everyday life.",
            "home.bundleCta": "Shop bundle deals",
            "home.bundleDealLabel": "Gaming starter bundle",
            "home.bundleDealTitle": "Keyboard + mouse + headset",
            "home.bundleDealPrice": "4,990,000 ₫",
            "home.bundleDealOriginal": "6,470,000 ₫",
            "home.bundleDealDiscount": "−23%",
            "home.intentTitle": "Shop by intent",
            "home.intentHeading": "Start with what you are making.",
            "home.intentBody":
                "Choose a direction first. We will keep the shortlist practical.",
            "home.intentMake": "Make",
            "home.intentMakeBody": "Desktops, laptops, monitors, and tools.",
            "home.intentPlay": "Play",
            "home.intentPlayBody": "Consoles, screens, and the next level up.",
            "home.intentListen": "Listen",
            "home.intentListenBody":
                "Headphones and speakers with room to breathe.",
            "home.intentConnect": "Connect",
            "home.intentConnectBody":
                "Phones, smart home, and everyday accessories.",
            "home.shelfKicker": "The current shelf",
            "home.shelfTitle": "Good choices, ready now",
            "home.shelfBody":
                "A tighter view of what is moving through the shop today.",
            "home.viewProduct": "View product",
            "home.viewAllProducts": "View all products",
            "home.catalogReady": "in-stock picks ready to browse",
            "home.catalogLoading": "Loading the catalog",
            "home.heroLoading": "Loading the next good pick",
            "home.spotlightLabel": "On the bench",
            "home.stockReady": "ready",
            "home.spotlightBody":
                "A considered pick for the setup you are building.",
            "home.emptyTitle": "Nothing to show here yet",
            "home.emptyBody":
                "Open the full catalog to find the next useful piece.",
            "home.proofKicker": "The useful part",
            "home.proofTitle": "Shopping should feel easy to check.",
            "home.proofStockTitle": "Stock you can see",
            "home.proofStockBody":
                "Check availability before you add anything to the cart.",
            "home.proofCheckoutTitle": "Checkout without guesswork",
            "home.proofCheckoutBody":
                "Keep shipping, payment, and order status in one clear flow.",
            "home.proofSupportTitle": "Help that gets specific",
            "home.proofSupportBody":
                "Get practical support for products and orders when you need it.",
            "home.recentlyViewed": "Recently viewed",
            "home.recentlyViewedSubtitle": "Pick up where you left off",
        })[key] || key,
}));

vi.mock("../components/common/ProductItem", () => ({
    default: ({
        product,
        onAddingCart,
    }: {
        product: { id: number; name: string };
        onAddingCart: (uid: string, id: number) => void;
    }) => (
        <article>
            <h3>{product.name}</h3>
            <button type="button" onClick={() => onAddingCart("", product.id)}>
                Add {product.name} to cart
            </button>
        </article>
    ),
}));

vi.mock("../components/common/RecentlyViewedStrip", () => ({
    default: () => null,
}));

vi.mock("../components/common/StorefrontSkeleton", () => ({
    FeaturedProductSkeletons: () => (
        <div role="status" aria-label="Loading featured products" />
    ),
    ProductGridSkeleton: () => (
        <div role="status" aria-label="Loading products" />
    ),
}));

const products = [
    {
        id: 1,
        name: "Canon EOS R8",
        sku: "CANON-R8",
        manufacturerPartNumber: null,
        warrantyMonths: 24,
        category: "Camera",
        brand: "Canon",
        price: 1499,
        sale_price: 1399,
        rating: 4,
        reviews: 1,
        main_image: "canon-eos-r8",
        stock: 17,
        available_stock: 17,
        description: "Full-frame mirrorless camera.",
        specifications: null,
    },
    {
        id: 2,
        name: "Sony PlayStation 5 Slim",
        sku: "SONY-PS5",
        manufacturerPartNumber: null,
        warrantyMonths: 24,
        category: "Console",
        brand: "Sony",
        price: 499,
        sale_price: null,
        rating: 5,
        reviews: 1,
        main_image: "sony-ps5",
        stock: 24,
        available_stock: 24,
        description: "A compact console.",
        specifications: null,
    },
    {
        id: 3,
        name: "JBL Charge 5",
        sku: "JBL-CHARGE-5",
        manufacturerPartNumber: null,
        warrantyMonths: 12,
        category: "Headphone",
        brand: "JBL",
        price: 179,
        sale_price: 149,
        rating: 4,
        reviews: 1,
        main_image: "jbl-charge-5",
        stock: 33,
        available_stock: 33,
        description: "Portable audio.",
        specifications: null,
    },
];

describe("HomePage Open Bench landing", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.axiosGet.mockImplementation((url: string) => {
            if (url.startsWith("/api/products")) {
                return Promise.resolve({ status: 200, data: { products } });
            }
            return Promise.resolve({ status: 200, data: { wishlist: [] } });
        });
        mocks.fetchProduct.mockResolvedValue(null);
        mocks.addItem.mockResolvedValue(true);
    });

    it("presents the reference-led hero, category navigation, and product shelf", async () => {
        render(
            <MemoryRouter>
                <HomePage />
            </MemoryRouter>,
        );

        expect(
            await screen.findByRole("heading", {
                name: "Find gear that keeps up.",
            }),
        ).toBeVisible();
        expect(
            screen.getByRole("navigation", { name: "Shop by category" }),
        ).toBeVisible();
        expect(
            screen.getByRole("link", { name: "Browse the collection" }),
        ).toHaveAttribute("href", "/shops");
        expect(screen.getByRole("link", { name: "Gaming" })).toHaveAttribute(
            "href",
            expect.stringContaining("categories="),
        );
        expect(
            screen.getByRole("heading", { name: "Good choices, ready now" }),
        ).toBeVisible();
        expect(screen.getByRole("tab", { name: "Popular" })).toBeVisible();
        expect(
            screen.getByRole("heading", { name: "A better way to shop tech." }),
        ).toBeVisible();
        expect(
            screen.getByRole("heading", {
                name: "Level up your setup for less.",
            }),
        ).toBeVisible();
        expect(
            screen.getByRole("button", {
                name: "Pause featured product rotation",
            }),
        ).toHaveAttribute("aria-pressed", "false");
        expect(
            screen.getByRole("button", { name: "Next featured product" }),
        ).toBeVisible();
        expect(
            screen.getByRole("button", { name: "Add Canon EOS R8 to cart" }),
        ).toBeVisible();
    });
});
