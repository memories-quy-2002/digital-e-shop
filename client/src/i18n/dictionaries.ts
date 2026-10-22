import vi from "./vi";
import { englishDictionary, type Dictionary } from "./index";
import { cartTranslations } from "./cart";
import adminEN from "./admin-en";
import adminVI from "./admin-vi";
import { withAdminDictionary } from "./index";

const withVietnameseCartTranslations = (dictionary: Dictionary): Dictionary => ({
    ...dictionary,
    cart: {
        ...dictionary.cart,
        ...cartTranslations.vi,
    },
}) as Dictionary;

/** Complete synchronous registry for dictionary parity tests and tooling. */
export const dictionaries: Record<"en" | "vi", Dictionary> = {
    en: withAdminDictionary(englishDictionary, adminEN),
    vi: withAdminDictionary(withVietnameseCartTranslations(vi), adminVI),
};
