import { describe, expect, it } from "vitest";
import {
    assertExplicitDemoSeedTarget,
    assertLocalDatabaseTarget,
    assertSafeDatabaseTarget,
    DEMO_SEED_CONFIRMATION,
    DESTRUCTIVE_DEMO_SEED_MODE,
    isPrismaGenerateCommand,
} from "./database-target";

describe("database target guards", () => {
    it("identifies the Prisma generate command", () => {
        expect(isPrismaGenerateCommand(["node", "prisma", "generate"])).toBe(true);
        expect(isPrismaGenerateCommand(["node", "prisma", "migrate", "deploy"])).toBe(false);
    });

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

    it("allows a remote development target only with explicit opt-in", () => {
        expect(() => assertSafeDatabaseTarget({
            nodeEnv: "development",
            dbHost: "mysql.example.test",
            databaseUrl: "mysql://root:password@mysql.example.test:3306/digital_e_shop",
            allowRemoteDatabase: true,
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

    it("rejects a remote demo reset without every explicit destructive opt-in", () => {
        expect(() => assertExplicitDemoSeedTarget({
            dbHost: "mysql.example.test",
            databaseUrl: "mysql://root:password@mysql.example.test:3306/digital_e_shop",
            mode: DESTRUCTIVE_DEMO_SEED_MODE,
            confirmation: DEMO_SEED_CONFIRMATION,
        })).toThrow("Refusing destructive demo seed");

        expect(() => assertExplicitDemoSeedTarget({
            dbHost: "mysql.example.test",
            databaseUrl: "mysql://root:password@mysql.example.test:3306/digital_e_shop",
            mode: "full-reset",
            confirmation: "wrong-confirmation",
            allowRemoteDatabase: true,
        })).toThrow("Refusing destructive demo seed");
    });

    it("allows a remote demo reset only with the exact workflow opt-ins", () => {
        expect(() => assertExplicitDemoSeedTarget({
            dbHost: "mysql.example.test",
            databaseUrl: "mysql://root:password@mysql.example.test:3306/digital_e_shop",
            mode: DESTRUCTIVE_DEMO_SEED_MODE,
            confirmation: DEMO_SEED_CONFIRMATION,
            allowRemoteDatabase: true,
        })).not.toThrow();
    });

    it("requires a configured target for the explicit demo reset", () => {
        expect(() => assertExplicitDemoSeedTarget({
            mode: DESTRUCTIVE_DEMO_SEED_MODE,
            confirmation: DEMO_SEED_CONFIRMATION,
            allowRemoteDatabase: true,
        })).toThrow("configured database target");
    });
});
