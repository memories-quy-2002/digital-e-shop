export const formatUtcDate = (value?: string | Date | null, locale = "en-GB") => {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return "Invalid date";

    return new Intl.DateTimeFormat(locale, {
        timeZone: "UTC",
        day: "2-digit",
        month: "short",
        year: "numeric",
    }).format(date);
};

export const formatUtcDateTime = (value?: string | Date | null, locale = "en-GB") => {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return "Invalid date";

    return `${new Intl.DateTimeFormat(locale, {
        timeZone: "UTC",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(date)} UTC`;
};

export const toUtcIsoString = (value?: string | Date | null) => {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return new Date().toISOString();
    return date.toISOString();
};
