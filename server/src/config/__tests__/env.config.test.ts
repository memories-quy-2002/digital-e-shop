import { describe, expect, it } from "vitest";
import path from "node:path";
import {
    getFirebaseEnvironmentErrors,
    getMissingProductionEnvironmentKeys,
    normalizeFirebaseAuthEmulatorHost,
    resolveServerRoot,
} from "../env.config";

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

describe("Firebase environment validation", () => {
    it("normalizes a local Auth Emulator host without a protocol", () => {
        expect(normalizeFirebaseAuthEmulatorHost(" 127.0.0.1:9099 ")).toBe("127.0.0.1:9099");
    });

    it("rejects a URL-form Auth Emulator host", () => {
        expect(() => normalizeFirebaseAuthEmulatorHost("http://127.0.0.1:9099")).toThrow(
            "FIREBASE_AUTH_EMULATOR_HOST must be a host:port value without a protocol",
        );
    });

    it("allows Firebase Admin emulator mode without service-account credentials", () => {
        expect(getFirebaseEnvironmentErrors({
            nodeEnv: "development",
            projectId: "demo-digital-e-local",
            emulatorHost: "127.0.0.1:9099",
        })).toEqual([]);
    });

    it("rejects the emulator in production", () => {
        expect(getFirebaseEnvironmentErrors({
            nodeEnv: "production",
            projectId: "graduation-project-5bbfb",
            emulatorHost: "127.0.0.1:9099",
        })).toContain("FIREBASE_AUTH_EMULATOR_HOST is not allowed when NODE_ENV=production");
    });

    it("rejects the production project in local emulator mode", () => {
        expect(getFirebaseEnvironmentErrors({
            nodeEnv: "development",
            projectId: "graduation-project-5bbfb",
            emulatorHost: "127.0.0.1:9099",
        })).toContain("Local Firebase Emulator mode must use FIREBASE_PROJECT_ID=demo-digital-e-local");
    });

    it("requires service-account credentials without the emulator", () => {
        expect(getFirebaseEnvironmentErrors({
            nodeEnv: "production",
            projectId: "graduation-project-5bbfb",
        })).toEqual([
            "FIREBASE_CLIENT_EMAIL is required when Firebase Admin is not using the Auth Emulator",
            "FIREBASE_PRIVATE_KEY is required when Firebase Admin is not using the Auth Emulator",
        ]);
    });

    it("accepts complete production Firebase Admin credentials", () => {
        expect(getFirebaseEnvironmentErrors({
            nodeEnv: "production",
            projectId: "graduation-project-5bbfb",
            clientEmail: "firebase-adminsdk@example.test",
            privateKey: "private-key",
        })).toEqual([]);
    });
});
