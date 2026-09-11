export const LOCAL_API_BASE_URL = "http://localhost:4000";

type ApiBaseUrlOptions = {
    configuredUrl?: string;
    isProduction?: boolean;
};

const normalizeApiBaseUrl = (value?: string) =>
    value?.trim().replace(/\/+$/, "").replace(/\/api$/i, "") || "";

const isLocalApiUrl = (value: string) => {
    try {
        const url = new URL(value);
        return (url.protocol === "http:" || url.protocol === "https:") && ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
    } catch {
        return false;
    }
};

export const resolveApiBaseUrl = ({ configuredUrl, isProduction = import.meta.env.PROD }: ApiBaseUrlOptions = {}) => {
    const normalizedUrl = normalizeApiBaseUrl(configuredUrl);

    if (!isProduction) {
        return normalizedUrl && isLocalApiUrl(normalizedUrl) ? normalizedUrl : LOCAL_API_BASE_URL;
    }

    if (!normalizedUrl) {
        throw new Error("VITE_API_BASE_URL is required for production builds");
    }

    return normalizedUrl;
};

export const API_BASE_URL = resolveApiBaseUrl({ configuredUrl: import.meta.env.VITE_API_BASE_URL });
