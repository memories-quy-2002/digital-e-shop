import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { DEFAULT_LOCALE, dictionaries, isLocale, type Locale, type Dictionary } from "../i18n";

const STORAGE_KEY = "digital-e:locale:v1";

type LocaleContextValue = {
    locale: Locale;
    setLocale: (next: Locale) => void;
    toggleLocale: () => void;
    t: Dictionary;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

const detectInitialLocale = (): Locale => {
    if (typeof navigator !== "undefined") {
        const candidate = navigator.language?.toLowerCase().split("-")[0];
        if (isLocale(candidate)) {
            return candidate;
        }
    }
    return DEFAULT_LOCALE;
};

export const LocaleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [stored, setStored] = useLocalStorage<string>(STORAGE_KEY, "");
    const [locale, setLocaleState] = useState<Locale>(() =>
        isLocale(stored) ? stored : detectInitialLocale(),
    );

    useEffect(() => {
        if (typeof document !== "undefined") {
            document.documentElement.lang = locale;
        }
    }, [locale]);

    const setLocale = useCallback(
        (next: Locale) => {
            setLocaleState(next);
            setStored(next);
        },
        [setStored],
    );

    const toggleLocale = useCallback(() => {
        setLocaleState((current) => (current === "en" ? "vi" : "en"));
    }, []);

    const value = useMemo<LocaleContextValue>(
        () => ({ locale, setLocale, toggleLocale, t: dictionaries[locale] }),
        [locale, setLocale, toggleLocale],
    );

    return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
};

export const useLocale = (): LocaleContextValue => {
    const context = useContext(LocaleContext);
    if (!context) {
        throw new Error("useLocale must be used within a LocaleProvider");
    }
    return context;
};
