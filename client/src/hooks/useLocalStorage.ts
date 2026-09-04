import { useCallback, useEffect, useState } from "react";

export function useLocalStorage<T>(key: string, defaultValue: T) {
    const [value, setValue] = useState<T>(() => {
        if (typeof window === "undefined") {
            return defaultValue;
        }
        try {
            const raw = window.localStorage.getItem(key);
            return raw === null ? defaultValue : (JSON.parse(raw) as T);
        } catch {
            return defaultValue;
        }
    });

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }
        const handleStorage = (event: StorageEvent) => {
            if (event.key !== key || event.newValue === null) {
                return;
            }
            try {
                setValue(JSON.parse(event.newValue) as T);
            } catch {
                /* ignore */
            }
        };
        window.addEventListener("storage", handleStorage);
        return () => window.removeEventListener("storage", handleStorage);
    }, [key]);

    const update = useCallback(
        (next: T | ((previous: T) => T)) => {
            setValue((previous) => {
                const resolved =
                    typeof next === "function" ? (next as (p: T) => T)(previous) : next;
                try {
                    window.localStorage.setItem(key, JSON.stringify(resolved));
                } catch {
                    /* quota or disabled storage */
                }
                return resolved;
            });
        },
        [key],
    );

    return [value, update] as const;
}
