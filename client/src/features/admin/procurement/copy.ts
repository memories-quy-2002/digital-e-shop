export type ProcurementLocale = "en" | "vi";

export const procurementCopy = (locale: ProcurementLocale, english: string, vietnamese: string) =>
    locale === "vi" ? vietnamese : english;
