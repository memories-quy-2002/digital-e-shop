import { useCallback, useEffect, useMemo } from "react";
import { useLocalStorage } from "./useLocalStorage";

export type ColorScheme = "light" | "dark" | "system";

const STORAGE_KEY = "digital-e:color-scheme:v1";

const applyScheme = (resolved: "light" | "dark") => {
    if (typeof document === "undefined") {
        return;
    }
    const root = document.documentElement;
    root.dataset.theme = resolved;
    root.style.colorScheme = resolved;
};

const resolveSystemScheme = (): "light" | "dark" => {
    if (typeof window === "undefined" || !window.matchMedia) {
        return "light";
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

export function useColorScheme() {
    const [scheme, setScheme] = useLocalStorage<ColorScheme>(STORAGE_KEY, "system");
    const resolved = useMemo<"light" | "dark">(
        () => (scheme === "system" ? resolveSystemScheme() : scheme),
        [scheme],
    );

    useEffect(() => {
        applyScheme(resolved);
    }, [resolved]);

    useEffect(() => {
        if (scheme !== "system" || typeof window === "undefined" || !window.matchMedia) {
            return undefined;
        }
        const media = window.matchMedia("(prefers-color-scheme: dark)");
        const handler = () => applyScheme(media.matches ? "dark" : "light");
        media.addEventListener("change", handler);
        return () => media.removeEventListener("change", handler);
    }, [scheme]);

    const cycle = useCallback(() => {
        setScheme((current) => {
            if (current === "light") return "dark";
            if (current === "dark") return "system";
            return "light";
        });
    }, [setScheme]);

    return { scheme, resolved, setScheme, cycle };
}
