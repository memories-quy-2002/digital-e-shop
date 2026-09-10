import type { Auth, UserCredential } from "firebase/auth";

const firebaseConfig = {
    apiKey: "AIzaSyCae88IRpKYJbHLxZIiArzIPYTkglQqgb0",
    authDomain: "graduation-project-5bbfb.firebaseapp.com",
    projectId: "graduation-project-5bbfb",
    storageBucket: "graduation-project-5bbfb.appspot.com",
    messagingSenderId: "503526214575",
    appId: "1:503526214575:web:5c4e1263f106bc2bee7d5a",
    measurementId: "G-NGN3CY83D3",
};

let authPromise: Promise<Auth> | null = null;

const loadFirebaseAuth = async (): Promise<Auth> => {
    const [{ initializeApp }, { getAuth }] = await Promise.all([
        import("firebase/app"),
        import("firebase/auth"),
    ]);
    const app = initializeApp(firebaseConfig);
    return getAuth(app);
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
    await sendPasswordResetEmail(auth, email);
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

export const signOutFirebaseUser = async (): Promise<void> => {
    const auth = await getFirebaseAuth();
    const { signOut } = await import("firebase/auth");
    await signOut(auth);
};
