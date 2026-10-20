import en, { type Dictionary } from "./en";
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

export const englishDictionary = withCartTranslations(en, "en");

// Keep this complete registry for parity checks and tooling. Runtime consumers should
// use englishDictionary/loadDictionary so the inactive locale can remain a separate chunk.
const dictionaryLoads = new Map<Locale, Promise<Dictionary>>([
    ["en", Promise.resolve(englishDictionary)],
]);

/** Load the selected locale on demand so the inactive dictionary stays out of the initial route graph. */
export const loadDictionary = (locale: Locale): Promise<Dictionary> => {
    const cached = dictionaryLoads.get(locale);
    if (cached) return cached;

    const loading = import("./vi")
        .then(({ default: vietnamese }) => withCartTranslations(vietnamese, "vi"))
        .catch((error: unknown) => {
            dictionaryLoads.delete(locale);
            throw error;
        });
    dictionaryLoads.set(locale, loading);
    return loading;
};

export const isLocale = (value: string | null | undefined): value is Locale =>
    value === "en" || value === "vi";

export type { Dictionary };
