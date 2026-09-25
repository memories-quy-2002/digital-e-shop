import { useMemo } from "react";
import { useLocale } from "../context/LocaleContext";
import type { Dictionary } from "../i18n";

const resolvePath = (source: Dictionary, path: string): unknown => {
    return path.split(".").reduce<unknown>((acc, segment) => {
        if (acc && typeof acc === "object" && segment in (acc as Record<string, unknown>)) {
            return (acc as Record<string, unknown>)[segment];
        }
        return undefined;
    }, source);
};

export const useT = () => {
    const { t } = useLocale();

    return useMemo(() => {
        const translate = (key: string, ...args: unknown[]): unknown => {
            const resolved = resolvePath(t, key);
            if (typeof resolved === "string") {
                return resolved;
            }
            if (typeof resolved === "function") {
                try {
                    const formatted: unknown = Reflect.apply(resolved, undefined, args);
                    if (typeof formatted === "string") {
                        return formatted;
                    }
                } catch {
                    /* ignore formatter errors */
                }
            }
            if (resolved !== undefined) {
                return resolved;
            }
            return key;
        };
        return translate as (key: string, ...args: unknown[]) => string;
    }, [t]);
};

export type Translator = ReturnType<typeof useT>;
