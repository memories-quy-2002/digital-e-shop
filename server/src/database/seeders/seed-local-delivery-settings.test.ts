import { describe, expect, it } from "vitest";

const { isAllowedEndpoint } = require("./seed-local-delivery-settings.js") as {
    isAllowedEndpoint: (configured: string, expected: string) => boolean;
};

const trusted = "https://router.project-osrm.org";

describe("local delivery seed endpoint allowlist", () => {
    it("accepts a precise endpoint inside a comma-separated list", () => {
        expect(isAllowedEndpoint(`https://example.test, ${trusted}`, trusted)).toBe(true);
        expect(isAllowedEndpoint("https://tile.openstreetmap.org/{z}/{x}/{y}.png",
            "https://tile.openstreetmap.org/{z}/{x}/{y}.png")).toBe(true);
    });

    it.each([
        "https://router.project-osrm.org.evil.example",
        "https://router.project-osrm.org@evil.example",
        "https://evil.example/https://router.project-osrm.org",
        "http://router.project-osrm.org",
        "https://router.project-osrm.org/route",
        "https://router.project-osrm.org?redirect=https://evil.example",
        "https://router.project-osrm.org/#fragment",
        "not-a-url",
    ])("rejects a lookalike or malformed endpoint: %s", (candidate) => {
        expect(isAllowedEndpoint(candidate, trusted)).toBe(false);
    });
});
