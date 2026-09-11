import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    auth: { name: "auth" },
    initializeApp: vi.fn(() => ({ name: "app" })),
    getAuth: vi.fn(),
    connectAuthEmulator: vi.fn(),
    resolveFirebaseClientEnvironment: vi.fn(),
}));

vi.mock("firebase/app", () => ({
    initializeApp: mocks.initializeApp,
}));

vi.mock("firebase/auth", () => ({
    getAuth: mocks.getAuth,
    connectAuthEmulator: mocks.connectAuthEmulator,
}));

vi.mock("./firebaseConfig", () => ({
    resolveFirebaseClientEnvironment: mocks.resolveFirebaseClientEnvironment,
}));

const emulatorEnvironment = {
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

const productionEnvironment = {
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
};

describe("Firebase Auth initialization", () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        mocks.getAuth.mockReturnValue(mocks.auth);
    });

    it("connects to the Auth Emulator exactly once", async () => {
        mocks.resolveFirebaseClientEnvironment.mockReturnValue(emulatorEnvironment);
        const { getFirebaseAuth } = await import("./firebase");

        await getFirebaseAuth();
        await getFirebaseAuth();

        expect(mocks.initializeApp).toHaveBeenCalledWith(emulatorEnvironment.config);
        expect(mocks.connectAuthEmulator).toHaveBeenCalledTimes(1);
        expect(mocks.connectAuthEmulator).toHaveBeenCalledWith(
            mocks.auth,
            emulatorEnvironment.authEmulatorUrl,
        );
    });

    it("does not connect production Firebase Auth to the emulator", async () => {
        mocks.resolveFirebaseClientEnvironment.mockReturnValue(productionEnvironment);
        const { getFirebaseAuth } = await import("./firebase");

        await getFirebaseAuth();

        expect(mocks.initializeApp).toHaveBeenCalledWith(productionEnvironment.config);
        expect(mocks.connectAuthEmulator).not.toHaveBeenCalled();
    });
});
