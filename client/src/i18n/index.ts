import en, { type Dictionary } from "./en";
import { cartTranslations } from "./cart";
import type adminEN from "./admin-en";

export type Locale = "en" | "vi";
export type AdminDictionary = typeof adminEN;

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

const adminDictionaryLoads = new Map<Locale, Promise<AdminDictionary>>();

/** Load Admin-only translation namespaces after an Admin surface is entered. */
export const loadAdminDictionary = (locale: Locale): Promise<AdminDictionary> => {
    const cached = adminDictionaryLoads.get(locale);
    if (cached) return cached;

    const loading = (locale === "en" ? import("./admin-en") : import("./admin-vi"))
        .then(({ default: dictionary }) => dictionary)
        .catch((error: unknown) => {
            adminDictionaryLoads.delete(locale);
            throw error;
        });
    adminDictionaryLoads.set(locale, loading);
    return loading;
};

export const withAdminDictionary = <T extends Dictionary>(
    dictionary: T,
    adminDictionary: AdminDictionary,
) => ({
    ...dictionary,
    ...adminDictionary,
    shipping: { ...dictionary.shipping, ...adminDictionary.shipping },
});

export const isLocale = (value: string | null | undefined): value is Locale =>
    value === "en" || value === "vi";

export type { Dictionary };
