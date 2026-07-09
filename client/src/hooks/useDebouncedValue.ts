import { useEffect, useState } from "react";

export function useDebouncedValue<T>(value: T, delayMs = 300) {
    const [debounced, setDebounced] = useState(value);

    useEffect(() => {
        if (delayMs <= 0) {
            setDebounced(value);
            return undefined;
        }
        const timer = window.setTimeout(() => setDebounced(value), delayMs);
        return () => window.clearTimeout(timer);
    }, [value, delayMs]);

    return debounced;
}
