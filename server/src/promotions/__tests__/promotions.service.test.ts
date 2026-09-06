import { beforeEach, describe, expect, it, vi } from "vitest";

const { pool } = vi.hoisted(() => ({
    pool: { query: vi.fn() },
}));

vi.mock("#src/config/database.config", () => ({ default: pool }));

import { PromotionsRepository } from "../promotions.repository";

const promotion = {
    id: 9,
    discount_code: "SAVE10",
    discount_percent: 10,
    active: 1,
    min_order_value: 0,
    starts_at: null,
    expires_at: null,
    usage_limit: 1,
};

describe("transactional promotion redemptions", () => {
    it("locks the discount and reserves one quota slot", async () => {
        const tx = { query: vi.fn() };
        tx.query
            .mockResolvedValueOnce([promotion])
            .mockResolvedValueOnce([{ used: 0 }])
            .mockResolvedValueOnce({ affectedRows: 1 })
            .mockResolvedValueOnce({ insertId: 4 });
        const repository = new PromotionsRepository();

        await expect(repository.reservePromotion(
            tx,
            "save10",
            7,
            "user-1",
            new Date("2099-01-01T00:00:00.000Z"),
            100,
        )).resolves.toMatchObject({ discountId: 9, discount: 10 });

        expect(tx.query).toHaveBeenNthCalledWith(1, expect.stringContaining("FOR UPDATE"), ["SAVE10"]);
        expect(tx.query).toHaveBeenNthCalledWith(2, expect.stringContaining("status = 'CONSUMED'"), [9]);
        expect(tx.query).toHaveBeenNthCalledWith(3, expect.stringContaining("SET discount_id = ?, discount = ?"), [9, 10, 7]);
        expect(tx.query).toHaveBeenNthCalledWith(4, expect.stringContaining("'RESERVED'"), [9, 7, "user-1", expect.any(Date)]);
    });

    it("rejects a second active reservation when usage_limit is one", async () => {
        const tx = { query: vi.fn() };
        tx.query.mockResolvedValueOnce([promotion]).mockResolvedValueOnce([{ used: 1 }]);
        const repository = new PromotionsRepository();

        await expect(repository.reservePromotion(
            tx,
            "SAVE10",
            8,
            "user-2",
            new Date("2099-01-01T00:00:00.000Z"),
            100,
        )).rejects.toMatchObject({ statusCode: 409 });
        expect(tx.query).toHaveBeenCalledTimes(2);
    });

    it("consumes and releases reservations with guarded status transitions", async () => {
        const tx = { query: vi.fn().mockResolvedValue({ affectedRows: 1 }) };
        const repository = new PromotionsRepository();

        await expect(repository.consumePromotionReservation(tx, 7, 44)).resolves.toBe(1);
        await expect(repository.releasePromotionReservation(tx, 8)).resolves.toBe(1);
        expect(tx.query).toHaveBeenNthCalledWith(1, expect.stringContaining("SET status = 'CONSUMED'"), [44, 7]);
        expect(tx.query).toHaveBeenNthCalledWith(2, expect.stringContaining("SET status = 'RELEASED'"), [8]);
    });
});

describe("migration-owned promotion catalog queries", () => {
    beforeEach(() => vi.clearAllMocks());

    it("lists promotions with the complete migration-owned column set", () => {
        pool.query.mockImplementationOnce((...args) => {
            const callback = args.at(-1);
            if (typeof callback === "function") callback(null, []);
        });
        const repository = new PromotionsRepository();

        repository.getPromotions(vi.fn());

        const sql = pool.query.mock.calls[0][0] as string;
        expect(sql).toContain("discount_code");
        expect(sql).toContain("description");
        expect(sql).toContain("discount_percent");
        expect(sql).toContain("active");
        expect(sql).toContain("min_order_value");
        expect(sql).toContain("starts_at");
        expect(sql).toContain("expires_at");
        expect(sql).toContain("usage_limit");
        expect(sql).not.toMatch(/CREATE TABLE|ALTER TABLE|SHOW COLUMNS|information_schema/i);
    });

    it("writes all promotion fields without optional-column branching", () => {
        pool.query.mockImplementation((...args) => {
            const callback = args.at(-1);
            if (typeof callback === "function") callback(null, { affectedRows: 1, insertId: 12 });
        });
        const repository = new PromotionsRepository();
        const payload = {
            discountCode: "SAVE10",
            discountPercent: 10,
            active: 1 as const,
            minOrderValue: 25,
            startsAt: null,
            expiresAt: null,
            usageLimit: 3,
        };

        repository.createPromotion(payload, vi.fn());
        repository.updatePromotion(12, payload, vi.fn());
        repository.deletePromotion(12, vi.fn());

        expect(pool.query).toHaveBeenNthCalledWith(
            1,
            expect.stringContaining("(discount_code, discount_percent, active, min_order_value, starts_at, expires_at, usage_limit)"),
            ["SAVE10", 10, 1, 25, null, null, 3],
            expect.any(Function),
        );
        expect(pool.query.mock.calls[1][0]).toContain("SET discount_code = ?, discount_percent = ?, active = ?");
        expect(pool.query.mock.calls[2]).toEqual(["UPDATE discounts SET active = 0 WHERE id = ?", [12], expect.any(Function)]);
    });

    it("applies active and date validity predicates for public promotion lookup", () => {
        pool.query.mockImplementationOnce((...args) => {
            const callback = args.at(-1);
            if (typeof callback === "function") callback(null, []);
        });
        const repository = new PromotionsRepository();

        repository.getActivePromotionByCode("SAVE10", vi.fn());

        const [sql, params] = pool.query.mock.calls[0] as [string, unknown[]];
        expect(sql).toContain("active = 1");
        expect(sql).toContain("starts_at IS NULL OR starts_at <= UTC_TIMESTAMP()");
        expect(sql).toContain("expires_at IS NULL OR expires_at >= UTC_TIMESTAMP()");
        expect(params).toEqual(["SAVE10"]);
    });
});
