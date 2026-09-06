import { describe, expect, it, vi } from "vitest";

vi.mock("#src/config/database.config", () => ({ default: {} }));

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
