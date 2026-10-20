import { describe, expect, it } from "vitest";

// The seed writer is intentionally CommonJS to match the server's legacy
// runtime shape; the test imports Vitest as ESM and exercises that module.
const { DEMO_SEED_PLAN, DEMO_SEED_MIN_PRICE_VND, validateDemoSeedPlan } = require("./demo-seed-data");

describe("Digital-E demo seed graph", () => {
    it("validates a fully linked graph and reports deterministic parent counts", () => {
        const summary = validateDemoSeedPlan(DEMO_SEED_PLAN);

        expect(summary).toEqual({
            users: 4,
            categories: 8,
            brands: 16,
            products: 120,
            carts: 4,
            orders: 100,
            reviews: DEMO_SEED_PLAN.reviews.length,
            wishlists: DEMO_SEED_PLAN.wishlists.length,
            addresses: 5,
            notifications: 8,
            sessions: 8,
            discounts: 2,
        });
    });

    it("rejects an order item that points at an unknown product", () => {
        const invalidPlan = {
            ...DEMO_SEED_PLAN,
            orders: DEMO_SEED_PLAN.orders.map((order: Record<string, unknown>, index: number) =>
                index === 0
                    ? { ...order, items: [{ productName: "missing-demo-product", quantity: 1 }] }
                    : order,
            ),
        };

        expect(() => validateDemoSeedPlan(invalidPlan)).toThrow("unknown product");
    });

    it("rejects a catalog product without an image", () => {
        const invalidPlan = {
            ...DEMO_SEED_PLAN,
            products: DEMO_SEED_PLAN.products.map((product: Record<string, unknown>, index: number) =>
                index === 0 ? { ...product, mainImage: "" } : product,
            ),
        };

        expect(() => validateDemoSeedPlan(invalidPlan)).toThrow("missing a main image");
    });

    it("uses a non-empty HTTPS image for every catalog product", () => {
        const imageUrls = DEMO_SEED_PLAN.products.map((product: { mainImage: string }) => product.mainImage);

        expect(imageUrls.every((url: string) => /^https:\/\/.+/.test(url))).toBe(true);
        expect(new Set(imageUrls).size).toBeGreaterThanOrEqual(28);
    });

    it("represents every category and a varied set of catalog brands", () => {
        const productCategories = new Set(DEMO_SEED_PLAN.products.map((product: { categoryName: string }) => product.categoryName));
        const productBrands = new Set(DEMO_SEED_PLAN.products.map((product: { brandName: string }) => product.brandName));

        expect(productCategories).toEqual(new Set(DEMO_SEED_PLAN.categories));
        expect(productBrands.size).toBeGreaterThanOrEqual(12);
    });

    it("mixes full-price and percentage-discounted products using whole-number VND", () => {
        expect(DEMO_SEED_PLAN.currency).toBe("VND");
        expect(DEMO_SEED_PLAN.products.every((product: { price: number; salePrice: number | null }) =>
            Number.isInteger(product.price)
            && product.price >= 100_000,
        )).toBe(true);
        const noSaleProducts = DEMO_SEED_PLAN.products.filter((product: { salePrice: number | null }) => product.salePrice === null);
        const saleProducts = DEMO_SEED_PLAN.products.filter((product: { price: number; salePrice: number | null }) => product.salePrice !== null);
        expect(noSaleProducts.length).toBeGreaterThanOrEqual(20);
        expect(saleProducts.length).toBeGreaterThanOrEqual(80);
        expect(saleProducts.every((product: { price: number; salePrice: number }) =>
            Number.isInteger(product.salePrice) && product.salePrice >= 100_000 && product.salePrice < product.price,
        )).toBe(true);
        const effectiveDiscounts = new Set(saleProducts.map((product: { price: number; salePrice: number }) =>
            Math.round((1 - product.salePrice / product.price) * 100),
        ));
        expect(effectiveDiscounts.size).toBeGreaterThanOrEqual(6);
        expect(DEMO_SEED_PLAN.discounts.every((discount: { minOrderValue: number }) =>
            Number.isInteger(discount.minOrderValue),
        )).toBe(true);
    });

    it("generates customer reviews with every star rating, distinct copy, and product context", () => {
        const reviews = DEMO_SEED_PLAN.reviews as { userKey: string; productName: string; rating: number; text: string }[];
        expect(new Set(reviews.map((review) => review.rating))).toEqual(new Set([1, 2, 3, 4, 5]));
        expect(new Set(reviews.map((review) => review.text)).size).toBe(reviews.length);
        expect(reviews).toHaveLength(DEMO_SEED_PLAN.products.length);
        expect(reviews.every((review) => review.text.includes(review.productName))).toBe(true);
        expect(reviews.every((review) => review.userKey !== "admin")).toBe(true);
        expect(reviews.filter((review) => review.rating <= 2).every((review) => /frustrating|poor|not recommend|disappointed|failed|underwhelmed|annoyance|needs improvement/i.test(review.text))).toBe(true);
        expect(reviews.filter((review) => review.rating === 3).every((review) => /acceptable|trade-offs|middle|ordinary/i.test(review.text))).toBe(true);
        expect(reviews.filter((review) => review.rating >= 4).every((review) => /good choice|works well|impressed|recommend|excellent|standout|reliable/i.test(review.text))).toBe(true);
        expect(new Set(reviews.map((review) => review.text.split(":")[1].trim())).size).toBeGreaterThan(20);
    });

    it("rejects a catalog product priced below the minimum VND amount", () => {
        const invalidPlan = {
            ...DEMO_SEED_PLAN,
            products: DEMO_SEED_PLAN.products.map((product: Record<string, unknown>, index: number) =>
                index === 0 ? { ...product, salePrice: DEMO_SEED_MIN_PRICE_VND - 1 } : product,
            ),
        };

        expect(() => validateDemoSeedPlan(invalidPlan)).toThrow("catalog prices of at least 100000 VND");
    });

    it("rejects E2E or Demo labels from catalog product names", () => {
        const originalProductName = DEMO_SEED_PLAN.products[0].name;
        const renamedProduct = "Demo Camera Fixture";
        const renameReference = (item: { productName: string }) =>
            item.productName === originalProductName ? { ...item, productName: renamedProduct } : item;
        const invalidPlan = {
            ...DEMO_SEED_PLAN,
            products: DEMO_SEED_PLAN.products.map((product: Record<string, unknown>, index: number) =>
                index === 0 ? { ...product, name: renamedProduct } : product,
            ),
            carts: DEMO_SEED_PLAN.carts.map((cart: { items: { productName: string }[] }) => ({
                ...cart,
                items: cart.items.map(renameReference),
            })),
            orders: DEMO_SEED_PLAN.orders.map((order: { items: { productName: string }[] }) => ({
                ...order,
                items: order.items.map(renameReference),
            })),
            reviews: DEMO_SEED_PLAN.reviews.map(renameReference),
            wishlists: DEMO_SEED_PLAN.wishlists.map(renameReference),
        };

        expect(() => validateDemoSeedPlan(invalidPlan)).toThrow("reserved fixture label");
    });

    it("requires both admin and customer accounts", () => {
        const invalidPlan = {
            ...DEMO_SEED_PLAN,
            users: DEMO_SEED_PLAN.users.map((user: Record<string, unknown>) => ({ ...user, role: "Customer" })),
        };

        expect(() => validateDemoSeedPlan(invalidPlan)).toThrow("admin account");
    });

    it("allows Firebase demo accounts to retain their email verification state", () => {
        const unverifiedPlan = {
            ...DEMO_SEED_PLAN,
            users: DEMO_SEED_PLAN.users.map((user: Record<string, unknown>, index: number) =>
                index === 0 ? { ...user, emailVerified: false } : user,
            ),
        };

        expect(() => validateDemoSeedPlan(unverifiedPlan)).not.toThrow();

        const invalidPlan = {
            ...DEMO_SEED_PLAN,
            users: DEMO_SEED_PLAN.users.map((user: Record<string, unknown>, index: number) =>
                index === 0 ? { ...user, emailVerified: undefined } : user,
            ),
        };

        expect(() => validateDemoSeedPlan(invalidPlan)).toThrow("email verification state");
    });

    it("keeps notification order keys and gives each account the required order history", () => {
        expect(DEMO_SEED_PLAN.orders.slice(0, 8).map((order: { key: string }) => order.key)).toEqual(
            Array.from({ length: 8 }, (_, index) => `order-${index + 1}`),
        );
        for (const user of DEMO_SEED_PLAN.users) {
            const orders = DEMO_SEED_PLAN.orders.filter((order: { userKey: string }) => order.userKey === user.key);
            expect(orders).toHaveLength(25);
            expect(orders.some((order: { status: number }) => order.status === 1)).toBe(true);
            expect(orders.some((order: { status: number }) => order.status === 2)).toBe(true);
        }
        expect(DEMO_SEED_PLAN.orders.filter((order: { userKey: string }) => order.userKey === "admin")).toHaveLength(25);
    });

    it("rejects a customer review without a completed order containing that product", () => {
        const productName = DEMO_SEED_PLAN.products[0].name;
        const completedCustomers = new Set(DEMO_SEED_PLAN.orders
            .filter((order: { status: number; items: { productName: string }[] }) =>
                order.status === 1 && order.items.some((item) => item.productName === productName),
            )
            .map((order: { userKey: string }) => order.userKey));
        const otherCustomer = DEMO_SEED_PLAN.users.find((user: { key: string; role: string }) =>
            user.role === "Customer" && !completedCustomers.has(user.key),
        );
        const invalidPlan = {
            ...DEMO_SEED_PLAN,
            reviews: [
                ...DEMO_SEED_PLAN.reviews.filter((review: { productName: string }) => review.productName !== productName),
                { userKey: otherCustomer.key, productName, rating: 5, text: "Review without a completed purchase." },
            ],
        };

        expect(() => validateDemoSeedPlan(invalidPlan)).toThrow("qualifying customer review");
    });

    it("rejects a customer without the required order count", () => {
        const invalidPlan = {
            ...DEMO_SEED_PLAN,
            orders: DEMO_SEED_PLAN.orders.filter((order: { userKey: string; key: string }) =>
                order.userKey !== "alice" || order.key !== "alice-demo-order-22",
            ),
        };

        expect(() => validateDemoSeedPlan(invalidPlan)).toThrow("at least 25 orders");
    });
});
