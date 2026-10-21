import { describe, expect, it } from "vitest";
import { assertCountComplete, assertDiscrepancyReasons, evaluateStockCount } from "./stock-counts.policy";
import type { StockCountItem } from "./stock-counts.types";

const item: StockCountItem = {
    id: 1, productId: 2, sku: "P-2", productName: "Mouse", baselineStock: 8, baselineRevision: "11",
    countedQuantity: 6, reason: "Damaged units", difference: -2, activeReservedQuantity: 0,
};

describe("stock count policy", () => {
    it("reports stale revision, inactive product and reservation conflicts", () => {
        const conflicts = evaluateStockCount([
            { ...item, currentStock: 8, currentRevision: "12", activeReservedQuantity: 0, active: true },
            { ...item, productId: 3, currentStock: 8, currentRevision: "11", activeReservedQuantity: 0, active: false },
            { ...item, productId: 4, currentStock: 8, currentRevision: "11", activeReservedQuantity: 7, active: true },
        ]);
        expect(conflicts.map(({ reason }) => reason)).toEqual(["STALE_STOCK", "PRODUCT_INACTIVE", "RESERVATION_SHORTFALL"]);
    });

    it("requires complete quantities and a reason for each discrepancy", () => {
        expect(() => assertCountComplete([{ ...item, countedQuantity: null }])).toThrow(/every product/);
        expect(() => assertDiscrepancyReasons([{ ...item, reason: null }])).toThrow(/reason is required/);
        expect(() => assertDiscrepancyReasons([item])).not.toThrow();
    });
});
