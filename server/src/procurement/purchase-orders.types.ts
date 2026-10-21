export type PurchaseOrderStatus = "DRAFT" | "ORDERED" | "PARTIALLY_RECEIVED" | "RECEIVED" | "CLOSED" | "CANCELED";

export type PurchaseOrderLine = {
    id: number;
    productId: number;
    sku: string;
    name: string;
    orderedQuantity: number;
    acceptedQuantity: number;
    unitCostVnd: number;
    note: string | null;
};

export type PurchaseOrder = {
    id: number;
    supplierId: number;
    supplierCode: string | null;
    supplierName: string | null;
    status: PurchaseOrderStatus;
    version: number;
    note: string | null;
    lines: PurchaseOrderLine[];
    createdById: string;
    createdAt: string;
    updatedAt: string;
    confirmedAt: string | null;
    closedAt: string | null;
    closedReason: string | null;
    canceledAt: string | null;
    canceledReason: string | null;
};

export type PurchaseOrderLineInput = {
    productId: number;
    orderedQuantity: number;
    unitCostVnd: number;
    note?: string;
};

export type CreatePurchaseOrderInput = {
    supplierId: number;
    note?: string;
    lines: PurchaseOrderLineInput[];
};

export type UpdatePurchaseOrderInput = CreatePurchaseOrderInput & { version: number };
export type DocumentActionInput = { version: number; reason?: string };
export type PurchaseOrderRow = Record<string, unknown>;
