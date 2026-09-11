export type FirebaseClientMode = "emulator" | "production";

export type FirebaseClientEnvironment = {
    mode: FirebaseClientMode;
    projectId: string;
    config: {
        projectId: string;
        apiKey: string;
        authDomain: string;
        storageBucket: string;
        messagingSenderId: string;
        appId: string;
        measurementId?: string;
    };
    authEmulatorUrl?: string;
};

type FirebaseClientEnvironmentValues = Record<string, string | undefined>;

const LOCAL_FIREBASE_PROJECT_ID = "demo-digital-e-local";
const REQUIRED_FIREBASE_KEYS = [
    "VITE_FIREBASE_PROJECT_ID",
    "VITE_FIREBASE_API_KEY",
    "VITE_FIREBASE_AUTH_DOMAIN",
    "VITE_FIREBASE_STORAGE_BUCKET",
    "VITE_FIREBASE_MESSAGING_SENDER_ID",
    "VITE_FIREBASE_APP_ID",
] as const;

const isLocalHostname = (hostname: string) =>
    ["localhost", "127.0.0.1", "::1"].includes(hostname);

const validateAuthEmulatorUrl = (value: string) => {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new Error("VITE_FIREBASE_AUTH_EMULATOR_URL must be a local http URL");
    }

    if (url.protocol !== "http:" || !isLocalHostname(url.hostname)) {
        throw new Error("VITE_FIREBASE_AUTH_EMULATOR_URL must be a local http URL");
    }

    return value;
};

export const resolveFirebaseClientEnvironment = (
    values: FirebaseClientEnvironmentValues = import.meta.env as FirebaseClientEnvironmentValues,
    isDevelopment = import.meta.env.DEV,
): FirebaseClientEnvironment => {
    const missingKeys = REQUIRED_FIREBASE_KEYS.filter((key) => !values[key]?.trim());
    if (missingKeys.length > 0) {
        throw new Error("Missing Firebase client environment variables: " + missingKeys.join(", "));
    }

    const emulatorUrl = values.VITE_FIREBASE_AUTH_EMULATOR_URL?.trim();
    if (emulatorUrl && !isDevelopment) {
        throw new Error("VITE_FIREBASE_AUTH_EMULATOR_URL is only allowed in development");
    }
    if (isDevelopment && !emulatorUrl) {
        throw new Error("Development Firebase mode requires VITE_FIREBASE_AUTH_EMULATOR_URL");
    }

    const projectId = values.VITE_FIREBASE_PROJECT_ID!.trim();
    const config = {
        projectId,
        apiKey: values.VITE_FIREBASE_API_KEY!.trim(),
        authDomain: values.VITE_FIREBASE_AUTH_DOMAIN!.trim(),
        storageBucket: values.VITE_FIREBASE_STORAGE_BUCKET!.trim(),
        messagingSenderId: values.VITE_FIREBASE_MESSAGING_SENDER_ID!.trim(),
        appId: values.VITE_FIREBASE_APP_ID!.trim(),
        ...(values.VITE_FIREBASE_MEASUREMENT_ID?.trim()
            ? { measurementId: values.VITE_FIREBASE_MEASUREMENT_ID.trim() }
            : {}),
    };

    if (emulatorUrl) {
        validateAuthEmulatorUrl(emulatorUrl);
        if (projectId !== LOCAL_FIREBASE_PROJECT_ID) {
            throw new Error("Local Firebase Emulator mode must use demo-digital-e-local");
        }
    }

    return {
        mode: emulatorUrl ? "emulator" : "production",
        projectId,
        config,
        ...(emulatorUrl ? { authEmulatorUrl: emulatorUrl } : {}),
    };
};
