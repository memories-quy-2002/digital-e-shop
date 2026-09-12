import { describe, expect, it } from "vitest";
import { resolveFirebaseClientEnvironment } from "./firebaseConfig";

const values = {
    VITE_FIREBASE_PROJECT_ID: "demo-digital-e-local",
    VITE_FIREBASE_API_KEY: "demo-api-key",
    VITE_FIREBASE_AUTH_DOMAIN: "demo-digital-e-local.firebaseapp.com",
    VITE_FIREBASE_STORAGE_BUCKET: "demo-digital-e-local.appspot.com",
    VITE_FIREBASE_MESSAGING_SENDER_ID: "000000000000",
    VITE_FIREBASE_APP_ID: "1:000000000000:web:demo-digital-e-local",
    VITE_FIREBASE_AUTH_EMULATOR_URL: "http://127.0.0.1:9099",
};

describe("resolveFirebaseClientEnvironment", () => {
    it("resolves the local Auth Emulator profile", () => {
        expect(resolveFirebaseClientEnvironment(values, true)).toMatchObject({
            mode: "emulator",
            projectId: "demo-digital-e-local",
            authEmulatorUrl: "http://127.0.0.1:9099",
        });
    });

    it("requires Firebase web variables when Firebase is active", () => {
        expect(() => resolveFirebaseClientEnvironment({
        }, true)).toThrow("Missing Firebase client environment variables");
    });

    it("rejects an emulator URL in production", () => {
        expect(() => resolveFirebaseClientEnvironment(values, false)).toThrow(
            "VITE_FIREBASE_AUTH_EMULATOR_URL is only allowed in development",
        );
    });

    it("rejects the production project in local emulator mode", () => {
        expect(() => resolveFirebaseClientEnvironment({
            ...values,
            VITE_FIREBASE_PROJECT_ID: "graduation-project-5bbfb",
        }, true)).toThrow("Local Firebase Emulator mode must use demo-digital-e-local");
    });

    it("rejects Firebase mode without the emulator", () => {
        const withoutEmulator = {
            ...values,
            VITE_FIREBASE_AUTH_EMULATOR_URL: undefined,
        };

        expect(() => resolveFirebaseClientEnvironment(withoutEmulator, true)).toThrow(
            "Development Firebase mode requires VITE_FIREBASE_AUTH_EMULATOR_URL",
        );
    });

    it("resolves production Firebase configuration without emulator settings", () => {
        const production = {
            ...values,
            VITE_FIREBASE_AUTH_EMULATOR_URL: undefined,
        };

        expect(resolveFirebaseClientEnvironment({
            ...production,
            VITE_FIREBASE_PROJECT_ID: "graduation-project-5bbfb",
        }, false)).toMatchObject({
            mode: "production",
            projectId: "graduation-project-5bbfb",
        });
    });
});
