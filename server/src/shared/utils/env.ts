const toNumber = (value: string | undefined, fallback?: number) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }

    return parsed;
};

export const envUtils = {
    getString(name: string, fallback = "") {
        return process.env[name] || fallback;
    },
    getNumber(name: string, fallback?: number) {
        return toNumber(process.env[name], fallback);
    },
    isProduction() {
        return process.env.NODE_ENV === "production";
    },
};
