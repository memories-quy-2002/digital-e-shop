import axios, { AxiosRequestHeaders } from "axios";
import { API_BASE_URL } from "./env";

declare module "axios" {
    export interface AxiosRequestConfig {
        handlerEnabled?: boolean;
        _retry?: boolean;
    }
}

const csrfHeaderName = "x-csrf-token";
let csrfTokenCache = "";

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
    const response = await csrfClient.get("/api/csrf");
    const token = response.data?.csrfToken || "";
    if (token) {
        csrfTokenCache = token;
    }
    return token;
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
