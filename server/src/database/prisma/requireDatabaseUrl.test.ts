import { afterEach, describe, expect, it } from "vitest";

import { requireDatabaseUrl } from "./requireDatabaseUrl";

const originalDatabaseUrl = process.env.DATABASE_URL;

describe("requireDatabaseUrl", () => {
    afterEach(() => {
        if (originalDatabaseUrl === undefined) {
            delete process.env.DATABASE_URL;
        } else {
            process.env.DATABASE_URL = originalDatabaseUrl;
        }
    });

    it("throws a clear error when DATABASE_URL is missing", () => {
        delete process.env.DATABASE_URL;

        expect(() => requireDatabaseUrl()).toThrow("DATABASE_URL is required");
    });

    it("returns the configured database url when present", () => {
        process.env.DATABASE_URL = "******localhost:3306/app";

        expect(requireDatabaseUrl()).toBe("******localhost:3306/app");
    });
});
