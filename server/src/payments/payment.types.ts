import { HTTP_STATUS } from "#src/shared/constants/http-status";
import { CURRENCY_CODE } from "#src/shared/constants/currency";

export const PAYMENT_PROVIDER = {
    CASH: "cash",
    PAYOS: "payos",
} as const;

export const PAYMENT_STATUS = {
    PENDING: "pending",
    PAID: "paid",
    FAILED: "failed",
    REFUND_PENDING: "refund_pending",
    PARTIALLY_REFUNDED: "partially_refunded",
    REFUNDED: "refunded",
} as const;

export const PAYMENT_RECONCILIATION_STATUS = {
    PENDING: "PENDING",
    MATCHED: "MATCHED",
    MISMATCH: "MISMATCH",
    UNAVAILABLE: "UNAVAILABLE",
    MANUAL_CONFIRMED: "MANUAL_CONFIRMED",
} as const;

export const PAYMENT_RECONCILIATION_OUTCOME = {
    MATCHED: PAYMENT_RECONCILIATION_STATUS.MATCHED,
    MISMATCH: PAYMENT_RECONCILIATION_STATUS.MISMATCH,
    UNAVAILABLE: PAYMENT_RECONCILIATION_STATUS.UNAVAILABLE,
    FAILED: "FAILED",
} as const;

export const PAYMENT_RECONCILIATION_TARGET_TYPE = {
    PENDING_CHECKOUT: "pending_checkout",
    ORDER_PAYMENT: "order_payment",
} as const;

export const PAYMENT_WEBHOOK_EVENT_STATUS = {
    PROCESSING: "PROCESSING",
    PROCESSED: "PROCESSED",
    IGNORED: "IGNORED",
    MISMATCH: "MISMATCH",
    FAILED: "FAILED",
} as const;

export const PAYMENT_PROVIDER_STATUS = {
    CASH_COLLECTED: "COLLECTED",
    PAYOS_PAID: "PAID",
    PAYOS_FAILED: "FAILED",
} as const;

export const PAYMENT_CURRENCY = {
    VND: CURRENCY_CODE.VND,
} as const;

export const PAYOS_SUCCESS_CODE = "00";

export type PaymentProviderName = (typeof PAYMENT_PROVIDER)[keyof typeof PAYMENT_PROVIDER];
export type PayOSPaymentProvider = typeof PAYMENT_PROVIDER.PAYOS;

export type PayOSPaymentLookup = {
    orderCode: number;
    paymentLinkId: string;
    amount: number;
    amountPaid: number;
    status: string;
    currency: typeof PAYMENT_CURRENCY.VND;
};
export type PaymentCurrency = (typeof PAYMENT_CURRENCY)[keyof typeof PAYMENT_CURRENCY];
export type PaymentStatus = (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS];
export type PaymentReconciliationTargetType =
    (typeof PAYMENT_RECONCILIATION_TARGET_TYPE)[keyof typeof PAYMENT_RECONCILIATION_TARGET_TYPE];
export type PaymentReconciliationOutcome =
    (typeof PAYMENT_RECONCILIATION_OUTCOME)[keyof typeof PAYMENT_RECONCILIATION_OUTCOME];

export type PaymentQuote = {
    baseAmount: number;
    baseCurrency: PaymentCurrency;
    amount: number;
    currency: PaymentCurrency;
    fxRate: number;
};

export type CreatePaymentInput = {
    provider: PaymentProviderName;
    orderId: number;
    amount: number;
    currency: PaymentCurrency;
    providerPaymentId?: string | null;
    providerReference?: string | null;
};

export type RefundPaymentInput = {
    provider: PaymentProviderName;
    orderId: number;
    paymentId: string;
    amount: number;
    currency: PaymentCurrency;
    idempotencyKey?: string;
};

export type PaymentProviderResult = {
    status: PaymentStatus;
    providerReference: string;
    refundReference?: string;
    simulated: boolean;
};

export function assertNewPaymentProvider(value: unknown): PaymentProviderName {
    if (value === PAYMENT_PROVIDER.CASH || value === PAYMENT_PROVIDER.PAYOS) return value;
    throw Object.assign(new Error("Unsupported payment method"), { statusCode: HTTP_STATUS.BAD_REQUEST });
}
