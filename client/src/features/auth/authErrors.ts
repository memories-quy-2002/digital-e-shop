type FirebaseAuthError = {
    code?: unknown;
};

const hasFirebaseAuthCode = (error: unknown): error is FirebaseAuthError =>
    Boolean(error && typeof error === "object" && "code" in error);

export const getFirebaseAuthErrorMessage = (error: unknown, fallback: string): string => {
    const code = hasFirebaseAuthCode(error) && typeof error.code === "string" ? error.code : "";

    switch (code) {
        case "auth/invalid-credential":
        case "auth/invalid-login-credentials":
        case "auth/user-not-found":
        case "auth/wrong-password":
            return "The email or password is incorrect. Check your credentials and try again.";
        case "auth/email-already-in-use":
            return "An account already uses this email address. Sign in or reset your password instead.";
        case "auth/invalid-email":
            return "Enter a valid email address.";
        case "auth/weak-password":
            return "Choose a stronger password with at least 8 characters.";
        case "auth/user-disabled":
            return "This account has been disabled. Contact support for help.";
        case "auth/too-many-requests":
            return "Too many attempts were made. Wait a moment and try again.";
        case "auth/network-request-failed":
            return "We couldn't reach Firebase. Check your connection and try again.";
        case "auth/operation-not-allowed":
            return "This sign-in method is not available right now. Contact support for help.";
        case "auth/requires-recent-login":
            return "For your security, sign in again before changing this account detail.";
        case "auth/expired-action-code":
        case "auth/invalid-action-code":
            return "This Firebase action link is invalid or expired. Request a new link and try again.";
        case "auth/emulator-config-failed":
        case "auth/invalid-api-key":
        case "auth/internal-error":
            return "Firebase authentication is temporarily unavailable. Try again later.";
        default:
            return fallback;
    }
};

export const getFirebaseAuthErrorCode = (error: unknown): string | null => {
    if (!hasFirebaseAuthCode(error) || typeof error.code !== "string") return null;
    return error.code;
};
