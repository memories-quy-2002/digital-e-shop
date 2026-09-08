import { describe, expect, it, vi } from "vitest";
import type { CartItemRow } from "../cart.types";
import { buildGuestCartPreviewResult, coalesceGuestCartItems } from "../cart.service";
import { guestCartPreviewSchema } from "../cart.validator";

vi.mock("#src/config/database.config", () => ({ default: { query: vi.fn() } }));
vi.mock("../../products/products.repository", () => ({ NestProductsRepository: class NestProductsRepository {} }));

const product = (overrides: Partial<CartItemRow> = {}): CartItemRow => ({
    product_id: 10,
    product_name: "Current Widget",
    category: "Components",
    brand: "Digital-E",
    price: 100,
    sale_price: 80,
    stock: 5,
    available_stock: 5,
    main_image: "widget.jpg",
    ...overrides,
});

describe("guestCartPreviewSchema", () => {
    it("rejects an empty cart and invalid product quantities before repository access", () => {
        expect(guestCartPreviewSchema.safeParse({ items: [] }).success).toBe(false);
        expect(guestCartPreviewSchema.safeParse({ items: [{ productId: 1, quantity: 0 }] }).success).toBe(false);
        expect(guestCartPreviewSchema.safeParse({ items: [{ productId: 1.5, quantity: 1 }] }).success).toBe(false);
        expect(guestCartPreviewSchema.safeParse({
            items: [{ productId: 1, quantity: 99 }, { productId: 1, quantity: 1 }],
        }).success).toBe(false);
    });
});

describe("guest cart preview pricing", () => {
    it("coalesces duplicate products and derives sale-price totals from the current product rows", () => {
        const requestedItems = coalesceGuestCartItems([
            { productId: 10, quantity: 1 },
            { productId: 10, quantity: 2 },
        ]);

        const result = buildGuestCartPreviewResult(requestedItems, [product()], {
            discount_code: "SAVE10",
            discount_percent: 10,
        });

        expect(result.cartItems).toMatchObject([{ product_id: 10, quantity: 3, sale_price: 80 }]);
        expect(result.merchandiseTotal).toBe(240);
        expect(result.promotion).toMatchObject({ code: "SAVE10", valid: true, discount: 24 });
        expect(result.totalPrice).toBe(216);
        expect(result.issues).toEqual([]);
    });

    it("reports missing products and insufficient stock as actionable validation issues", () => {
        const result = buildGuestCartPreviewResult(
            [
                { productId: 10, quantity: 6 },
                { productId: 999, quantity: 1 },
            ],
            [product()],
            null,
        );

        expect(result.valid).toBe(false);
        expect(result.issues).toEqual(expect.arrayContaining([
            expect.objectContaining({ productId: 10, reason: "insufficient_stock", requestedQuantity: 6, availableStock: 5 }),
            expect.objectContaining({ productId: 999, reason: "unavailable", requestedQuantity: 1, availableStock: 0 }),
        ]));
        expect(result.merchandiseTotal).toBe(480);
    });

    it("treats inactive products as unavailable instead of purchasable stock", () => {
        const result = buildGuestCartPreviewResult(
            [{ productId: 10, quantity: 1 }],
            [product({ stock: -1, available_stock: 0 })],
            null,
        );

        expect(result.issues).toEqual([
            expect.objectContaining({ productId: 10, reason: "unavailable", availableStock: 0 }),
        ]);
    });

    it("returns a non-applying promotion result when a supplied code is invalid", () => {
        const result = buildGuestCartPreviewResult(
            [{ productId: 10, quantity: 1 }],
            [product()],
            null,
            "EXPIRED",
        );

        expect(result.promotion).toMatchObject({
            code: "EXPIRED",
            valid: false,
            discount: 0,
            message: "Discount code is no longer valid.",
        });
        expect(result.totalPrice).toBe(80);
    });
});
