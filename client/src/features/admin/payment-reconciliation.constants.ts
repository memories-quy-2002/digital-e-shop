export const PAYMENT_RECONCILIATION_LIMIT = {
    DEFAULT: 50,
    MAX: 100,
} as const;

export const PAYMENT_RECONCILIATION_STATUS = {
    PENDING: "PENDING",
    MATCHED: "MATCHED",
    MISMATCH: "MISMATCH",
    UNAVAILABLE: "UNAVAILABLE",
    MANUAL_CONFIRMED: "MANUAL_CONFIRMED",
} as const;

export const PAYMENT_RECONCILIATION_TARGET_TYPE = {
    PENDING_CHECKOUT: "pending_checkout",
    ORDER_PAYMENT: "order_payment",
} as const;

export type PaymentReconciliationStatus =
    (typeof PAYMENT_RECONCILIATION_STATUS)[keyof typeof PAYMENT_RECONCILIATION_STATUS];
export type PaymentReconciliationTargetType =
    (typeof PAYMENT_RECONCILIATION_TARGET_TYPE)[keyof typeof PAYMENT_RECONCILIATION_TARGET_TYPE];
