import { describe, expect, it } from "vitest";

// The seed writer is intentionally CommonJS to match the server's legacy
// runtime shape; the test imports Vitest as ESM and exercises that module.
const { DEMO_SEED_PLAN, validateDemoSeedPlan } = require("./demoSeedData");

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

    it("requires both admin and customer accounts", () => {
        const invalidPlan = {
            ...DEMO_SEED_PLAN,
            users: DEMO_SEED_PLAN.users.map((user: Record<string, unknown>) => ({ ...user, role: "Customer" })),
        };

        expect(() => validateDemoSeedPlan(invalidPlan)).toThrow("admin account");
    });
});
