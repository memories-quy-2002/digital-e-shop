import { CURRENCY_CODE, CURRENCY_FORMATTING, type CurrencyCode } from "../constants/currency";

export const formatMoney = (
    value: number | string | null | undefined,
    currency: CurrencyCode = CURRENCY_CODE.VND,
) => new Intl.NumberFormat(CURRENCY_FORMATTING[currency].locale, {
    style: "currency",
    currency,
    maximumFractionDigits: CURRENCY_FORMATTING[currency].fractionDigits,
}).format(Number(value) || 0);

export const formatCurrency = (value: number | string | null | undefined) =>
    formatMoney(value, CURRENCY_CODE.VND);

export const formatCurrencyNumber = (value: number | string | null | undefined) =>
    new Intl.NumberFormat(CURRENCY_FORMATTING[CURRENCY_CODE.VND].locale, {
        maximumFractionDigits: CURRENCY_FORMATTING[CURRENCY_CODE.VND].fractionDigits,
    }).format(Number(value) || 0);
