import { describe, expect, it } from "vitest";

// The seed writer is intentionally CommonJS to match the server's legacy
// runtime shape; the test imports Vitest as ESM and exercises that module.
const { DEMO_SEED_PLAN, shouldSeedFirebaseUsersUnverified, validateDemoSeedPlan } = require("./demoSeedData");

describe("Digital-E demo seed graph", () => {
    it("validates a fully linked graph and reports deterministic parent counts", () => {
        const summary = validateDemoSeedPlan(DEMO_SEED_PLAN);

        expect(summary).toEqual({
            users: 4,
            categories: 8,
            brands: 16,
            products: 28,
            carts: 4,
            orders: 8,
            reviews: 36,
            wishlists: 32,
            addresses: 4,
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

    it("uses a unique remote image for every catalog product", () => {
        const imageUrls = DEMO_SEED_PLAN.products.map((product: { mainImage: string }) => product.mainImage);

        expect(new Set(imageUrls).size).toBe(DEMO_SEED_PLAN.products.length);
        expect(imageUrls.every((url: string) => /^https:\/\/images\.unsplash\.com\/photo-/.test(url))).toBe(true);
    });

    it("uses whole-number VND prices for the Vietnam-first demo catalog", () => {
        expect(DEMO_SEED_PLAN.currency).toBe("VND");
        expect(DEMO_SEED_PLAN.products.every((product: { price: number; salePrice: number }) =>
            Number.isInteger(product.price)
            && Number.isInteger(product.salePrice)
            && product.price >= 100_000,
        )).toBe(true);
        expect(DEMO_SEED_PLAN.discounts.every((discount: { minOrderValue: number }) =>
            Number.isInteger(discount.minOrderValue),
        )).toBe(true);
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

    it("requires every demo account to be marked as email verified", () => {
        const invalidPlan = {
            ...DEMO_SEED_PLAN,
            users: DEMO_SEED_PLAN.users.map((user: Record<string, unknown>, index: number) =>
                index === 0 ? { ...user, emailVerified: false } : user,
            ),
        };

        expect(() => validateDemoSeedPlan(invalidPlan)).toThrow("verified email");
    });

    it("uses the Firebase UID as both the user id and provider user id", () => {
        expect(DEMO_SEED_PLAN.users.every((user: { id: string; providerUserId: string }) =>
            user.id === user.providerUserId,
        )).toBe(true);
    });

    it("starts local Firebase Emulator demo users as unverified", () => {
        expect(shouldSeedFirebaseUsersUnverified({
            FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
        })).toBe(true);
    });

    it("keeps non-emulator demo seed users verified", () => {
        expect(shouldSeedFirebaseUsersUnverified({
            FIREBASE_AUTH_EMULATOR_HOST: "",
        })).toBe(false);
    });

    it("rejects a demo account whose provider user id does not match its Firebase id", () => {
        const invalidPlan = {
            ...DEMO_SEED_PLAN,
            users: DEMO_SEED_PLAN.users.map((user: Record<string, unknown>, index: number) =>
                index === 0 ? { ...user, providerUserId: "different-firebase-uid" } : user,
            ),
        };

        expect(() => validateDemoSeedPlan(invalidPlan)).toThrow("Firebase UID");
    });

    it("requires canonical category definitions and deterministic product identity metadata", () => {
        expect(DEMO_SEED_PLAN.categoryAttributeDefinitions.length).toBeGreaterThan(0);
        expect(DEMO_SEED_PLAN.products.every((product: Record<string, unknown>) =>
            typeof product.manufacturerPartNumber === "string"
            && String(product.manufacturerPartNumber).startsWith("DEMO-MPN-")
            && Array.isArray(product.attributes)
            && product.attributes.length > 0,
        )).toBe(true);
    });

    it("rejects a product without a typed attribute value", () => {
        const invalidPlan = {
            ...DEMO_SEED_PLAN,
            products: DEMO_SEED_PLAN.products.map((product: Record<string, unknown>, index: number) =>
                index === 0 ? { ...product, attributes: [] } : product,
            ),
        };

        expect(() => validateDemoSeedPlan(invalidPlan)).toThrow("typed attribute");
    });

    it("rejects a duplicate category attribute definition", () => {
        const invalidPlan = {
            ...DEMO_SEED_PLAN,
            categoryAttributeDefinitions: [
                ...DEMO_SEED_PLAN.categoryAttributeDefinitions,
                DEMO_SEED_PLAN.categoryAttributeDefinitions[0],
            ],
        };

        expect(() => validateDemoSeedPlan(invalidPlan)).toThrow("duplicate category attribute");
    });
});
