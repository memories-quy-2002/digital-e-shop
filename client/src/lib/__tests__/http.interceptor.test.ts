import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from "axios";

const instances: AxiosInstance[] = [];

vi.mock("axios", async () => {
    const actual = await vi.importActual<typeof import("axios")>("axios");

    return {
        ...actual,
        default: {
            ...actual.default,
            create: (config?: Parameters<typeof actual.default.create>[0]) => {
                const instance = actual.default.create(config);
                instances.push(instance);
                return instance;
            },
        },
    };
});

type AdapterResponse = {
    data: unknown;
    status: number;
    statusText: string;
    headers: Record<string, string>;
    config: InternalAxiosRequestConfig;
};

const responseFor = (config: InternalAxiosRequestConfig, status: number, data: unknown): AdapterResponse => ({
    data,
    status,
    statusText: status === 200 ? "OK" : "Unauthorized",
    headers: {},
    config,
});

const settleResponse = (config: InternalAxiosRequestConfig, status: number, data: unknown) => {
    const response = responseFor(config, status, data);
    if (status >= 400) {
        throw new AxiosError("Request failed", "ERR_BAD_REQUEST", config, undefined, response);
    }
    return response;
};

describe("http auth refresh interceptor", () => {
    let http: typeof import("../http").default;
    let csrfClient: AxiosInstance;

    beforeEach(async () => {
        vi.resetModules();
        instances.length = 0;
        ({ default: http } = await import("../http"));
        csrfClient = instances[0];
        expect(instances).toHaveLength(2);
        csrfClient.defaults.adapter = async (config) => settleResponse(config, 200, { csrfToken: "csrf-token" });
        localStorage.clear();
        sessionStorage.clear();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("refreshes with cookies and retries one expired access request through the real interceptor chain", async () => {
        const requests: InternalAxiosRequestConfig[] = [];
        let protectedAttempts = 0;

        http.defaults.adapter = async (config) => {
            requests.push(config);

            if (config.url === "/api/users/refresh") {
                return responseFor(config, 200, { token: "refreshed-access-token" });
            }

            if (config.url === "/api/protected") {
                protectedAttempts += 1;
                return settleResponse(config, protectedAttempts === 1 ? 401 : 200, { ok: protectedAttempts > 1 });
            }

            throw new Error(`Unexpected request: ${config.method} ${config.url}`);
        };

        await expect(http.get("/api/protected")).resolves.toMatchObject({ data: { ok: true } });

        expect(requests.map(({ method, url }) => `${method}:${url}`)).toEqual([
            "get:/api/protected",
            "post:/api/users/refresh",
            "get:/api/protected",
        ]);
        const refreshRequest = requests[1];
        expect(refreshRequest.withCredentials).toBe(true);
        expect(refreshRequest.data).toBeUndefined();
        expect(refreshRequest.headers["x-csrf-token"]).toBe("csrf-token");
        expect(localStorage.getItem("refreshToken")).toBeNull();
    });

    it("does not refresh auth endpoint failures", async () => {
        const requests: string[] = [];
        http.defaults.adapter = async (config) => {
            requests.push(`${config.method}:${config.url}`);
            return settleResponse(config, 401, { msg: "Invalid credentials" });
        };

        await expect(http.post("/api/users/login", { idToken: "firebase-id-token" })).rejects.toMatchObject({
            response: { status: 401 },
        });

        expect(requests).toEqual(["post:/api/users/login"]);
    });

    it("does not loop when the cookie refresh itself is unauthorized", async () => {
        let refreshAttempts = 0;
        let protectedAttempts = 0;
        http.defaults.adapter = async (config) => {
            if (config.url === "/api/users/refresh") {
                refreshAttempts += 1;
                return settleResponse(config, 401, { msg: "Invalid refresh token" });
            }

            protectedAttempts += 1;
            return settleResponse(config, 401, { msg: "Expired access token" });
        };

        await expect(http.get("/api/protected")).rejects.toMatchObject({
            response: { status: 401 },
        });

        expect(protectedAttempts).toBe(1);
        expect(refreshAttempts).toBe(1);
    });
});
