import { describe, expect, it } from "vitest";
import { allocateRefundUnits } from "../refund-allocation";

describe("allocateRefundUnits", () => {
    it("allocates merchandise discounts in stable integer VND minor units", () => {
        const units = allocateRefundUnits([
            { orderItemId: 9, quantity: 1, unitPrice: 30_000 },
            { orderItemId: 3, quantity: 1, unitPrice: 30_000 },
            { orderItemId: 7, quantity: 1, unitPrice: 30_000 },
        ], 10_000);

        expect(units).toEqual([
            { orderItemId: 3, unitIndex: 0, netVnd: 26_667 },
            { orderItemId: 7, unitIndex: 0, netVnd: 26_667 },
            { orderItemId: 9, unitIndex: 0, netVnd: 26_666 },
        ]);
        expect(units.reduce((sum, unit) => sum + unit.netVnd, 0)).toBe(80_000);
    });

    it("rejects fractional, negative, or excessive discount amounts", () => {
        expect(() => allocateRefundUnits([{ orderItemId: 1, quantity: 1, unitPrice: 10 }], 1.5)).toThrow();
        expect(() => allocateRefundUnits([{ orderItemId: 1, quantity: 1, unitPrice: 10 }], 11)).toThrow();
    });
});
