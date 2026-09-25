export const AFTER_SALES_KIND = {
    RETURN: "RETURN",
    WARRANTY: "WARRANTY",
} as const;

export const AFTER_SALES_STATUS = {
    REQUESTED: "REQUESTED",
    APPROVED: "APPROVED",
    REJECTED: "REJECTED",
    RECEIVED: "RECEIVED",
    REFUND_PENDING: "REFUND_PENDING",
    REFUNDED: "REFUNDED",
    CLOSED: "CLOSED",
} as const;

export const AFTER_SALES_ERROR_CODE = {
    IDEMPOTENCY_CONFLICT: "IDEMPOTENCY_CONFLICT",
    ORDER_NOT_FOUND: "ORDER_NOT_FOUND",
    DUPLICATE_ITEM: "DUPLICATE_ITEM",
    ITEM_NOT_IN_ORDER: "ITEM_NOT_IN_ORDER",
    QUANTITY_UNAVAILABLE: "QUANTITY_UNAVAILABLE",
    REQUEST_NOT_FOUND: "REQUEST_NOT_FOUND",
    REFUND_ALREADY_CONFIRMED: "REFUND_ALREADY_CONFIRMED",
    REFUND_NOT_READY: "REFUND_NOT_READY",
    PAYMENT_LEDGER_NOT_FOUND: "PAYMENT_LEDGER_NOT_FOUND",
    REFUND_AMOUNT_INVALID: "REFUND_AMOUNT_INVALID",
    REFUND_AMOUNT_EXCEEDS_BALANCE: "REFUND_AMOUNT_EXCEEDS_BALANCE",
    REFUND_CURRENCY_MISMATCH: "REFUND_CURRENCY_MISMATCH",
    PAYMENT_NOT_REFUNDABLE: "PAYMENT_NOT_REFUNDABLE",
    REFUND_PROVIDER_UNAVAILABLE: "REFUND_PROVIDER_UNAVAILABLE",
    REFUND_PROVIDER_FAILED: "REFUND_PROVIDER_FAILED",
    REFUND_PROVIDER_REJECTED: "REFUND_PROVIDER_REJECTED",
    ORDER_NOT_ELIGIBLE: "ORDER_NOT_ELIGIBLE",
    ORDER_NOT_DELIVERED: "ORDER_NOT_DELIVERED",
    RETURN_WINDOW_EXPIRED: "RETURN_WINDOW_EXPIRED",
    WARRANTY_NOT_ACTIVE: "WARRANTY_NOT_ACTIVE",
    INVALID_TRANSITION: "INVALID_TRANSITION",
} as const;

export const AFTER_SALES_KINDS = [AFTER_SALES_KIND.RETURN, AFTER_SALES_KIND.WARRANTY] as const;
export const AFTER_SALES_STATUSES = [
    AFTER_SALES_STATUS.REQUESTED,
    AFTER_SALES_STATUS.APPROVED,
    AFTER_SALES_STATUS.REJECTED,
    AFTER_SALES_STATUS.RECEIVED,
    AFTER_SALES_STATUS.REFUND_PENDING,
    AFTER_SALES_STATUS.REFUNDED,
    AFTER_SALES_STATUS.CLOSED,
] as const;

export type AfterSalesKind = (typeof AFTER_SALES_KINDS)[number];
export type AfterSalesStatus = (typeof AFTER_SALES_STATUSES)[number];
export type AfterSalesErrorCode = (typeof AFTER_SALES_ERROR_CODE)[keyof typeof AFTER_SALES_ERROR_CODE];
export type AfterSalesEligibilityErrorCode =
    | typeof AFTER_SALES_ERROR_CODE.ORDER_NOT_ELIGIBLE
    | typeof AFTER_SALES_ERROR_CODE.ORDER_NOT_DELIVERED
    | typeof AFTER_SALES_ERROR_CODE.RETURN_WINDOW_EXPIRED
    | typeof AFTER_SALES_ERROR_CODE.WARRANTY_NOT_ACTIVE;

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

export type AfterSalesPaymentContext = {
    id: number;
    orderId: number;
    provider: string;
    status: string;
    providerPaymentId: string | null;
    providerReference: string | null;
    amount: number;
    refundedAmount: number;
    currency: string;
};

export type AfterSalesRefundContext = {
    request: AfterSalesRequest;
    requestedAmount: number;
    payment: AfterSalesPaymentContext | null;
};

export type EligibilityResult = {
    eligible: boolean;
    code?: AfterSalesEligibilityErrorCode;
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
