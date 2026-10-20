import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { DEFAULT_LOCALE, englishDictionary, isLocale, loadDictionary, type Locale, type Dictionary } from "../i18n";

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
    const [dictionary, setDictionary] = useState<Dictionary | null>(() =>
        locale === "en" ? englishDictionary : null,
    );

    useEffect(() => {
        if (dictionary) return;

        let active = true;
        void loadDictionary(locale)
            .then((loadedDictionary) => {
                if (active) setDictionary(loadedDictionary);
            })
            .catch(() => {
                if (!active) return;
                // Keep the application usable if the selected locale chunk cannot be fetched.
                setLocaleState(DEFAULT_LOCALE);
                setStored(DEFAULT_LOCALE);
                setDictionary(englishDictionary);
            });

        return () => {
            active = false;
        };
    }, [dictionary, locale, setStored]);

    useEffect(() => {
        if (typeof document !== "undefined") {
            document.documentElement.lang = locale;
        }
    }, [locale]);

    const setLocale = useCallback(
        (next: Locale) => {
            if (next === "en") {
                setDictionary(englishDictionary);
                setLocaleState(next);
                setStored(next);
                return;
            }

            void loadDictionary(next)
                .then((nextDictionary) => {
                    setDictionary(nextDictionary);
                    setLocaleState(next);
                    setStored(next);
                })
                .catch(() => {
                    // Keep the current locale; a later selection can retry the failed chunk request.
                });
        },
        [setStored],
    );

    const toggleLocale = useCallback(() => {
        setLocale(locale === "en" ? "vi" : "en");
    }, [locale, setLocale]);

    const value = useMemo<LocaleContextValue>(
        () => ({ locale, setLocale, toggleLocale, t: dictionary ?? englishDictionary }),
        [dictionary, locale, setLocale, toggleLocale],
    );

    if (!dictionary) {
        return <div role="status" aria-busy="true">Loading language…</div>;
    }

    return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
};

export const useLocale = (): LocaleContextValue => {
    const context = useContext(LocaleContext);
    if (!context) {
        throw new Error("useLocale must be used within a LocaleProvider");
    }
    return context;
};
