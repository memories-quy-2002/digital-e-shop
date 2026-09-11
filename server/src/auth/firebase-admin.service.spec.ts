import { beforeEach, describe, expect, it, vi } from "vitest";
import { FirebaseAdminAuthService } from "./firebase-admin.service";

const mocks = vi.hoisted(() => ({
    env: {
        nodeEnv: "development",
        firebaseProjectId: "demo-digital-e-local",
        firebaseClientEmail: "",
        firebasePrivateKey: "",
        firebaseAuthEmulatorHost: "127.0.0.1:9099",
    },
    apps: [] as Array<{ options: unknown }>,
    auth: {
        verifyIdToken: vi.fn(),
    },
    cert: vi.fn((credentials: unknown) => ({ type: "certificate", credentials })),
    getApps: vi.fn(),
    initializeApp: vi.fn((options: unknown) => {
        const app = { options };
        mocks.apps.push(app);
        return app;
    }),
    getAuth: vi.fn(),
}));

vi.mock("#src/config/env.config", () => ({
    env: mocks.env,
}));

vi.mock("firebase-admin/app", () => ({
    cert: mocks.cert,
    getApps: mocks.getApps,
    initializeApp: mocks.initializeApp,
}));

vi.mock("firebase-admin/auth", () => ({
    getAuth: mocks.getAuth,
}));

describe("FirebaseAdminAuthService initialization", () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        mocks.apps.length = 0;
        mocks.getApps.mockImplementation(() => mocks.apps);
        mocks.getAuth.mockReturnValue(mocks.auth);
        mocks.auth.verifyIdToken.mockResolvedValue({
            uid: "firebase-user",
            email: "user@example.test",
            email_verified: true,
        });
        mocks.env.nodeEnv = "development";
        mocks.env.firebaseProjectId = "demo-digital-e-local";
        mocks.env.firebaseClientEmail = "";
        mocks.env.firebasePrivateKey = "";
        mocks.env.firebaseAuthEmulatorHost = "127.0.0.1:9099";
        delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
    });

    it("initializes Firebase Admin against the Auth Emulator without a certificate", async () => {
        const service = new FirebaseAdminAuthService();

        await service.verifyIdToken("emulator-token");

        expect(process.env.FIREBASE_AUTH_EMULATOR_HOST).toBe("127.0.0.1:9099");
        expect(mocks.initializeApp).toHaveBeenCalledWith({
            projectId: "demo-digital-e-local",
        });
        expect(mocks.cert).not.toHaveBeenCalled();
    });

    it("initializes production Firebase Admin with the service-account certificate", async () => {
        mocks.env.nodeEnv = "production";
        mocks.env.firebaseProjectId = "graduation-project-5bbfb";
        mocks.env.firebaseClientEmail = "firebase-adminsdk@example.test";
        mocks.env.firebasePrivateKey = "private-key";
        mocks.env.firebaseAuthEmulatorHost = "";

        const service = new FirebaseAdminAuthService();

        await service.verifyIdToken("production-token");
        await service.verifyIdToken("production-token");

        expect(mocks.cert).toHaveBeenCalledWith({
            projectId: "graduation-project-5bbfb",
            clientEmail: "firebase-adminsdk@example.test",
            privateKey: "private-key",
        });
        expect(mocks.initializeApp).toHaveBeenCalledTimes(1);
        expect(process.env.FIREBASE_AUTH_EMULATOR_HOST).toBeUndefined();
    });
});
