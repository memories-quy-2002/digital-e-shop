import { describe, expect, it } from "vitest";

const { isAllowedEndpoint } = require("./seed-local-delivery-settings.js") as {
    isAllowedEndpoint: (configured: string, expected: string) => boolean;
};

const trusted = "https://api.geoapify.com/v1/routing";

describe("local delivery seed endpoint allowlist", () => {
    it("accepts a precise endpoint inside a comma-separated list", () => {
        expect(isAllowedEndpoint(`https://example.test, ${trusted}`, trusted)).toBe(true);
        expect(isAllowedEndpoint("https://tile.openstreetmap.org/{z}/{x}/{y}.png",
            "https://tile.openstreetmap.org/{z}/{x}/{y}.png")).toBe(true);
    });

    it.each([
        "https://api.geoapify.com.evil.example/v1/routing",
        "https://api.geoapify.com@evil.example/v1/routing",
        "https://evil.example/https://api.geoapify.com/v1/routing",
        "http://api.geoapify.com/v1/routing",
        "https://api.geoapify.com/v1/routing/extra",
        "https://api.geoapify.com/v1/routing?redirect=https://evil.example",
        "https://api.geoapify.com/v1/routing#fragment",
        "not-a-url",
    ])("rejects a lookalike or malformed endpoint: %s", (candidate) => {
        expect(isAllowedEndpoint(candidate, trusted)).toBe(false);
    });
});
