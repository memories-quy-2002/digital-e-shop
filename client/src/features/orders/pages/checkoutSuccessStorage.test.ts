import { beforeEach, describe, expect, it } from "vitest";

import { getOrCreatePayOSSubmission, maskPhoneNumber, readPendingCheckout, writePendingCheckout } from "./checkoutSuccessStorage";

describe("readPendingCheckout", () => {
    beforeEach(() => {
        sessionStorage.clear();
    });

    it("returns the parsed pending checkout when the stored JSON is valid", () => {
        sessionStorage.setItem("checkoutPending", JSON.stringify({
            version: 2,
            idempotencyKey: "123e4567-e89b-42d3-a456-426614174001",
            requestFingerprint: "safe-draft-hash",
            cartSnapshot: [{ productId: 7, quantity: 2 }],
        }));

        expect(readPendingCheckout()).toMatchObject({ version: 2, cartSnapshot: [{ productId: 7, quantity: 2 }] });
    });

    it("returns null and clears corrupted pending checkout state", () => {
        sessionStorage.setItem("checkoutPending", "{not-json");

        expect(readPendingCheckout()).toBeNull();
        expect(sessionStorage.getItem("checkoutPending")).toBeNull();
    });

    it("stores a versioned attempt snapshot without personal fields", () => {
        writePendingCheckout({
            version: 2,
            attemptId: "123e4567-e89b-42d3-a456-426614174000",
            providerOrderCode: "123456",
            idempotencyKey: "123e4567-e89b-42d3-a456-426614174001",
            requestFingerprint: "safe-draft-hash",
            cartSnapshot: [{ productId: 7, quantity: 2 }],
            email: "private@example.com",
            phone: "0901234567",
        } as never);

        const raw = sessionStorage.getItem("checkoutPending") || "";
        expect(JSON.parse(raw)).toMatchObject({
            version: 2,
            attemptId: "123e4567-e89b-42d3-a456-426614174000",
            providerOrderCode: "123456",
            cartSnapshot: [{ productId: 7, quantity: 2 }],
        });
        expect(raw).not.toContain("private@example.com");
        expect(raw).not.toContain("0901234567");
        expect(raw).not.toContain("private@example.com");
        expect(raw).not.toContain("0901234567");
    });

    it("reuses one idempotency key for the same checkout draft and replaces it for a changed draft", () => {
        const first = getOrCreatePayOSSubmission("draft-a", [{ productId: 7, quantity: 2 }]);
        const replay = getOrCreatePayOSSubmission("draft-a", [{ productId: 7, quantity: 2 }]);
        const changed = getOrCreatePayOSSubmission("draft-b", [{ productId: 7, quantity: 1 }]);

        expect(replay.idempotencyKey).toBe(first.idempotencyKey);
        expect(changed.idempotencyKey).not.toBe(first.idempotencyKey);
    });

    it("rejects legacy success-shaped pending data as attempt authority", () => {
        sessionStorage.setItem("checkoutPending", JSON.stringify({ totalPrice: 99, itemsCount: 2 }));

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
