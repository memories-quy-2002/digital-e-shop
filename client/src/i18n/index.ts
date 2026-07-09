import en, { type Dictionary } from "./en";
import vi from "./vi";

export type Locale = "en" | "vi";

export const SUPPORTED_LOCALES: Locale[] = ["en", "vi"];
export const DEFAULT_LOCALE: Locale = "en";

export const dictionaries: Record<Locale, Dictionary> = { en, vi };

export const isLocale = (value: string | null | undefined): value is Locale =>
    value === "en" || value === "vi";

export type { Dictionary };
