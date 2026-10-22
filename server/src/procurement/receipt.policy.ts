import type { ReceiptLineInput } from "./purchase-receipts.types";

export type OutstandingPurchaseLine = {
    purchaseOrderItemId: number;
    productId: number;
    sku?: string;
    productName?: string;
    orderedQuantity: number;
    acceptedQuantity: number;
    plannedUnitCostVnd: number;
};

export type ValidatedReceiptLine = ReceiptLineInput & {
    purchaseOrderItemId: number;
    productId: number;
    sku: string;
    productName: string;
    plannedUnitCostVnd: number;
};

export const validateReceiptLines = (
    input: ReceiptLineInput[],
    outstanding: OutstandingPurchaseLine[],
): ValidatedReceiptLine[] => {
    const byId = new Map(outstanding.map((line) => [line.purchaseOrderItemId, line]));
    const result: ValidatedReceiptLine[] = [];
    for (const line of input) {
        const source = byId.get(line.purchaseOrderItemId);
        if (!source) throw Object.assign(new Error("Receipt contains a line outside this purchase order."), { statusCode: 400 });
        const remaining = source.orderedQuantity - source.acceptedQuantity;
        if (line.expectedQuantity > remaining) throw Object.assign(new Error("Expected quantity exceeds the remaining purchase order obligation."), { statusCode: 409 });
        if (line.acceptedQuantity + line.rejectedQuantity + line.missingQuantity !== line.expectedQuantity) {
            throw Object.assign(new Error("Receipt dispositions must equal expected quantity."), { statusCode: 400 });
        }
        if ((line.rejectedQuantity > 0 || line.missingQuantity > 0) && !line.note?.trim()) {
            throw Object.assign(new Error("A note is required for rejected or missing goods."), { statusCode: 400 });
        }
        if (line.unitCostVnd !== source.plannedUnitCostVnd && !line.actualCostReason?.trim()) {
            throw Object.assign(new Error("Explain why actual unit cost differs from planned cost."), { statusCode: 400 });
        }
        result.push({
            ...line,
            productId: source.productId,
            sku: source.sku || "",
            productName: source.productName || "",
            plannedUnitCostVnd: source.plannedUnitCostVnd,
        });
    }
    const acceptedByProduct = new Map<number, number>();
    for (const line of result) acceptedByProduct.set(line.productId, (acceptedByProduct.get(line.productId) || 0) + line.acceptedQuantity);
    for (const accepted of acceptedByProduct.values()) {
        if (accepted > 2_147_483_647) throw Object.assign(new Error("Accepted quantity exceeds the stock limit."), { statusCode: 409 });
    }
    const total = result.reduce((sum, line) => sum + line.unitCostVnd * line.acceptedQuantity, 0);
    if (!Number.isSafeInteger(total)) throw Object.assign(new Error("Receipt total exceeds the safe VND range."), { statusCode: 400 });
    return result;
};

export const receiptPayloadHashInput = (input: { idempotencyKey: string; note?: string; lines: ReceiptLineInput[] }) => ({
    note: input.note?.trim() || null,
    lines: [...input.lines].sort((a, b) => a.purchaseOrderItemId - b.purchaseOrderItemId).map((line) => ({
        purchaseOrderItemId: line.purchaseOrderItemId,
        expectedQuantity: line.expectedQuantity,
        acceptedQuantity: line.acceptedQuantity,
        rejectedQuantity: line.rejectedQuantity,
        missingQuantity: line.missingQuantity,
        unitCostVnd: line.unitCostVnd,
        actualCostReason: line.actualCostReason?.trim() || null,
        note: line.note?.trim() || null,
    })),
});
