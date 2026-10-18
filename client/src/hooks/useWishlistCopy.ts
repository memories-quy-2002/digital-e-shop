import { useLocale } from "../context/LocaleContext";
import { wishlistCopy } from "../i18n/wishlistCopy";

export const useWishlistCopy = () => {
    const { locale } = useLocale();
    return wishlistCopy[locale];
};
