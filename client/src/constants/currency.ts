export const CURRENCY_CODE = {
    USD: "USD",
    VND: "VND",
} as const;

export const CURRENCY_FORMATTING = {
    [CURRENCY_CODE.USD]: { locale: "en-US", fractionDigits: 2 },
    [CURRENCY_CODE.VND]: { locale: "vi-VN", fractionDigits: 0 },
} as const;

export type CurrencyCode = (typeof CURRENCY_CODE)[keyof typeof CURRENCY_CODE];
