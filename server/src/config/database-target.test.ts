import { describe, expect, it } from "vitest";
import {
    assertLocalDatabaseTarget,
    assertSafeDatabaseTarget,
} from "./database-target";

describe("database target guards", () => {
    it("allows a local development database", () => {
        expect(() => assertSafeDatabaseTarget({
            nodeEnv: "development",
            dbHost: "127.0.0.1",
            databaseUrl: "mysql://root:password@localhost:3307/digital_e_shop_local",
        })).not.toThrow();
    });

    it("rejects a remote development database host", () => {
        expect(() => assertSafeDatabaseTarget({
            nodeEnv: "development",
            dbHost: "mysql.example.test",
            databaseUrl: "mysql://root:password@mysql.example.test:3306/digital_e_shop_local",
        })).toThrow("Refusing to use a non-local database target");
    });

    it("rejects a remote URL even when DB_HOST is local", () => {
        expect(() => assertSafeDatabaseTarget({
            nodeEnv: "test",
            dbHost: "127.0.0.1",
            databaseUrl: "mysql://root:password@mysql.example.test:3306/digital_e_shop_ci",
        })).toThrow("Refusing to use a non-local database target");
    });

    it("allows a remote production database target", () => {
        expect(() => assertSafeDatabaseTarget({
            nodeEnv: "production",
            dbHost: "mysql.example.test",
            databaseUrl: "mysql://root:password@mysql.example.test:3306/digital_e_shop",
        })).not.toThrow();
    });

    it("requires the mock seed to use a configured local database", () => {
        expect(() => assertLocalDatabaseTarget({})).toThrow(
            "Local database target is not configured",
        );
    });

    it("rejects a remote target for the mock seed", () => {
        expect(() => assertLocalDatabaseTarget({
            dbHost: "mysql.example.test",
            databaseUrl: "mysql://root:password@mysql.example.test:3306/digital_e_shop",
        })).toThrow("Refusing to use a non-local database target");
    });
});
