const withPrefix = (level: string, values: unknown[]) => {
    // Keep the current console-based logging style, but funnel it through one
    // place so modules stop sprinkling raw console calls everywhere.
    console[level as "log" | "warn" | "error"](...values);
};

export const logger = {
    info: (...values: unknown[]) => withPrefix("log", values),
    warn: (...values: unknown[]) => withPrefix("warn", values),
    error: (...values: unknown[]) => withPrefix("error", values),
};
