import { describe, expect, it, vi } from "vitest";

vi.mock("../database-target.js", () => ({
    assertSafeDatabaseTarget: vi.fn(),
}));

import { resolveEnvPath } from "../env.config";

describe("resolveEnvPath", () => {
    it("skips a comments-only local env file and falls back to the next configured file", () => {
        const contents: Record<string, string> = {
            ".env.local": "# local overrides are not configured yet",
            ".env": "DB_HOST=localhost",
        };

        const envPath = resolveEnvPath(
            [".env.local", ".env"],
            () => true,
            (candidate) => contents[candidate] || "",
        );

        expect(envPath).toBe(".env");
    });
});
