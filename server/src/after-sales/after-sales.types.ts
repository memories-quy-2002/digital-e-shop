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
    orderStatus: number;
    deliveredAt: string | Date | null;
    warrantyMonths: number | null;
};
