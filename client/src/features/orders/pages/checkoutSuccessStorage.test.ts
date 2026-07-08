import { beforeEach, describe, expect, it } from "vitest";

import { maskPhoneNumber, readPendingCheckout } from "./checkoutSuccessStorage";

describe("readPendingCheckout", () => {
    beforeEach(() => {
        sessionStorage.clear();
    });

    it("returns the parsed pending checkout when the stored JSON is valid", () => {
        sessionStorage.setItem("checkoutPending", JSON.stringify({ totalPrice: 99, itemsCount: 2 }));

        expect(readPendingCheckout()).toMatchObject({ totalPrice: 99, itemsCount: 2 });
    });

    it("returns null and clears corrupted pending checkout state", () => {
        sessionStorage.setItem("checkoutPending", "{not-json");

        expect(readPendingCheckout()).toBeNull();
        expect(sessionStorage.getItem("checkoutPending")).toBeNull();
    });
});

describe("maskPhoneNumber", () => {
    it("keeps only the last 4 digits visible", () => {
        expect(maskPhoneNumber("+1 (555) 123-4567")).toBe("*******4567");
    });

    it("masks all digits when the number is 4 digits or shorter", () => {
        expect(maskPhoneNumber("123")).toBe("***");
        expect(maskPhoneNumber("1234")).toBe("****");
    });
});
