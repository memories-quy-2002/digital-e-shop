import { describe, expect, it } from "vitest";

import { validateCheckoutEmail } from "./checkoutValidation";

describe("checkout email validation", () => {
    it("accepts trimmed plus-addressed emails with long TLDs", () => {
        expect(validateCheckoutEmail("  user+shop@example.travel  ")).toBeNull();
    });

    it("rejects malformed email values", () => {
        expect(validateCheckoutEmail("invalid-email")).toBe("Invalid email format");
    });
});
