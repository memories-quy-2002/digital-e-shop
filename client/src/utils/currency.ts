export const formatMoney = (
    value: number | string | null | undefined,
    currency: "USD" | "VND" = "VND",
) => new Intl.NumberFormat(currency === "VND" ? "vi-VN" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "VND" ? 0 : 2,
}).format(Number(value) || 0);

export const formatCurrency = (value: number | string | null | undefined) =>
    formatMoney(value, "VND");

export const formatCurrencyNumber = (value: number | string | null | undefined) =>
    new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(Number(value) || 0);
