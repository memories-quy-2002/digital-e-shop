import { describe, it, expect } from "vitest";
import { normalizeMovement } from "../inventory.service";

describe("normalizeMovement", () => {
    it("coerces string numerics to numbers", () => {
        const result = normalizeMovement({
            id: "7",
            product_id: "42",
            product_name: "Widget",
            order_id: "100",
            movement_type: "sale",
            quantity_change: "-3",
            stock_before: "10",
            stock_after: "7",
            note: "Stock deducted",
            actor_id: "user-1",
            created_at: "2026-07-07T00:00:00.000Z",
        });

        expect(result).toMatchObject({
            id: 7,
            product_id: 42,
            product_name: "Widget",
            order_id: 100,
            movement_type: "sale",
            quantity_change: -3,
            stock_before: 10,
            stock_after: 7,
            note: "Stock deducted",
            actor_id: "user-1",
            created_at: "2026-07-07T00:00:00.000Z",
        });
    });

    it("preserves nulls for order_id, stock_before, and stock_after", () => {
        const result = normalizeMovement({
            id: 1,
            product_id: 5,
            order_id: null,
            movement_type: "adjustment",
            quantity_change: 4,
            stock_before: null,
            stock_after: null,
        });

        expect(result.order_id).toBeNull();
        expect(result.stock_before).toBeNull();
        expect(result.stock_after).toBeNull();
    });

    it("defaults quantity_change to 0 when missing or non-numeric", () => {
        expect(normalizeMovement({ quantity_change: undefined }).quantity_change).toBe(0);
        expect(normalizeMovement({ quantity_change: "not-a-number" }).quantity_change).toBe(0);
    });

    it("tolerates an empty movement object", () => {
        const result = normalizeMovement();
        expect(result.quantity_change).toBe(0);
        expect(Number.isNaN(result.product_id)).toBe(true);
    });
});
