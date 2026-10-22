export type IdempotencyState = { fingerprint: string; key: string } | null;

export function reuseOrCreateIdempotencyKey(
    fingerprint: string,
    current: IdempotencyState,
    createKey: () => string,
): IdempotencyState {
    if (current?.fingerprint === fingerprint) return current;
    return { fingerprint, key: createKey() };
}

export const statusClassName = (status: string) => status.toLowerCase().replaceAll("_", "-");

export const safeInteger = (value: string) => {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : NaN;
};

export const formatVnd = (value: number, locale: "en" | "vi") =>
    new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US", {
        style: "currency",
        currency: "VND",
        maximumFractionDigits: 0,
    }).format(value);

export const formatDate = (value: string | null, locale: "en" | "vi") => {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-GB", { dateStyle: "medium", timeStyle: "short" }).format(date);
};
