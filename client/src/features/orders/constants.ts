export const PAYMENT_METHOD = {
    CASH: "cash",
    PAYOS: "payos",
} as const;

export const PAYMENT_STATUS = {
    PENDING: "pending",
    PAID: "paid",
} as const;

export const HISTORICAL_PAYMENT_METHOD = {
    BANK_TRANSFER: "bank_transfer",
    STRIPE: "stripe",
    CARD: "card",
} as const;

export type PaymentMethod = (typeof PAYMENT_METHOD)[keyof typeof PAYMENT_METHOD];
export type PayOSPaymentMethod = typeof PAYMENT_METHOD.PAYOS;
