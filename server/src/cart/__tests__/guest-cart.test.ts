import { describe, expect, it } from "vitest";
import { createGuestCartId, isGuestCartId } from "../guest-cart";

describe("guest cart identity", () => {
    it("accepts UUID guest cart identifiers and rejects arbitrary cookie values", () => {
        expect(isGuestCartId("2f1c3c6d-1a0b-4f4a-9e1e-2e8a2dbf4b68")).toBe(true);
        expect(isGuestCartId("guest-cart-1")).toBe(false);
        expect(isGuestCartId("1 OR 1=1")).toBe(false);
    });

    it("creates a UUID guest cart identifier", () => {
        const guestCartId = createGuestCartId();
        expect(isGuestCartId(guestCartId)).toBe(true);
    });
});
