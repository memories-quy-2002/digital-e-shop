import vi from "./vi";
import { englishDictionary, type Dictionary } from "./index";
import { cartTranslations } from "./cart";

const withVietnameseCartTranslations = (dictionary: Dictionary): Dictionary => ({
    ...dictionary,
    cart: {
        ...dictionary.cart,
        ...cartTranslations.vi,
    },
}) as Dictionary;

/** Complete synchronous registry for dictionary parity tests and tooling. */
export const dictionaries: Record<"en" | "vi", Dictionary> = {
    en: englishDictionary,
    vi: withVietnameseCartTranslations(vi),
};
