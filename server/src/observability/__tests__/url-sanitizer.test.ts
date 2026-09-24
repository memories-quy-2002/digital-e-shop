import { describe, expect, it } from "vitest";
import { sanitizeTelemetryUrl } from "../url-sanitizer";

describe("sanitizeTelemetryUrl", () => {
    it("removes query strings, fragments, and URL credentials", () => {
        expect(
            sanitizeTelemetryUrl(
                "https://user:secret@example.test/api/orders?token=abc#receipt",
                "http://localhost",
            ),
        ).toBe("https://example.test/api/orders");
    });

    it("resolves a relative request path without retaining its query string", () => {
        expect(
            sanitizeTelemetryUrl(
                "/api/products?search=private",
                "http://localhost:4000",
            ),
        ).toBe("http://localhost:4000/api/products");
    });

    it("returns a safe fallback for invalid URLs", () => {
        expect(
            sanitizeTelemetryUrl("http://[invalid", "not a valid origin"),
        ).toBe("/");
    });
});
