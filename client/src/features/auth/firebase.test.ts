import { describe, expect, it } from "vitest";
import { sendFirebaseEmailVerification, sendFirebasePasswordReset } from "../../services/firebase";

describe("Firebase account helpers", () => {
    it("exports password reset and email verification helpers", () => {
        expect(sendFirebasePasswordReset).toEqual(expect.any(Function));
        expect(sendFirebaseEmailVerification).toEqual(expect.any(Function));
    });
});
