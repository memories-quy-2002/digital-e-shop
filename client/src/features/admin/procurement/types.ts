export type AdminListPagination = {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
};

export type AdminListPage<T> = { items: T[]; pagination: AdminListPagination };

export type Supplier = {
    id: number;
    code: string;
    name: string;
    contactName: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    notes: string | null;
    active: boolean;
    version: number;
};

export type SupplierInput = { code: string; name: string; contactName: string; email: string; phone: string; address: string; notes: string };

export type PurchaseOrderStatus = "DRAFT" | "ORDERED" | "PARTIALLY_RECEIVED" | "RECEIVED" | "CLOSED" | "CANCELED";

export type PurchaseOrderLine = {
    id: number;
    productId: number;
    sku: string;
    productName: string;
    orderedQuantity: number;
    acceptedQuantity: number;
    unitCostVnd: number;
    note: string | null;
};

export type PurchaseOrder = {
    id: number;
    supplierId: number;
    supplierCode: string;
    supplierName: string;
    status: PurchaseOrderStatus;
    version: number;
    note: string | null;
    lines: PurchaseOrderLine[];
    createdAt: string;
    confirmedAt: string | null;
};

export type PurchaseOrderInput = {
    supplierId: number;
    note?: string;
    lines: Array<{ productId: number; orderedQuantity: number; unitCostVnd: number; note?: string }>;
};

export type ReceiptLineInput = {
    purchaseOrderItemId: number;
    expectedQuantity: number;
    acceptedQuantity: number;
    rejectedQuantity: number;
    missingQuantity: number;
    unitCostVnd: number;
    note?: string;
    actualCostReason?: string;
};

export type PurchaseReceipt = {
    id: number;
    purchaseOrderId: number;
    idempotencyKey: string;
    actorId: string;
    note: string | null;
    createdAt: string;
    totalAcceptedCostVnd: number;
    lines: Array<ReceiptLineInput & { id: number; sku: string; productName: string }>;
};

export type StockCountStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "CANCELED";

export type StockCountItem = {
    id: number;
    productId: number;
    sku: string;
    productName: string;
    baselineStock: number;
    baselineRevision: string;
    activeReservedQuantity: number;
    countedQuantity: number | null;
    difference: number | null;
    reason: string | null;
};

export type StockCount = {
    id: number;
    status: StockCountStatus;
    version: number;
    note: string | null;
    items: StockCountItem[];
    createdAt: string;
    submittedAt: string | null;
    approvedAt: string | null;
};

export type StockCountConflictItem = {
    productId: number;
    sku?: string;
    productName?: string;
    expectedRevision: string;
    currentRevision: string;
    activeReservedQuantity: number;
    reason: "STALE_STOCK" | "RESERVATION_SHORTFALL" | "PRODUCT_INACTIVE";
};

export type StockCountConflict = {
    code: "STOCK_COUNT_CONFLICT";
    items: StockCountConflictItem[];
    requestId?: string;
};

export type ProductChoice = { id: number; name: string; sku: string; stock: number };
