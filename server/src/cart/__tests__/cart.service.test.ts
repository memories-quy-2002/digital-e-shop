import { describe, it, expect } from "vitest";
import type { CartItemRow } from "../cart.types";
import type { CartCheckoutItem } from "../cart.dto";
import { buildCartValidationIssue, buildCartValidationResult, compareSubmittedCart } from "../cart.service";

const line = (overrides: Partial<CartItemRow> = {}): CartItemRow => ({
    cart_item_id: 1,
    product_id: 10,
    product_name: "Widget",
    price: 100,
    sale_price: null,
    quantity: 2,
    stock: 5,
    ...overrides,
});

describe("buildCartValidationIssue", () => {
    it("returns null when the line is in stock and available", () => {
        expect(buildCartValidationIssue(line())).toBeNull();
    });

    it("flags 'unavailable' when stock is null/undefined", () => {
        expect(buildCartValidationIssue(line({ stock: null }))?.reason).toBe("unavailable");
        expect(buildCartValidationIssue(line({ stock: undefined }))?.reason).toBe("unavailable");
    });

    it("flags 'unavailable' when product_id is missing", () => {
        expect(buildCartValidationIssue(line({ product_id: 0 }))?.reason).toBe("unavailable");
    });

    it("flags 'out_of_stock' when stock is zero", () => {
        const issue = buildCartValidationIssue(line({ stock: 0 }));
        expect(issue?.reason).toBe("out_of_stock");
        expect(issue?.availableStock).toBe(0);
    });

    it("flags 'insufficient_stock' when requested exceeds available", () => {
        const issue = buildCartValidationIssue(line({ quantity: 9, stock: 5 }));
        expect(issue?.reason).toBe("insufficient_stock");
        expect(issue?.availableStock).toBe(5);
        expect(issue?.requestedQuantity).toBe(9);
    });

    it("falls back to a synthetic product name when none is provided", () => {
        const issue = buildCartValidationIssue(line({ product_name: undefined, stock: 0 }));
        expect(issue?.productName).toBe("Product #10");
    });
});

describe("buildCartValidationResult", () => {
    it("is valid for a non-empty cart with no issues", () => {
        const result = buildCartValidationResult([line(), line({ product_id: 11, cart_item_id: 2 })]);
        expect(result.valid).toBe(true);
        expect(result.issues).toHaveLength(0);
    });

    it("is invalid and aggregates issues when a line is out of stock", () => {
        const result = buildCartValidationResult([line(), line({ product_id: 11, stock: 0 })]);
        expect(result.valid).toBe(false);
        expect(result.issues).toHaveLength(1);
        expect(result.issues[0].reason).toBe("out_of_stock");
    });

    it("is invalid for an empty cart", () => {
        expect(buildCartValidationResult([]).valid).toBe(false);
    });
});

describe("compareSubmittedCart (tampering / drift detection)", () => {
    const authoritative = (): CartItemRow[] => [line({ product_id: 10, quantity: 2, price: 100, sale_price: null })];

    it("reports no mismatches when submitted matches authoritative", () => {
        const submitted: CartCheckoutItem[] = [{ productId: 10, quantity: 2, price: 100, sale_price: null }];
        const { mismatches, authoritativeTotalPrice } = compareSubmittedCart(authoritative(), submitted, 200);
        expect(mismatches).toHaveLength(0);
        expect(authoritativeTotalPrice).toBe(200);
    });

    it("detects a tampered quantity", () => {
        const submitted: CartCheckoutItem[] = [{ productId: 10, quantity: 5, price: 100, sale_price: null }];
        const { mismatches } = compareSubmittedCart(authoritative(), submitted, 500);
        expect(mismatches.some((m) => m.reason === "quantity_changed")).toBe(true);
    });

    it("detects a tampered unit price", () => {
        const submitted: CartCheckoutItem[] = [{ productId: 10, quantity: 2, price: 1, sale_price: null }];
        const { mismatches } = compareSubmittedCart(authoritative(), submitted, 2);
        expect(mismatches.some((m) => m.reason === "price_changed")).toBe(true);
    });

    it("detects a missing item that should have been in the cart", () => {
        const { mismatches } = compareSubmittedCart(authoritative(), [], 0);
        expect(mismatches.some((m) => m.reason === "missing_item")).toBe(true);
    });

    it("detects an unexpected item not in the authoritative cart", () => {
        const submitted: CartCheckoutItem[] = [
            { productId: 10, quantity: 2, price: 100, sale_price: null },
            { productId: 99, quantity: 1, price: 50, sale_price: null },
        ];
        const { mismatches } = compareSubmittedCart(authoritative(), submitted, 250);
        expect(mismatches.some((m) => m.reason === "unexpected_item")).toBe(true);
    });

    it("detects a tampered cart total even when line items match", () => {
        const submitted: CartCheckoutItem[] = [{ productId: 10, quantity: 2, price: 100, sale_price: null }];
        const { mismatches } = compareSubmittedCart(authoritative(), submitted, 1);
        expect(mismatches.some((m) => m.reason === "total_changed")).toBe(true);
    });

    it("uses the server-side sale price when computing the authoritative total", () => {
        const auth: CartItemRow[] = [line({ product_id: 10, quantity: 2, price: 100, sale_price: 80 })];
        const submitted: CartCheckoutItem[] = [{ productId: 10, quantity: 2, price: 100, sale_price: 80 }];
        const { authoritativeTotalPrice, mismatches } = compareSubmittedCart(auth, submitted, 160);
        expect(authoritativeTotalPrice).toBe(160);
        expect(mismatches).toHaveLength(0);
    });
});
