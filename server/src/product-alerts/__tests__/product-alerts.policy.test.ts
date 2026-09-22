import { describe, expect, it } from "vitest";
import {
    effectiveProductPrice,
    getProductAlertTransitions,
} from "../product-alerts.policy";
import type { ProductSnapshot } from "../product-alerts.types";

const snapshot = (
    overrides: Partial<ProductSnapshot> = {},
): ProductSnapshot => ({
    productId: 7,
    price: 100,
    salePrice: null,
    stock: 4,
    ...overrides,
});

describe("product alert policy", () => {
    describe("effectiveProductPrice", () => {
        it("uses a valid sale price only when it is lower than the base price", () => {
            expect(effectiveProductPrice(100, 80)).toBe(80);
            expect(effectiveProductPrice(100, 0)).toBe(100);
            expect(effectiveProductPrice(100, 120)).toBe(100);
        });

        it.each([null, undefined, "", "not-a-number", -1, Number.NaN, Number.POSITIVE_INFINITY])(
            "ignores an invalid sale price: %s",
            (salePrice) => {
                expect(effectiveProductPrice(100, salePrice)).toBe(100);
            },
        );
    });

    it("returns a strict price-drop transition", () => {
        expect(getProductAlertTransitions(
            snapshot(),
            snapshot({ price: 90 }),
        )).toEqual([
            expect.objectContaining({
                type: "price_drop",
                productId: 7,
                previousPrice: 100,
                currentPrice: 90,
            }),
        ]);
    });

    it.each([
        ["equal effective prices", snapshot(), snapshot()],
        ["price increase", snapshot({ price: 90 }), snapshot({ price: 100 })],
        ["sale price removed without a decrease", snapshot({ salePrice: 80 }), snapshot({ salePrice: null })],
    ])("does not emit a price alert for %s", (_label, before, after) => {
        expect(getProductAlertTransitions(before, after)).toEqual([]);
    });

    it.each([
        ["zero to positive", 0, 4],
        ["negative to positive", -1, 4],
    ])("emits back-in-stock for %s raw stock", (_label, beforeStock, afterStock) => {
        expect(getProductAlertTransitions(
            snapshot({ stock: beforeStock }),
            snapshot({ stock: afterStock }),
        )).toEqual([
            expect.objectContaining({
                type: "back_in_stock",
                previousStock: beforeStock,
                currentStock: afterStock,
            }),
        ]);
    });

    it.each([
        ["positive to zero", 4, 0],
        ["negative to negative", -1, -2],
        ["unchanged raw stock", 4, 4],
    ])("does not emit back-in-stock for %s", (_label, beforeStock, afterStock) => {
        expect(getProductAlertTransitions(
            snapshot({ stock: beforeStock }),
            snapshot({ stock: afterStock }),
        )).toEqual([]);
    });

    it("uses raw stock and does not infer a transition from reservations", () => {
        expect(getProductAlertTransitions(
            snapshot({ stock: 4 }),
            snapshot({ stock: 4 }),
        )).not.toEqual([
            expect.objectContaining({ type: "back_in_stock" }),
        ]);
    });

    it("emits a new price transition when a price falls to a previous value again", () => {
        const firstDrop = getProductAlertTransitions(
            snapshot({ price: 100 }),
            snapshot({ price: 90 }),
        );
        const rise = getProductAlertTransitions(
            snapshot({ price: 90 }),
            snapshot({ price: 100 }),
        );
        const secondDrop = getProductAlertTransitions(
            snapshot({ price: 100 }),
            snapshot({ price: 90 }),
        );

        expect(firstDrop).toHaveLength(1);
        expect(rise).toEqual([]);
        expect(secondDrop).toEqual([
            expect.objectContaining({
                type: "price_drop",
                previousPrice: 100,
                currentPrice: 90,
            }),
        ]);
    });

    it("can return price and stock transitions for the same product update", () => {
        expect(getProductAlertTransitions(
            snapshot({ stock: 0 }),
            snapshot({ price: 90, stock: 4 }),
        )).toEqual([
            expect.objectContaining({ type: "price_drop" }),
            expect.objectContaining({ type: "back_in_stock" }),
        ]);
    });
});
