import type { Auth, UserCredential } from "firebase/auth";
import { resolveFirebaseClientEnvironment } from "./firebaseConfig";

let authPromise: Promise<Auth> | null = null;

const loadFirebaseAuth = async (): Promise<Auth> => {
    const [{ initializeApp }, { getAuth, connectAuthEmulator }] = await Promise.all([
        import("firebase/app"),
        import("firebase/auth"),
    ]);
    const environment = resolveFirebaseClientEnvironment();
    const app = initializeApp(environment.config);
    const auth = getAuth(app);
    if (environment.mode === "emulator" && environment.authEmulatorUrl) {
        connectAuthEmulator(auth, environment.authEmulatorUrl);
    }
    return auth;
};

export const getFirebaseAuth = async (): Promise<Auth> => {
    if (!authPromise) {
        authPromise = loadFirebaseAuth();
    }
    return authPromise;
};

export const signInWithFirebaseEmail = async (email: string, password: string): Promise<UserCredential> => {
    const auth = await getFirebaseAuth();
    const { signInWithEmailAndPassword } = await import("firebase/auth");
    return signInWithEmailAndPassword(auth, email, password);
};

export const createFirebaseUser = async (email: string, password: string): Promise<UserCredential> => {
    const auth = await getFirebaseAuth();
    const { createUserWithEmailAndPassword } = await import("firebase/auth");
    return createUserWithEmailAndPassword(auth, email, password);
};

export const sendFirebasePasswordReset = async (email: string): Promise<void> => {
    const auth = await getFirebaseAuth();
    const { sendPasswordResetEmail } = await import("firebase/auth");
    const actionCodeSettings = typeof window === "undefined" || resolveFirebaseClientEnvironment().mode === "emulator"
        ? undefined
        : {
            url: window.location.origin + "/reset-password",
            handleCodeInApp: true,
        };
    await sendPasswordResetEmail(auth, email, actionCodeSettings);
};

export const verifyFirebasePasswordResetCode = async (code: string): Promise<string> => {
    const auth = await getFirebaseAuth();
    const { verifyPasswordResetCode } = await import("firebase/auth");
    return verifyPasswordResetCode(auth, code);
};

export const confirmFirebasePasswordReset = async (code: string, newPassword: string): Promise<void> => {
    const auth = await getFirebaseAuth();
    const { confirmPasswordReset } = await import("firebase/auth");
    await confirmPasswordReset(auth, code, newPassword);
};

export const sendFirebaseEmailVerification = async (): Promise<void> => {
    const auth = await getFirebaseAuth();
    const { sendEmailVerification } = await import("firebase/auth");
    if (!auth.currentUser) {
        throw new Error("No signed-in Firebase user");
    }
    await sendEmailVerification(auth.currentUser);
};

export const sendFirebaseEmailChangeVerification = async (newEmail: string): Promise<void> => {
    const auth = await getFirebaseAuth();
    const { verifyBeforeUpdateEmail } = await import("firebase/auth");
    if (!auth.currentUser) {
        throw new Error("No signed-in Firebase user");
    }
    await verifyBeforeUpdateEmail(auth.currentUser, newEmail.trim());
};

export const signOutFirebaseUser = async (): Promise<void> => {
    const auth = await getFirebaseAuth();
    const { signOut } = await import("firebase/auth");
    await signOut(auth);
};
