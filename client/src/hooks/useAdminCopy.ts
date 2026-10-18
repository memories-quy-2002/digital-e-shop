import { useCallback } from "react";
import { useLocale } from "../context/LocaleContext";
import { translateAdminCopy } from "../i18n/adminCopy";

/** Translates shared English source copy used by the Admin screens. */
export const useAdminCopy = () => {
    const { locale } = useLocale();
    return useCallback((source: string) => translateAdminCopy(locale, source), [locale]);
};
