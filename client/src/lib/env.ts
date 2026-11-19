export const LOCAL_API_BASE_URL = "http://localhost:4000";
export const API_ENVIRONMENT_STORAGE_KEY = "digital-e:api-environment:v1";

export type ApiEnvironment = "local" | "production";

const LOCAL_API_PROXY_BASE_URL = "/__local_api";
const PRODUCTION_API_PROXY_BASE_URL = "/__production_api";

type ApiBaseUrlOptions = {
    configuredUrl?: string;
    currentOrigin?: string;
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

export const resolveApiBaseUrl = ({ configuredUrl, currentOrigin, isProduction = import.meta.env.PROD }: ApiBaseUrlOptions = {}) => {
    const normalizedUrl = normalizeApiBaseUrl(configuredUrl);

    if (!isProduction) {
        if (currentOrigin && !isLocalApiUrl(currentOrigin)) {
            return normalizeApiBaseUrl(currentOrigin);
        }

        return normalizedUrl && isLocalApiUrl(normalizedUrl) ? normalizedUrl : LOCAL_API_BASE_URL;
    }

    if (!normalizedUrl) {
        throw new Error("VITE_API_BASE_URL is required for production builds");
    }

    return normalizedUrl;
};

const readApiEnvironment = (): ApiEnvironment => {
    if (!import.meta.env.DEV || typeof window === "undefined") return "local";

    try {
        return window.sessionStorage.getItem(API_ENVIRONMENT_STORAGE_KEY) === "production" ? "production" : "local";
    } catch {
        return "local";
    }
};

export const API_ENVIRONMENT = readApiEnvironment();
export const API_ENVIRONMENT_TOGGLE_ENABLED = import.meta.env.DEV
    && typeof window !== "undefined"
    && isLocalApiUrl(window.location.origin);

export const resolveDevelopmentApiBaseUrl = (environment: ApiEnvironment, currentOrigin?: string) => {
    if (currentOrigin && !isLocalApiUrl(currentOrigin)) {
        return normalizeApiBaseUrl(currentOrigin);
    }

    return environment === "production" ? PRODUCTION_API_PROXY_BASE_URL : LOCAL_API_PROXY_BASE_URL;
};

const currentOrigin = typeof window === "undefined" ? undefined : window.location.origin;

export const API_BASE_URL = import.meta.env.DEV && (!currentOrigin || isLocalApiUrl(currentOrigin))
    ? resolveDevelopmentApiBaseUrl(API_ENVIRONMENT, currentOrigin)
    : resolveApiBaseUrl({
        configuredUrl: import.meta.env.VITE_API_BASE_URL,
        currentOrigin,
    });
