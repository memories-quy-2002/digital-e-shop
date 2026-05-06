import axios, { AxiosHeaders, AxiosRequestHeaders } from "axios";

declare module "axios" {
    export interface AxiosRequestConfig {
        handlerEnabled?: boolean;
        _retry?: boolean;
    }
}

const baseURL =
    process.env.NODE_ENV === "production"
        ? "https://e-commerce-express-server-app.vercel.app/"
        : "http://localhost:4000";

const csrfHeaderName = "x-csrf-token";
let csrfTokenCache = "";

const csrfClient = axios.create({
    baseURL,
    withCredentials: true,
});

const api = axios.create({
    baseURL,
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

api.interceptors.request.use(async (config) => {
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

api.interceptors.response.use(
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
                return api(config);
            } catch {
                return Promise.reject(error);
            }
        }

        return Promise.reject(error);
    },
);

export default api;
