import axios from "axios";
declare module "axios" {
    export interface AxiosRequestConfig {
        handlerEnabled?: boolean;
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

api.interceptors.request.use(async (config) => {
    const method = (config.method || "get").toLowerCase();
    const isSafe = method === "get" || method === "head" || method === "options";
    if (isSafe) return config;

    let token = csrfTokenCache;
    if (!token) {
        try {
            const response = await csrfClient.get("/api/csrf");
            token = response.data?.csrfToken || "";
            if (token) {
                csrfTokenCache = token;
            }
        } catch {
            return config;
        }
    }

    if (token) {
        config.headers = {
            ...config.headers,
            [csrfHeaderName]: token,
        };
    }

    return config;
});

export default api;
