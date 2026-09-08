import type { PaymentProviderName, PaymentQuote } from "./payment.types";

export function convertUsdToVnd(amountUsd: number, rate: number): number {
    if (!Number.isFinite(amountUsd) || amountUsd < 0 || !Number.isFinite(rate) || rate <= 0) {
        throw new Error("Invalid USD/VND conversion inputs");
    }

    return Math.round(amountUsd * rate);
}

export function buildPaymentQuote(
    baseAmountUsd: number,
    provider: PaymentProviderName,
    usdToVndRate?: number,
): PaymentQuote {
    if (!Number.isFinite(baseAmountUsd) || baseAmountUsd < 0) {
        throw new Error("Invalid USD base amount");
    }

    if (provider === "payos") {
        if (!Number.isFinite(usdToVndRate) || Number(usdToVndRate) <= 0) {
            throw new Error("PAYOS_USD_TO_VND_RATE must be configured for PayOS");
        }

        return {
            baseAmount: Number(baseAmountUsd.toFixed(2)),
            baseCurrency: "USD",
            amount: convertUsdToVnd(baseAmountUsd, Number(usdToVndRate)),
            currency: "VND",
            fxRate: Number(usdToVndRate),
        };
    }

    return {
        baseAmount: Number(baseAmountUsd.toFixed(2)),
        baseCurrency: "USD",
        amount: Number(baseAmountUsd.toFixed(2)),
        currency: "USD",
        fxRate: 1,
    };
}
