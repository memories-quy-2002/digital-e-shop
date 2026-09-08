import { describe, expect, it } from "vitest";
import path from "node:path";
import { getMissingProductionEnvironmentKeys, resolveAuthProvider, resolveServerRoot } from "../env.config";

describe("resolveServerRoot", () => {
    it("resolves the server root from source and compiled module paths", () => {
        const serverRoot = process.cwd();

        expect(resolveServerRoot(path.join(serverRoot, "src", "config"))).toBe(serverRoot);
        expect(resolveServerRoot(path.join(serverRoot, "dist", "src", "config"))).toBe(serverRoot);
    });
});

describe("production environment validation", () => {
    it("returns no missing keys for a complete production environment", () => {
        expect(getMissingProductionEnvironmentKeys({
            DATABASE_URL: "mysql://user:password@db.example.test:3306/digital_e_shop",
            DB_HOST: "db.example.test",
            DB_USER: "user",
            DB_NAME: "digital_e_shop",
            JWT_SECRET_KEY: "access-secret",
            JWT_REFRESH_SECRET_KEY: "refresh-secret",
            CSRF_SECRET: "csrf-secret",
            CLIENT_URL: "https://digital-e.vercel.app",
            SERVER_URL: "https://e-commerce-express-server-app.vercel.app",
        })).toEqual([]);
    });

    it("reports missing production database, auth, and origin keys", () => {
        expect(getMissingProductionEnvironmentKeys({
            DATABASE_URL: "",
            JWT_SECRET_KEY: "",
            CLIENT_URL: "",
        })).toEqual([
            "DATABASE_URL",
            "DB_HOST",
            "DB_USER",
            "DB_NAME",
            "JWT_SECRET_KEY",
            "JWT_REFRESH_SECRET_KEY",
            "CSRF_SECRET",
            "CLIENT_URL",
            "SERVER_URL",
        ]);
    });
});

describe("authentication provider selection", () => {
    it("defaults local environments to MySQL password auth", () => {
        expect(resolveAuthProvider("development")).toBe("local");
        expect(resolveAuthProvider("test")).toBe("local");
    });

    it("allows Firebase to be selected for a non-production environment", () => {
        expect(resolveAuthProvider("development", "firebase")).toBe("firebase");
    });

    it("always selects Firebase in production", () => {
        expect(resolveAuthProvider("production", "local")).toBe("firebase");
    });
});
