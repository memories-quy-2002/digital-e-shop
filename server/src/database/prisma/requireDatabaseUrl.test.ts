import { afterEach, describe, expect, it } from "vitest";

import { requireDatabaseUrl } from "./requireDatabaseUrl";

const originalDatabaseUrl = process.env.DATABASE_URL;
const originalDbHost = process.env.DB_HOST;
const originalNodeEnv = process.env.NODE_ENV;

describe("requireDatabaseUrl", () => {
    afterEach(() => {
        if (originalDatabaseUrl === undefined) {
            delete process.env.DATABASE_URL;
        } else {
            process.env.DATABASE_URL = originalDatabaseUrl;
        }

        if (originalDbHost === undefined) {
            delete process.env.DB_HOST;
        } else {
            process.env.DB_HOST = originalDbHost;
        }

        if (originalNodeEnv === undefined) {
            delete process.env.NODE_ENV;
        } else {
            process.env.NODE_ENV = originalNodeEnv;
        }
    });

    it("throws a clear error when DATABASE_URL is missing", () => {
        delete process.env.DATABASE_URL;

        expect(() => requireDatabaseUrl()).toThrow("DATABASE_URL is required");
    });

    it("returns the configured database url when present", () => {
        process.env.NODE_ENV = "test";
        process.env.DB_HOST = "127.0.0.1";
        process.env.DATABASE_URL = "mysql://root:password@localhost:3307/digital_e_shop_local";

        expect(requireDatabaseUrl()).toBe("mysql://root:password@localhost:3307/digital_e_shop_local");
    });

    it("rejects a remote database url outside production", () => {
        process.env.NODE_ENV = "test";
        process.env.DB_HOST = "mysql.example.test";
        process.env.DATABASE_URL = "mysql://root:password@mysql.example.test:3306/digital_e_shop";

        expect(() => requireDatabaseUrl()).toThrow(
            "Refusing to use a non-local database target",
        );
    });
});
