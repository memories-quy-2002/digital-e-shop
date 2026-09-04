import { describe, expect, it } from "vitest";
import { isAllowedOrigin } from "../cors.config";

describe("CORS origins", () => {
    it("allows any localhost port during local development", () => {
        expect(isAllowedOrigin("http://localhost:5174")).toBe(true);
        expect(isAllowedOrigin("http://127.0.0.1:4317")).toBe(true);
    });

    it("rejects unrelated origins", () => {
        expect(isAllowedOrigin("https://malicious.example.test")).toBe(false);
    });
});
