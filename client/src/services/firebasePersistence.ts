import type { Auth, Persistence } from "firebase/auth";
import { getFirebaseAuth } from "./firebase";

export type FirebasePersistenceMode = "session" | "local";

export const getFirebasePersistenceMode = (rememberMe: boolean): FirebasePersistenceMode =>
    rememberMe ? "local" : "session";

export const setFirebaseAuthPersistence = async (rememberMe: boolean): Promise<void> => {
    const auth = await getFirebaseAuth();
    const { browserLocalPersistence, browserSessionPersistence, setPersistence } = await import("firebase/auth");
    const persistence: Persistence = getFirebasePersistenceMode(rememberMe) === "local"
        ? browserLocalPersistence
        : browserSessionPersistence;
    await setPersistence(auth as Auth, persistence);
};
