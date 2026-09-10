import type { PaymentCurrency, PaymentProviderName, PaymentQuote } from "./payment.types";

export function formatPaymentAmount(value: number, currency: PaymentCurrency = "VND"): string {
    const fractionDigits = currency === "VND" ? 0 : 2;
    return new Intl.NumberFormat(currency === "VND" ? "vi-VN" : "en-US", {
        style: "currency",
        currency,
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
    }).format(Number(value) || 0);
}

export function convertUsdToVnd(amountUsd: number, rate: number): number {
    if (!Number.isFinite(amountUsd) || amountUsd < 0 || !Number.isFinite(rate) || rate <= 0) {
        throw new Error("Invalid USD/VND conversion inputs");
    }

    return Math.round(amountUsd * rate);
}

export function buildPaymentQuote(
    baseAmount: number,
    provider: PaymentProviderName,
    usdToVndRate?: number,
    baseCurrency: "USD" | "VND" = "USD",
): PaymentQuote {
    if (!Number.isFinite(baseAmount) || baseAmount < 0) {
        throw new Error(`Invalid ${baseCurrency} base amount`);
    }

    const normalizedBaseAmount = baseCurrency === "VND"
        ? Math.round(baseAmount)
        : Number(baseAmount.toFixed(2));

    if (provider === "payos") {
        if (baseCurrency === "VND") {
            return {
                baseAmount: normalizedBaseAmount,
                baseCurrency,
                amount: normalizedBaseAmount,
                currency: "VND",
                fxRate: 1,
            };
        }

        if (!Number.isFinite(usdToVndRate) || Number(usdToVndRate) <= 0) {
            throw new Error("PAYOS_USD_TO_VND_RATE must be configured for PayOS");
        }

        return {
            baseAmount: normalizedBaseAmount,
            baseCurrency: "USD",
            amount: convertUsdToVnd(baseAmount, Number(usdToVndRate)),
            currency: "VND",
            fxRate: Number(usdToVndRate),
        };
    }

    return {
        baseAmount: normalizedBaseAmount,
        baseCurrency,
        amount: normalizedBaseAmount,
        currency: baseCurrency,
        fxRate: 1,
    };
}
