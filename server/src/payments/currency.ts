import type { PaymentCurrency, PaymentProviderName, PaymentQuote } from "./payment.types";

type HistoricalPaymentCurrency = PaymentCurrency | "USD";

export function formatPaymentAmount(value: number, currency: HistoricalPaymentCurrency = "VND"): string {
    const fractionDigits = currency === "VND" ? 0 : 2;
    return new Intl.NumberFormat(currency === "VND" ? "vi-VN" : "en-US", {
        style: "currency",
        currency,
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
    }).format(Number(value) || 0);
}

export function buildPaymentQuote(
    baseAmount: number,
    _provider: PaymentProviderName,
): PaymentQuote {
    void _provider;
    if (!Number.isFinite(baseAmount) || baseAmount < 0) {
        throw new Error("Invalid VND base amount");
    }
    const amount = Math.round(baseAmount);
    if (!Number.isSafeInteger(amount)) {
        throw new Error("VND amount must be a safe integer");
    }
    return {
        baseAmount: amount,
        baseCurrency: "VND",
        amount,
        currency: "VND",
        fxRate: 1,
    };
}
