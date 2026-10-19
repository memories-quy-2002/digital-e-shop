import { useCallback } from "react";
import { useLocale } from "../context/LocaleContext";
import { translateAdminDashboardCopy } from "../i18n/adminDashboardCopy";

/** Translates copy used by the shared Admin shell and dashboard route. */
export const useAdminDashboardCopy = () => {
    const { locale } = useLocale();
    return useCallback((source: string) => translateAdminDashboardCopy(locale, source), [locale]);
};
