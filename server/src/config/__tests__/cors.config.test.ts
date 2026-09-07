import { describe, expect, it } from "vitest";
import { isAllowedOrigin, resolveAllowedOrigins } from "../cors.config";

describe("CORS origins", () => {
    it("allows any localhost port during local development", () => {
        expect(isAllowedOrigin("http://localhost:5174")).toBe(true);
        expect(isAllowedOrigin("http://127.0.0.1:4317")).toBe(true);
    });

    it("rejects unrelated origins", () => {
        expect(isAllowedOrigin("https://malicious.example.test")).toBe(false);
    });

    it("does not include localhost in production origins", () => {
        expect(resolveAllowedOrigins({ isProduction: true })).toEqual([
            "https://digital-e.vercel.app",
        ]);
    });

    it("uses only the configured production client origin", () => {
        expect(resolveAllowedOrigins({
            clientUrl: "https://staging.digital-e.example",
            isProduction: true,
        })).toEqual(["https://staging.digital-e.example"]);
    });
});
