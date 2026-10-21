export type StockCountStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "CANCELED";
export type StockRevision = string;

export type StockCountItem = {
    id: number;
    productId: number;
    sku: string;
    productName: string;
    baselineStock: number;
    baselineRevision: StockRevision;
    countedQuantity: number | null;
    reason: string | null;
    difference: number | null;
    /** Live active pending-checkout holds at the time this count is read. */
    activeReservedQuantity: number;
};

export type StockCount = {
    id: number;
    status: StockCountStatus;
    version: number;
    note: string | null;
    items: StockCountItem[];
    createdById: string;
    submittedById: string | null;
    approvedById: string | null;
    canceledById: string | null;
    canceledReason: string | null;
    createdAt: string;
    updatedAt: string;
    submittedAt: string | null;
    approvedAt: string | null;
    canceledAt: string | null;
};

export type CreateStockCountInput = { productIds: number[]; note?: string };
export type CountObservation = { itemId: number; countedQuantity: number; reason?: string };
export type UpdateCountInput = { version: number; observations: CountObservation[] };
export type CountActionInput = { version: number; reason?: string; itemIds?: number[] };
export type StockCountQuery = { page: number; limit: number; search?: string; status?: StockCountStatus | "all" };
export type StockCountPage = {
    items: StockCount[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
};

export type CountConflictReason = "STALE_STOCK" | "RESERVATION_SHORTFALL" | "PRODUCT_INACTIVE";
export type CountConflictItem = {
    productId: number;
    expectedRevision: StockRevision;
    currentRevision: StockRevision;
    activeReservedQuantity: number;
    reason: CountConflictReason;
};

export type StockCountRow = Record<string, unknown>;
