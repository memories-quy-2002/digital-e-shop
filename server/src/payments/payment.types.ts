export type PaymentProviderName = "cash" | "bank_transfer" | "stripe" | "payos";
export type PaymentCurrency = "USD" | "VND";
export type PaymentStatus = "pending" | "paid" | "failed" | "refund_pending" | "refunded";

export type PaymentQuote = {
    baseAmount: number;
    baseCurrency: "USD";
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
