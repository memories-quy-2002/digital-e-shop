import { describe, expect, it } from "vitest";
import { getFirebaseAuthErrorMessage } from "./authErrors";

describe("getFirebaseAuthErrorMessage", () => {
    it("uses a non-enumerating message for invalid login credentials", () => {
        expect(getFirebaseAuthErrorMessage(
            { code: "auth/user-not-found" },
            "Unable to sign in.",
        )).toBe("The email or password is incorrect. Check your credentials and try again.");
    });

    it("explains when signup cannot use an existing email", () => {
        expect(getFirebaseAuthErrorMessage(
            { code: "auth/email-already-in-use" },
            "Unable to create your account.",
        )).toBe("An account already uses this email address. Sign in or reset your password instead.");
    });

    it("explains temporary Firebase availability failures", () => {
        expect(getFirebaseAuthErrorMessage(
            { code: "auth/network-request-failed" },
            "Unable to complete the request.",
        )).toBe("We couldn't reach Firebase. Check your connection and try again.");
    });

    it("falls back to the caller's meaningful action message", () => {
        expect(getFirebaseAuthErrorMessage(
            { code: "auth/unknown-error" },
            "Unable to change your email right now.",
        )).toBe("Unable to change your email right now.");
    });
});
