import { beforeEach, describe, expect, it } from "vitest";

import { fingerprintPayOSRequest, getOrCreatePayOSSubmission, maskPhoneNumber, readPendingCheckout, writePendingCheckout } from "./checkoutSuccessStorage";

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

    it("keeps the guest capability beside its PayOS attempt in session storage", () => {
        const guestOrderToken = "a".repeat(43);
        const submission = getOrCreatePayOSSubmission("guest-draft", [{ productId: 7, quantity: 1 }]);
        writePendingCheckout({ ...submission, attemptId: "123e4567-e89b-42d3-a456-426614174000", guestOrderToken });

        expect(readPendingCheckout()).toMatchObject({ attemptId: "123e4567-e89b-42d3-a456-426614174000", guestOrderToken });
    });

    it("reuses one idempotency key for the same checkout draft and replaces it for a changed draft", () => {
        const first = getOrCreatePayOSSubmission("draft-a", [{ productId: 7, quantity: 2 }]);
        const replay = getOrCreatePayOSSubmission("draft-a", [{ productId: 7, quantity: 2 }]);
        const changed = getOrCreatePayOSSubmission("draft-b", [{ productId: 7, quantity: 1 }]);

        expect(replay.idempotencyKey).toBe(first.idempotencyKey);
        expect(changed.idempotencyKey).not.toBe(first.idempotencyKey);
    });

    it("uses the complete checkout payload for idempotency without storing contact details", async () => {
        const request = {
            cart: [{ productId: 7, quantity: 2 }],
            contact: { email: "buyer@example.test", name: "Buyer One", phone: "0901234567" },
            shipping: { address: "1 Main Street", city: "Ho Chi Minh City", country: "VN" },
            shippingQuoteId: "quote-1",
            deliveryAddress: { recipientName: "Buyer One", recipientPhone: "0901234567", addressLine: "1 Main Street" },
            locale: "en",
        };
        const firstFingerprint = await fingerprintPayOSRequest(request);
        const first = getOrCreatePayOSSubmission(firstFingerprint, request.cart);
        const unchanged = getOrCreatePayOSSubmission(await fingerprintPayOSRequest(request), request.cart);
        const changedContact = getOrCreatePayOSSubmission(
            await fingerprintPayOSRequest({ ...request, contact: { ...request.contact, name: "Buyer Two" } }),
            request.cart,
        );

        expect(unchanged.idempotencyKey).toBe(first.idempotencyKey);
        expect(changedContact.idempotencyKey).not.toBe(first.idempotencyKey);
        const stored = sessionStorage.getItem("checkoutPending") || "";
        expect(stored).not.toContain("buyer@example.test");
        expect(stored).not.toContain("0901234567");
        expect(stored).not.toContain("Main Street");
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
