import { describe, expect, it } from "vitest";

const {
    assertLocalFirebaseEmulatorEnvironment,
    LOCAL_FIREBASE_AUTH_EMULATOR_HOST,
    LOCAL_FIREBASE_PROJECT_ID,
} = require("./seedFirebaseEmulatorUsers");

describe("Firebase Auth Emulator seeder guard", () => {
    it("accepts the documented local emulator environment", () => {
        expect(() => assertLocalFirebaseEmulatorEnvironment({
            NODE_ENV: "development",
            FIREBASE_AUTH_EMULATOR_HOST: LOCAL_FIREBASE_AUTH_EMULATOR_HOST,
            FIREBASE_PROJECT_ID: LOCAL_FIREBASE_PROJECT_ID,
        })).not.toThrow();
    });

    it("rejects production execution", () => {
        expect(() => assertLocalFirebaseEmulatorEnvironment({
            NODE_ENV: "production",
            FIREBASE_AUTH_EMULATOR_HOST: LOCAL_FIREBASE_AUTH_EMULATOR_HOST,
            FIREBASE_PROJECT_ID: LOCAL_FIREBASE_PROJECT_ID,
        })).toThrow("not allowed when NODE_ENV=production");
    });

    it("rejects a missing or remote emulator host", () => {
        expect(() => assertLocalFirebaseEmulatorEnvironment({
            NODE_ENV: "development",
            FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9098",
            FIREBASE_PROJECT_ID: LOCAL_FIREBASE_PROJECT_ID,
        })).toThrow("FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099");
    });

    it("rejects a non-local Firebase project", () => {
        expect(() => assertLocalFirebaseEmulatorEnvironment({
            NODE_ENV: "development",
            FIREBASE_AUTH_EMULATOR_HOST: LOCAL_FIREBASE_AUTH_EMULATOR_HOST,
            FIREBASE_PROJECT_ID: "graduation-project-5bbfb",
        })).toThrow("FIREBASE_PROJECT_ID=demo-digital-e-local");
    });
});
