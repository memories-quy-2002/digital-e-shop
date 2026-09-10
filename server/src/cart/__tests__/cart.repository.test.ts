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
});
