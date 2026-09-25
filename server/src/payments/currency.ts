import { PAYMENT_CURRENCY, type PaymentCurrency, type PaymentProviderName, type PaymentQuote } from "./payment.types";
import { CURRENCY_CODE, CURRENCY_FORMATTING } from "#src/shared/constants/currency";

type HistoricalPaymentCurrency = PaymentCurrency | typeof CURRENCY_CODE.USD;

export function formatPaymentAmount(value: number, currency: HistoricalPaymentCurrency = PAYMENT_CURRENCY.VND): string {
    const formatting = CURRENCY_FORMATTING[currency];
    return new Intl.NumberFormat(formatting.locale, {
        style: "currency",
        currency,
        minimumFractionDigits: formatting.fractionDigits,
        maximumFractionDigits: formatting.fractionDigits,
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
        baseCurrency: PAYMENT_CURRENCY.VND,
        amount,
        currency: PAYMENT_CURRENCY.VND,
        fxRate: 1,
    };
}
