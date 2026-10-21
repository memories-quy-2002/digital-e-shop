import type { CountConflictItem, StockCountItem } from "./stock-counts.types";

export const evaluateStockCount = (
    items: Array<StockCountItem & { currentStock: number; currentRevision: string; activeReservedQuantity: number; active: boolean }>,
): CountConflictItem[] => {
    const conflicts: CountConflictItem[] = [];
    for (const item of items) {
        if (!item.active) {
            conflicts.push({ productId: item.productId, expectedRevision: item.baselineRevision, currentRevision: item.currentRevision, activeReservedQuantity: item.activeReservedQuantity, reason: "PRODUCT_INACTIVE" });
        } else if (item.currentRevision !== item.baselineRevision) {
            conflicts.push({ productId: item.productId, expectedRevision: item.baselineRevision, currentRevision: item.currentRevision, activeReservedQuantity: item.activeReservedQuantity, reason: "STALE_STOCK" });
        } else if (item.countedQuantity === null || item.countedQuantity < item.activeReservedQuantity) {
            conflicts.push({ productId: item.productId, expectedRevision: item.baselineRevision, currentRevision: item.currentRevision, activeReservedQuantity: item.activeReservedQuantity, reason: "RESERVATION_SHORTFALL" });
        }
    }
    return conflicts;
};

export const assertCountComplete = (items: StockCountItem[]): void => {
    const incomplete = items.filter((item) => item.countedQuantity === null);
    if (incomplete.length) throw Object.assign(new Error("Enter a counted quantity for every product before submitting."), { statusCode: 400 });
};

export const assertDiscrepancyReasons = (items: StockCountItem[]): void => {
    const missing = items.filter((item) => item.countedQuantity !== null && item.countedQuantity !== item.baselineStock && !item.reason?.trim());
    if (missing.length) throw Object.assign(new Error("A reason is required for every stock difference."), { statusCode: 400 });
};
