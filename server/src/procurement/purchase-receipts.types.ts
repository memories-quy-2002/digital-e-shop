export type ReceiptLineInput = {
    purchaseOrderItemId: number;
    expectedQuantity: number;
    acceptedQuantity: number;
    rejectedQuantity: number;
    missingQuantity: number;
    unitCostVnd: number;
    actualCostReason?: string;
    note?: string;
};

export type PostReceiptInput = {
    idempotencyKey: string;
    lines: ReceiptLineInput[];
    note?: string;
};

export type PurchaseReceiptLine = ReceiptLineInput & {
    id: number;
    productId: number;
    sku: string;
    productName: string;
    plannedUnitCostVnd: number;
};

export type PurchaseReceipt = {
    id: number;
    purchaseOrderId: number;
    idempotencyKey: string;
    actorId: string;
    note: string | null;
    totalAcceptedCostVnd: number;
    createdAt: string;
    lines: PurchaseReceiptLine[];
};

export type ReceiptLineRow = {
    id: number;
    purchase_order_item_id: number;
    product_id: number;
    sku: string;
    product_name: string;
    expected_quantity: number;
    accepted_quantity: number;
    rejected_quantity: number;
    missing_quantity: number;
    planned_unit_cost_vnd: string | number;
    unit_cost_vnd: string | number;
    actual_cost_reason: string | null;
    note: string | null;
};
