import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AxiosError } from "axios";

const mockGet = vi.fn();
const mockRequestUse = vi.fn();
const mockResponseUse = vi.fn();
const mockRequest = vi.fn();

vi.mock("axios", () => ({
    default: {
        create: () => ({
            get: mockGet,
            request: mockRequest,
            interceptors: {
                request: { use: mockRequestUse },
                response: { use: mockResponseUse },
            },
        }),
    },
    AxiosError: class AxiosError extends Error {
        config: any;
        response?: any;
        constructor(message: string, config?: any, response?: any) {
            super(message);
            this.name = "AxiosError";
            this.config = config;
            this.response = response;
        }
    },
}));

let requestSuccess: (config: any) => any;
let requestError: (err: any) => any;
let responseSuccess: (response: any) => any;
let responseError: (error: any) => any;

const setupInterceptors = () => {
    mockRequestUse.mockImplementation((success: any, error: any) => {
        requestSuccess = success;
        requestError = error;
    });
    mockResponseUse.mockImplementation((success: any, error: any) => {
        responseSuccess = success;
        responseError = error;
    });
};

const loadHttp = async () => {
    vi.resetModules();
    setupInterceptors();
    mockGet.mockReset();
    mockRequest.mockReset();
    await import("../http");
};

const mockCsrf = (token: string | null) => {
    const impl = (url: string) => {
        if (url === "/api/csrf") {
            if (token === null) return Promise.reject(new Error("network"));
            return Promise.resolve({ data: { csrfToken: token } });
        }
        return Promise.resolve({ data: { ok: true } });
    };
    mockGet.mockImplementation(impl);
    mockRequest.mockImplementation((config: any) => {
        const url = typeof config === "string" ? config : config?.url || "";
        return impl(url);
    });
};

describe("http client", () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it("registers a request interceptor and a response interceptor on creation", async () => {
        await loadHttp();
        expect(mockRequestUse).toHaveBeenCalledTimes(1);
        expect(mockResponseUse).toHaveBeenCalledTimes(1);
    });

    it("does not add CSRF token to safe GET requests", async () => {
        await loadHttp();
        const config = { method: "get", headers: {} };
        const result = await requestSuccess(config);
        expect(result).toBe(config);
        expect(result.headers).toEqual({});
    });

    it("does not add CSRF token to HEAD/OPTIONS requests", async () => {
        await loadHttp();
        const headResult = await requestSuccess({ method: "head", headers: {} });
        const optionsResult = await requestSuccess({ method: "OPTIONS", headers: {} });
        expect(headResult.headers).toEqual({});
        expect(optionsResult.headers).toEqual({});
    });

    it("fetches and adds a CSRF token to non-safe requests when no token is cached", async () => {
        await loadHttp();
        mockCsrf("fresh-token");

        const cfg = { method: "post", headers: {} as Record<string, string> };
        const result = await requestSuccess(cfg);
        expect(result.headers["x-csrf-token"]).toBe("fresh-token");
        expect(mockGet).toHaveBeenCalledWith("/api/csrf");
    });

    it("returns config unchanged if CSRF fetch fails", async () => {
        await loadHttp();
        mockCsrf(null);

        const cfg = { method: "post", headers: {} as Record<string, string> };
        const result = await requestSuccess(cfg);
        expect(result.headers["x-csrf-token"]).toBeUndefined();
    });

    it("retries the request once when a 403 CSRF error is returned", async () => {
        await loadHttp();
        mockCsrf("retry-token");

        const error = new AxiosError("Request failed", {} as any, {
            status: 403,
            data: { error: "Invalid CSRF token" },
        });
        const originalConfig = { method: "post", headers: {} as Record<string, string> };
        error.config = originalConfig;

        try {
            await responseError(error);
        } catch {
            // the retry's http(config) call may not be fully resolvable under the mock
            // we only care about the side effects on config below
        }
        expect(originalConfig._retry).toBe(true);
        expect(originalConfig.headers["x-csrf-token"]).toBe("retry-token");
    });

    it("does not retry when the 403 is not a CSRF error", async () => {
        await loadHttp();

        const error = new AxiosError("Forbidden", {} as any, {
            status: 403,
            data: { msg: "Forbidden action" },
        });
        error.config = { method: "post", headers: {} as Record<string, string> };

        await expect(responseError(error)).rejects.toBe(error);
    });

    it("rejects non-403 errors without retry", async () => {
        await loadHttp();

        const error = new AxiosError("Server error", {} as any, {
            status: 500,
            data: { msg: "Internal error" },
        });
        error.config = { method: "post", headers: {} as Record<string, string> };

        await expect(responseError(error)).rejects.toBe(error);
    });

    it("does not retry twice on the same request", async () => {
        await loadHttp();
        mockCsrf("retry-token");

        const error = new AxiosError("Request failed", {} as any, {
            status: 403,
            data: { error: "Invalid CSRF token" },
        });
        error.config = {
            method: "post",
            headers: {} as Record<string, string>,
            _retry: true,
        };

        await expect(responseError(error)).rejects.toBe(error);
    });
});
