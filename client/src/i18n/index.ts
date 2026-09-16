import en, { type Dictionary } from "./en";
import vi from "./vi";
import { cartTranslations } from "./cart";

export type Locale = "en" | "vi";

export const SUPPORTED_LOCALES: Locale[] = ["en", "vi"];
export const DEFAULT_LOCALE: Locale = "en";

const withCartTranslations = (dictionary: Dictionary, locale: Locale): Dictionary => ({
    ...dictionary,
    cart: {
        ...dictionary.cart,
        ...cartTranslations[locale],
    },
}) as Dictionary;

export const dictionaries: Record<Locale, Dictionary> = {
    en: withCartTranslations(en, "en"),
    vi: withCartTranslations(vi, "vi"),
};

export const isLocale = (value: string | null | undefined): value is Locale =>
    value === "en" || value === "vi";

export type { Dictionary };
