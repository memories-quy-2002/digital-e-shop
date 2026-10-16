export const toVietnamDateTimeInput = (value: string): string => {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Ho_Chi_Minh",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    }).formatToParts(new Date(value));
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || "";
    return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
};

export const formatVietnamDateTime = (value: string, locale: "en" | "vi"): string => new Intl.DateTimeFormat(
    locale === "vi" ? "vi-VN" : "en-GB",
    { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "medium", timeStyle: "short" },
).format(new Date(value));

export const getDefaultVietnamSchedule = (now = new Date()) => {
    const start = new Date(now.getTime() + 60 * 60 * 1000);
    const end = new Date(now.getTime() + 3 * 60 * 60 * 1000);
    return { start: toVietnamDateTimeInput(start.toISOString()), end: toVietnamDateTimeInput(end.toISOString()) };
};
