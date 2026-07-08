import { describe, it, expect, afterEach, vi } from "vitest";
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from "axios";

const mockGet = vi.fn();
const mockRequestUse = vi.fn();
const mockResponseUse = vi.fn();
const mockRequest = vi.fn();

vi.mock("axios", async (importOriginal) => {
    const actual = await importOriginal<typeof import("axios")>();

    return {
        ...actual,
        default: {
            ...actual.default,
            create: () => ({
                get: mockGet,
                request: mockRequest,
                interceptors: {
                    request: { use: mockRequestUse },
                    response: { use: mockResponseUse },
                },
            }),
        },
    };
});

let requestSuccess: (config: any) => any;
let responseError: (error: any) => any;

type TestRequestConfig = InternalAxiosRequestConfig & { _retry?: boolean };

const createConfig = (method: string): TestRequestConfig =>
    ({
        method,
        headers: new AxiosHeaders(),
    }) as TestRequestConfig;

const createError = (message: string, status: number, data: Record<string, string>, config = createConfig("post")) => {
    const error = new AxiosError(message, undefined, config);
    error.response = {
        status,
        data,
        statusText: "",
        headers: new AxiosHeaders(),
        config,
    };
    return { error, config };
};

const setupInterceptors = () => {
    mockRequestUse.mockImplementation((success: any) => {
        requestSuccess = success;
    });
    mockResponseUse.mockImplementation((_: any, error: any) => {
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
        const config = createConfig("get");
        const result = await requestSuccess(config);
        expect(result).toBe(config);
        expect(result.headers["x-csrf-token"]).toBeUndefined();
    });

    it("does not add CSRF token to HEAD/OPTIONS requests", async () => {
        await loadHttp();
        const headResult = await requestSuccess(createConfig("head"));
        const optionsResult = await requestSuccess(createConfig("OPTIONS"));
        expect(headResult.headers["x-csrf-token"]).toBeUndefined();
        expect(optionsResult.headers["x-csrf-token"]).toBeUndefined();
    });

    it("fetches and adds a CSRF token to non-safe requests when no token is cached", async () => {
        await loadHttp();
        mockCsrf("fresh-token");

        const cfg = createConfig("post");
        const result = await requestSuccess(cfg);
        expect(result.headers["x-csrf-token"]).toBe("fresh-token");
        expect(mockGet).toHaveBeenCalledWith("/api/csrf");
    });

    it("returns config unchanged if CSRF fetch fails", async () => {
        await loadHttp();
        mockCsrf(null);

        const cfg = createConfig("post");
        const result = await requestSuccess(cfg);
        expect(result.headers["x-csrf-token"]).toBeUndefined();
    });

    it("retries the request once when a 403 CSRF error is returned", async () => {
        await loadHttp();
        mockCsrf("retry-token");

        const { error, config: originalConfig } = createError("Request failed", 403, {
            error: "Invalid CSRF token",
        });

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

        const { error } = createError("Forbidden", 403, {
            msg: "Forbidden action",
        });

        await expect(responseError(error)).rejects.toBe(error);
    });

    it("rejects non-403 errors without retry", async () => {
        await loadHttp();

        const { error } = createError("Server error", 500, {
            msg: "Internal error",
        });

        await expect(responseError(error)).rejects.toBe(error);
    });

    it("does not retry twice on the same request", async () => {
        await loadHttp();
        mockCsrf("retry-token");

        const { error } = createError("Request failed", 403, {
            error: "Invalid CSRF token",
        });
        error.config = {
            ...createConfig("post"),
            _retry: true,
        };

        await expect(responseError(error)).rejects.toBe(error);
    });
});
