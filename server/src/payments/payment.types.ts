export type PaymentProviderName = "cash" | "payos";

export type PayOSPaymentLookup = {
    orderCode: number;
    paymentLinkId: string;
    amount: number;
    amountPaid: number;
    status: string;
    currency: "VND";
};
export type PaymentCurrency = "VND";
export type PaymentStatus = "pending" | "paid" | "failed" | "refund_pending" | "partially_refunded" | "refunded";

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
};

export type PaymentProviderResult = {
    status: PaymentStatus;
    providerReference: string;
    refundReference?: string;
    simulated: boolean;
};

export function assertNewPaymentProvider(value: unknown): PaymentProviderName {
    if (value === "cash" || value === "payos") return value;
    throw Object.assign(new Error("Unsupported payment method"), { statusCode: 400 });
}
