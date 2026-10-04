import { beforeEach, describe, expect, it, vi } from "vitest";

const { pool } = vi.hoisted(() => ({ pool: { query: vi.fn() } }));

vi.mock("#src/config/database.config", () => ({ default: pool }));

import { CartRepository } from "../cart.repository";

describe("CartRepository", () => {
    beforeEach(() => pool.query.mockReset());

    it("returns guest preview rows from a parameterized query", async () => {
        const rows = [{ product_id: 10 }, { product_id: 20 }];
        pool.query.mockImplementation((...args) => {
            const callback = args.at(-1);
            if (typeof callback !== "function") return;
            callback(null, rows);
        });

        await expect(new CartRepository().getGuestCartPreviewItems([10, 20])).resolves.toBe(rows);

        const [sql, params] = pool.query.mock.calls[0];
        expect(sql).toContain("p.id IN (?, ?)");
        expect(sql).not.toContain("p.stock >= 0");
        expect(sql).toContain("GREATEST(p.stock - COALESCE(active_reservations.reserved_quantity, 0), 0) AS available_stock");
        expect(params).toEqual([10, 20]);
    });

    it("returns an empty guest preview without querying when there are no product IDs", async () => {
        await expect(new CartRepository().getGuestCartPreviewItems([])).resolves.toEqual([]);
        expect(pool.query).not.toHaveBeenCalled();
    });

    it("rejects when the database query fails", async () => {
        const databaseError = new Error("database unavailable");
        pool.query.mockImplementation((...args) => {
            const callback = args.at(-1);
            if (typeof callback !== "function") return;
            callback(databaseError);
        });

        await expect(new CartRepository().getCartIdByUserId("user-1")).rejects.toBe(databaseError);
    });

    it("keeps customer cart reads and mutations scoped to the active owner", async () => {
        pool.query.mockImplementation((...args) => {
            const callback = args.at(-1);
            if (typeof callback !== "function") return;
            callback(null, { affectedRows: 1 });
        });
        const repository = new CartRepository();

        await Promise.all([
            repository.getCartItemQuantityByUserId("user-1", 10),
            repository.getCartItemStock(7, "user-1"),
            repository.updateCartItemQuantity(7, "user-1", 3),
            repository.deleteCartItem(7, "user-1"),
        ]);

        expect(pool.query.mock.calls[0][0]).toContain("c.user_id = ?");
        expect(pool.query.mock.calls[0][1]).toEqual(["user-1", 10]);
        expect(pool.query.mock.calls[1][0]).toContain("c.user_id = ?");
        expect(pool.query.mock.calls[1][1]).toEqual(["user-1", 7]);
        expect(pool.query.mock.calls[2][0]).toContain("c.user_id = ?");
        expect(pool.query.mock.calls[2][1]).toEqual(["user-1", 3, 7]);
        expect(pool.query.mock.calls[3][0]).toContain("DELETE ci FROM cart_items");
        expect(pool.query.mock.calls[3][1]).toEqual(["user-1", 7]);
    });
});
