import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    GUEST_CART_STORAGE_KEY,
    addGuestCartItem,
    clearGuestCart,
    readGuestCart,
    removeGuestCartItem,
    updateGuestCartItem,
} from "./guestCartStorage";

describe("guest cart storage", () => {
    beforeEach(() => {
        localStorage.clear();
        vi.restoreAllMocks();
    });

    it("round-trips only product IDs and quantities", () => {
        addGuestCartItem({ productId: 18, quantity: 2, price: 999, stock: 4, userId: "ignored" } as never);

        expect(readGuestCart()).toEqual([{ productId: 18, quantity: 2 }]);
        expect(JSON.parse(localStorage.getItem(GUEST_CART_STORAGE_KEY) || "{}")).toEqual({
            items: [{ productId: 18, quantity: 2 }],
        });
    });

    it("replaces a matching quantity and removes requested products", () => {
        addGuestCartItem({ productId: 18, quantity: 1 });
        updateGuestCartItem(18, 4.9);
        removeGuestCartItem(18);

        expect(readGuestCart()).toEqual([]);
    });

    it("floors finite quantities and ignores non-finite additions", () => {
        addGuestCartItem({ productId: 18, quantity: 2.9 });
        updateGuestCartItem(18, 4.9);
        addGuestCartItem({ productId: 22, quantity: Number.NaN });

        expect(readGuestCart()).toEqual([{ productId: 18, quantity: 4 }]);
    });

    it("clears the persisted guest cart", () => {
        addGuestCartItem({ productId: 18, quantity: 1 });
        clearGuestCart();

        expect(localStorage.getItem(GUEST_CART_STORAGE_KEY)).toBeNull();
        expect(readGuestCart()).toEqual([]);
    });

    it("recovers safely from malformed persisted data", () => {
        localStorage.setItem(GUEST_CART_STORAGE_KEY, "{bad-json");

        expect(readGuestCart()).toEqual([]);
        expect(localStorage.getItem(GUEST_CART_STORAGE_KEY)).toBeNull();
    });

    it("rewrites legacy extra fields to the minimal representation when reading", () => {
        localStorage.setItem(GUEST_CART_STORAGE_KEY, JSON.stringify({
            items: [{ productId: 18, quantity: 2, price: 999, stock: 4, userId: "private" }],
        }));

        expect(readGuestCart()).toEqual([{ productId: 18, quantity: 2 }]);
        expect(JSON.parse(localStorage.getItem(GUEST_CART_STORAGE_KEY) || "{}")).toEqual({
            items: [{ productId: 18, quantity: 2 }],
        });
    });

    it("coalesces duplicate products and bounds their combined quantity", () => {
        localStorage.setItem(GUEST_CART_STORAGE_KEY, JSON.stringify({
            items: [
                { productId: 18, quantity: 70 },
                { productId: 18, quantity: 70 },
                { productId: 22, quantity: 2 },
            ],
        }));

        expect(readGuestCart()).toEqual([
            { productId: 18, quantity: 99 },
            { productId: 22, quantity: 2 },
        ]);
    });

    it("returns an empty cart when local storage is unavailable", () => {
        vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
            throw new Error("Storage disabled");
        });

        expect(readGuestCart()).toEqual([]);
    });
});
