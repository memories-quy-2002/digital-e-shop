import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    sendFirebaseEmailChangeVerification,
    sendFirebaseEmailVerification,
    sendFirebasePasswordReset,
} from "../../services/firebase";
import type { FirebaseClientEnvironment } from "../../services/firebaseConfig";

const mocks = vi.hoisted(() => ({
    auth: {
        currentUser: { uid: "firebase-user" },
    },
    initializeApp: vi.fn(() => ({ name: "test-app" })),
    getAuth: vi.fn(),
    connectAuthEmulator: vi.fn(),
    sendPasswordResetEmail: vi.fn(),
    sendEmailVerification: vi.fn(),
    verifyBeforeUpdateEmail: vi.fn(),
    resolveFirebaseClientEnvironment: vi.fn<() => FirebaseClientEnvironment>(() => ({
        mode: "production" as const,
        projectId: "graduation-project-5bbfb",
        config: {
            projectId: "graduation-project-5bbfb",
            apiKey: "production-api-key",
            authDomain: "graduation-project-5bbfb.firebaseapp.com",
            storageBucket: "graduation-project-5bbfb.appspot.com",
            messagingSenderId: "503526214575",
            appId: "1:503526214575:web:5c4e1263f106bc2bee7d5a",
        },
    })),
}));

const emulatorEnvironment: FirebaseClientEnvironment = {
    mode: "emulator" as const,
    projectId: "demo-digital-e-local",
    config: {
        projectId: "demo-digital-e-local",
        apiKey: "demo-api-key",
        authDomain: "demo-digital-e-local.firebaseapp.com",
        storageBucket: "demo-digital-e-local.appspot.com",
        messagingSenderId: "000000000000",
        appId: "1:000000000000:web:demo-digital-e-local",
    },
    authEmulatorUrl: "http://127.0.0.1:9099",
};

vi.mock("firebase/app", () => ({
    initializeApp: mocks.initializeApp,
}));

vi.mock("firebase/auth", () => ({
    getAuth: mocks.getAuth,
    connectAuthEmulator: mocks.connectAuthEmulator,
    sendPasswordResetEmail: mocks.sendPasswordResetEmail,
    sendEmailVerification: mocks.sendEmailVerification,
    verifyBeforeUpdateEmail: mocks.verifyBeforeUpdateEmail,
}));

vi.mock("../../services/firebaseConfig", () => ({
    resolveFirebaseClientEnvironment: mocks.resolveFirebaseClientEnvironment,
}));

describe("Firebase account helpers", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getAuth.mockReturnValue(mocks.auth);
        mocks.sendPasswordResetEmail.mockResolvedValue(undefined);
        mocks.sendEmailVerification.mockResolvedValue(undefined);
        mocks.verifyBeforeUpdateEmail.mockResolvedValue(undefined);
    });

    it("exports password reset and email verification helpers", () => {
        expect(sendFirebasePasswordReset).toEqual(expect.any(Function));
        expect(sendFirebaseEmailVerification).toEqual(expect.any(Function));
        expect(sendFirebaseEmailChangeVerification).toEqual(expect.any(Function));
    });

    it("sends password reset links back to the app action-code page", async () => {
        await sendFirebasePasswordReset("buyer@example.com");

        expect(mocks.sendPasswordResetEmail).toHaveBeenCalledWith(
            mocks.auth,
            "buyer@example.com",
            {
                url: window.location.origin + "/reset-password",
                handleCodeInApp: true,
            },
        );
    });

    it("does not add an app continuation URL to emulator password reset actions", async () => {
        mocks.resolveFirebaseClientEnvironment.mockReturnValue(emulatorEnvironment);
        vi.resetModules();
        const { sendFirebasePasswordReset: sendEmulatorPasswordReset } = await import("../../services/firebase");

        await sendEmulatorPasswordReset("buyer@example.com");

        expect(mocks.sendPasswordResetEmail).toHaveBeenCalledWith(
            mocks.auth,
            "buyer@example.com",
            undefined,
        );
    });

    it("uses Firebase verify-before-update for email changes", async () => {
        await sendFirebaseEmailChangeVerification(" new@example.com ");

        expect(mocks.verifyBeforeUpdateEmail).toHaveBeenCalledWith(
            mocks.auth.currentUser,
            "new@example.com",
        );
    });
});
