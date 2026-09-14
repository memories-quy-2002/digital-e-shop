import { describe, expect, it, vi } from "vitest";

const poolQuery = vi.hoisted(() => vi.fn());

vi.mock("#src/config/database.config", () => ({
    default: { query: poolQuery },
}));

import { CartRepository } from "../cart.repository";

describe("CartRepository guest preview query", () => {
    it("loads current product data with parameterized product IDs and active reservations", () => {
        const callback = vi.fn();
        new CartRepository().getGuestCartPreviewItems([10, 20], callback);

        const [sql, params, queryCallback] = poolQuery.mock.calls[0];
        expect(sql).toContain("p.id IN (?, ?)");
        expect(sql).not.toContain("p.stock >= 0");
        expect(sql).toContain("GREATEST(p.stock - COALESCE(active_reservations.reserved_quantity, 0), 0) AS available_stock");
        expect(params).toEqual([10, 20]);
        expect(queryCallback).toBe(callback);
    });

    it("scopes cart item mutations and stock reads to the owning active customer cart", () => {
        poolQuery.mockClear();
        const repository = new CartRepository();
        repository.getCartItemQuantityByUserId("user-1", 10, vi.fn());
        repository.getCartItemStock(7, "user-1", vi.fn());
        repository.updateCartItemQuantity(7, "user-1", 3, vi.fn());
        repository.deleteCartItem(7, "user-1", vi.fn());

        expect(poolQuery.mock.calls[1][0]).toContain("c.user_id = ?");
        expect(poolQuery.mock.calls[1][1]).toEqual(["user-1", 7]);
        expect(poolQuery.mock.calls[2][0]).toContain("c.user_id = ?");
        expect(poolQuery.mock.calls[2][1]).toEqual(["user-1", 3, 7]);
        expect(poolQuery.mock.calls[3][0]).toContain("DELETE ci FROM cart_items");
        expect(poolQuery.mock.calls[3][1]).toEqual(["user-1", 7]);
    });
});
