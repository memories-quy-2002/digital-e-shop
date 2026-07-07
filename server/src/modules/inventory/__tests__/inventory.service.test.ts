import { describe, it, expect, vi } from "vitest";

// The service require()s its repository and the shared logger at module load.
// Mock them so importing the service in a test does not touch the database.
vi.mock("../inventory.repository", () => ({
    getMovements: vi.fn(),
    createMovement: vi.fn(),
    createMovements: vi.fn(),
}));
vi.mock("#src/shared/utils/logger", () => ({
    logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

import inventoryService from "../inventory.service";

const { normalizeMovement } = inventoryService as {
    normalizeMovement: (movement?: Record<string, unknown>) => Record<string, unknown> & {
        product_id: number;
        order_id: number | null;
        quantity_change: number;
        stock_before: number | null;
        stock_after: number | null;
    };
};

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
