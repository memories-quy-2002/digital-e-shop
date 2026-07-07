import { beforeEach, describe, expect, it } from "vitest";

import { readPendingCheckout } from "./checkoutSuccessStorage";

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
