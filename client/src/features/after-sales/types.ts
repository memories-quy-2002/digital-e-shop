export type AfterSalesKind = "RETURN" | "WARRANTY";
export type AfterSalesStatus = "REQUESTED" | "APPROVED" | "REJECTED" | "RECEIVED" | "REFUND_PENDING" | "REFUNDED" | "CLOSED";

export type AfterSalesRequestItem = {
    id: number;
    orderItemId: number;
    quantity: number;
    reason?: string;
    productName?: string | null;
    unitPrice?: number;
};

export type AfterSalesEvent = {
    id: number;
    fromStatus: AfterSalesStatus | null;
    toStatus: AfterSalesStatus;
    actorUserId: string | null;
    note: string | null;
    createdAt: string;
};

export type AfterSalesRequest = {
    id: number;
    orderId: number;
    userId: string | null;
    kind: AfterSalesKind;
    status: AfterSalesStatus;
    reason: string;
    adminNote: string | null;
    refundAmount: number | null;
    refundCurrency: string | null;
    refundReference: string | null;
    createdAt: string;
    updatedAt: string;
    approvedAt: string | null;
    receivedAt: string | null;
    refundedAt: string | null;
    closedAt: string | null;
    items?: AfterSalesRequestItem[];
    events?: AfterSalesEvent[];
};

export type AfterSalesListQuery = {
    page?: number;
    limit?: number;
    status?: AfterSalesStatus;
    kind?: AfterSalesKind;
};

export type AfterSalesListPage = {
    requests: AfterSalesRequest[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
};

export type AfterSalesCreateInput = {
    orderId: number;
    kind: AfterSalesKind;
    reason: string;
    items: Array<{ orderItemId: number; quantity: number; reason?: string }>;
    idempotencyKey: string;
};

export type GuestAfterSalesCreateInput = AfterSalesCreateInput & { guestOrderToken: string };
