import { describe, it, expect } from "vitest";
import { API_BASE_URL, resolveApiBaseUrl } from "../env";

describe("env module", () => {
    it("exports a string API base URL", () => {
        expect(typeof API_BASE_URL).toBe("string");
        expect(API_BASE_URL.length).toBeGreaterThan(0);
    });

    it("uses the local API for development even when a production URL is configured", () => {
        expect(resolveApiBaseUrl({ configuredUrl: "https://e-commerce-express-server-app.vercel.app", isProduction: false })).toBe(
            "http://localhost:4000",
        );
    });

    it("normalizes a local API URL from the development environment", () => {
        expect(resolveApiBaseUrl({ configuredUrl: "http://127.0.0.1:4000///", isProduction: false })).toBe(
            "http://127.0.0.1:4000",
        );
    });

    it("uses the production API URL only for production builds", () => {
        expect(resolveApiBaseUrl({ configuredUrl: "https://api.example.test/", isProduction: true })).toBe(
            "https://api.example.test",
        );
    });

    it("falls back to localhost when a production API URL is missing in development", () => {
        expect(resolveApiBaseUrl({ isProduction: false })).toBe("http://localhost:4000");
    });
});
