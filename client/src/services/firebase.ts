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

export const signOutFirebaseUser = async (): Promise<void> => {
    const auth = await getFirebaseAuth();
    const { signOut } = await import("firebase/auth");
    await signOut(auth);
};
