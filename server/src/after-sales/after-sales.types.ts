export const AFTER_SALES_KINDS = ["RETURN", "WARRANTY"] as const;
export const AFTER_SALES_STATUSES = [
    "REQUESTED",
    "APPROVED",
    "REJECTED",
    "RECEIVED",
    "REFUND_PENDING",
    "REFUNDED",
    "CLOSED",
] as const;

export type AfterSalesKind = (typeof AFTER_SALES_KINDS)[number];
export type AfterSalesStatus = (typeof AFTER_SALES_STATUSES)[number];

export type AfterSalesItemInput = {
    orderItemId: number;
    quantity: number;
    reason?: string;
};

export type AfterSalesCreateInput = {
    orderId: number;
    kind: AfterSalesKind;
    reason: string;
    items: AfterSalesItemInput[];
    idempotencyKey: string;
};

export type AfterSalesGuestCreateInput = AfterSalesCreateInput & {
    guestOrderToken: string;
};

export type AfterSalesListQuery = {
    page: number;
    limit: number;
    status?: AfterSalesStatus;
    kind?: AfterSalesKind;
};

export type AfterSalesStatusTransition = {
    status: AfterSalesStatus;
    note?: string;
};

export type RefundConfirmationInput = {
    refundReference: string;
    currency: string;
    idempotencyKey: string;
    note?: string;
};

export type EligibilityResult = {
    eligible: boolean;
    code?: "ORDER_NOT_ELIGIBLE" | "ORDER_NOT_DELIVERED" | "RETURN_WINDOW_EXPIRED" | "WARRANTY_NOT_ACTIVE";
    message?: string;
    eligibleUntil?: string;
};

export type AfterSalesOrderContext = {
    id?: number;
    orderStatus: number;
    deliveredAt: string | Date | null;
    warrantyMonths: number | null;
    currency?: string | null;
    paymentMethod?: string | null;
    guestEmail?: string | null;
    guestName?: string | null;
    guestPhone?: string | null;
};

export type AfterSalesOrderItem = {
    id: number;
    orderId: number;
    productId: number;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    productName: string | null;
    sku: string | null;
    warrantyMonths: number | null;
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
    items?: Array<AfterSalesItemInput & { id: number; productName?: string | null; unitPrice?: number }>;
    events?: Array<{ id: number; fromStatus: AfterSalesStatus | null; toStatus: AfterSalesStatus; actorUserId: string | null; note: string | null; createdAt: string }>;
    order?: AfterSalesOrderContext;
    guestOrderTokenHash?: string;
};

export type AfterSalesListPage = {
    requests: AfterSalesRequest[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
};
