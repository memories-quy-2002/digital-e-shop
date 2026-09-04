export const LOCAL_API_BASE_URL = "http://localhost:4000";
export const PRODUCTION_API_BASE_URL = "https://e-commerce-express-server-app.vercel.app";

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

    return normalizedUrl || PRODUCTION_API_BASE_URL;
};

export const API_BASE_URL = resolveApiBaseUrl({ configuredUrl: import.meta.env.VITE_API_BASE_URL });
