import { describe, expect, it } from "vitest";
import { receiptPayloadHashInput, validateReceiptLines } from "./receipt.policy";

const line = {
    purchaseOrderItemId: 10,
    expectedQuantity: 5,
    acceptedQuantity: 3,
    rejectedQuantity: 1,
    missingQuantity: 1,
    unitCostVnd: 120,
    actualCostReason: undefined,
    note: "One missing, one damaged",
};

describe("receipt policy", () => {
    it("validates partial receipt dispositions and preserves immutable item identity", () => {
        expect(validateReceiptLines([line], [{
            purchaseOrderItemId: 10, productId: 4, sku: "SKU-4", productName: "Keyboard",
            orderedQuantity: 8, acceptedQuantity: 2, plannedUnitCostVnd: 120,
        }])).toMatchObject([{ productId: 4, sku: "SKU-4", productName: "Keyboard", plannedUnitCostVnd: 120 }]);
    });

    it("rejects over-receipts, unbalanced dispositions, and unexplained cost changes", () => {
        const outstanding = [{ purchaseOrderItemId: 10, productId: 4, orderedQuantity: 6, acceptedQuantity: 2, plannedUnitCostVnd: 120 }];
        expect(() => validateReceiptLines([line], outstanding)).toThrow(/remaining purchase order/);
        expect(() => validateReceiptLines([{ ...line, expectedQuantity: 4 }], outstanding)).toThrow(/dispositions/);
        expect(() => validateReceiptLines([{ ...line, expectedQuantity: 5, unitCostVnd: 130, actualCostReason: undefined }], [{ ...outstanding[0], orderedQuantity: 8 }])).toThrow(/actual unit cost/);
    });

    it("canonicalizes line order and trims free-text for idempotency", () => {
        const first = receiptPayloadHashInput({ idempotencyKey: "key", note: " memo ", lines: [line] });
        const second = receiptPayloadHashInput({ idempotencyKey: "key", note: "memo", lines: [{ ...line, note: "One missing, one damaged " }] });
        expect(first).toEqual(second);
    });
});
