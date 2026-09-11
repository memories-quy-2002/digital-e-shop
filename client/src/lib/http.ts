import axios, { AxiosRequestHeaders } from "axios";
import { API_BASE_URL } from "./env";

declare module "axios" {
    export interface AxiosRequestConfig {
        handlerEnabled?: boolean;
        _retry?: boolean;
        _authRetry?: boolean;
    }
}

const csrfHeaderName = "x-csrf-token";
let csrfTokenCache = "";
let refreshPromise: Promise<void> | null = null;

const authEndpointPaths = new Set([
    "/api/users/login",
    "/api/users/register",
    "/api/users/refresh",
    "/api/users/logout",
]);

const isAuthEndpoint = (url?: string) => {
    if (!url) return false;

    try {
        return authEndpointPaths.has(new URL(url, API_BASE_URL).pathname);
    } catch {
        return authEndpointPaths.has(url.split("?")[0]);
    }
};

const csrfClient = axios.create({
    baseURL: API_BASE_URL,
    withCredentials: true,
});

const http = axios.create({
    baseURL: API_BASE_URL,
    withCredentials: true,
    handlerEnabled: true,
});

const fetchCsrfToken = async () => {
    const response = await csrfClient.get("/api/users/csrf");
    const token = response.data?.csrfToken || "";
    if (token) {
        csrfTokenCache = token;
    }
    return token;
};

const refreshAccessToken = () => {
    if (!refreshPromise) {
        refreshPromise = http.post("/api/users/refresh")
            .then(() => undefined)
            .finally(() => {
                refreshPromise = null;
            });
    }

    return refreshPromise;
};

http.interceptors.request.use(async (config) => {
    const method = (config.method || "get").toLowerCase();
    const isSafe = method === "get" || method === "head" || method === "options";
    if (isSafe) return config;

    let token = csrfTokenCache;
    if (!token) {
        try {
            token = await fetchCsrfToken();
        } catch {
            return config;
        }
    }

    if (token) {
        config.headers = {
            ...config.headers,
            [csrfHeaderName]: token,
        } as unknown as AxiosRequestHeaders;
    }

    return config;
});

http.interceptors.response.use(
    (response) => response,
    async (error) => {
        const config = error.config;
        const status = error.response?.status;
        const errorMsg = error.response?.data?.error || error.response?.data?.msg;

        if (status === 401 && config && !config._authRetry && !isAuthEndpoint(config.url)) {
            config._authRetry = true;
            try {
                await refreshAccessToken();
                return http(config);
            } catch {
                return Promise.reject(error);
            }
        }

        if (status === 403 && !config?._retry && String(errorMsg).includes("CSRF")) {
            try {
                config._retry = true;
                csrfTokenCache = "";
                const token = await fetchCsrfToken();
                if (token) {
                    config.headers = {
                        ...config.headers,
                        [csrfHeaderName]: token,
                    };
                }
                return http(config);
            } catch {
                return Promise.reject(error);
            }
        }

        return Promise.reject(error);
    },
);

export default http;
