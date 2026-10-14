import { describe, expect, it } from "vitest";
import { calculatePricing, estimateParcel, quoteFingerprint, assertQuoteMatches } from "../shipping-quote.policy";

describe("owner-bound delivery quotes", () => {
    it("discounts merchandise without discounting delivery", () => {
        expect(calculatePricing(9000000, 900000, 99000)).toEqual({ itemsSubtotal: 9000000, merchandiseDiscount: 900000, shippingFee: 99000, payableTotal: 8199000, currency: "VND" });
        expect(() => calculatePricing(10.5, 0, 1)).toThrow();
        expect(() => calculatePricing(Number.MAX_SAFE_INTEGER, 0, 1)).toThrow();
    });
    it("rejects missing parcel metadata and estimates a stacked parcel from all quantities", () => {
        expect(() => estimateParcel([{ quantity: 1, grams: null, lengthCm: 2, widthCm: 3, heightCm: 4 }])).toThrow();
        expect(estimateParcel([{ quantity: 2, grams: 500, lengthCm: 20, widthCm: 10, heightCm: 5 }, { quantity: 1, grams: 200, lengthCm: 10, widthCm: 15, heightCm: 2 }])).toEqual({ grams: 1200, lengthCm: 20, widthCm: 15, heightCm: 12 });
    });
    it("separates guest capability, signed-in identity, changed cart and address", () => {
        const base = { owner: { kind: "guest", guestCartId: "guest-a" }, cart: [{ id: 1, quantity: 1, price: 100 }], address: { ward: "1" } };
        const hash = quoteFingerprint(base);
        expect(hash).not.toBe(quoteFingerprint({ ...base, owner: { kind: "authenticated", userId: "guest-a" } }));
        expect(hash).not.toBe(quoteFingerprint({ ...base, cart: [{ id: 1, quantity: 2, price: 100 }] }));
        expect(hash).not.toBe(quoteFingerprint({ ...base, address: { ward: "2" } }));
    });
    it("rejects foreign, expired, consumed and repriced quotes", () => {
        const now = new Date("2026-10-14T00:00:00Z");
        const row = { fingerprint: "mine", expiresAt: new Date(now.getTime() + 1), consumed: false };
        expect(() => assertQuoteMatches(row, "mine", now)).not.toThrow();
        expect(() => assertQuoteMatches(row, "foreign", now)).toThrow();
        expect(() => assertQuoteMatches(row, "mine", row.expiresAt)).toThrow();
        expect(() => assertQuoteMatches({ ...row, consumed: true }, "mine", now)).toThrow();
    });
});
