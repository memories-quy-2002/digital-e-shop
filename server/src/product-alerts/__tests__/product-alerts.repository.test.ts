import { beforeEach, describe, expect, it, vi } from "vitest";

const poolQuery = vi.hoisted(() => vi.fn());

vi.mock("#src/config/database.config", () => ({
    default: { query: poolQuery },
}));

import { ProductAlertsRepository } from "../product-alerts.repository";

describe("ProductAlertsRepository", () => {
    beforeEach(() => vi.clearAllMocks());

    it("lists only alert subscriptions for valid product rows", () => {
        new ProductAlertsRepository().listByUser("user-1").then(() => undefined).catch(() => undefined);

        const [sql, params] = poolQuery.mock.calls[0];
        expect(sql).toContain("JOIN products ON products.id = product_alert_subscriptions.product_id");
        expect(sql).toContain("products.stock >= 0");
        expect(params).toEqual(["user-1"]);
    });

    it("scopes preference reads to the authenticated user and product", () => {
        const callback = vi.fn();
        new ProductAlertsRepository().findByUserAndProduct("user-1", 42).then(() => undefined).catch(() => undefined);

        const [sql, params] = poolQuery.mock.calls[0];
        expect(sql).toContain("FROM product_alert_subscriptions");
        expect(sql).toContain("user_id = ?");
        expect(sql).toContain("product_id = ?");
        expect(params).toEqual(["user-1", 42]);
        expect(callback).not.toHaveBeenCalled();
    });

    it("does not expose an alert preference for an unavailable product row", () => {
        new ProductAlertsRepository().findByUserAndProduct("user-1", 42).then(() => undefined).catch(() => undefined);

        const [sql] = poolQuery.mock.calls[0];
        expect(sql).toContain("JOIN products ON products.id = product_alert_subscriptions.product_id");
        expect(sql).toContain("products.stock >= 0");
    });

    it("deletes a subscription when both alert preferences are disabled", async () => {
        poolQuery.mockImplementationOnce((...args: unknown[]) => {
            const callback = args.at(-1);
            if (typeof callback === "function") callback(null, { affectedRows: 1 });
        });

        await expect(new ProductAlertsRepository().savePreference("user-1", 42, {
            priceDropEnabled: false,
            backInStockEnabled: false,
        })).resolves.toEqual({
            productId: 42,
            priceDropEnabled: false,
            backInStockEnabled: false,
        });

        expect(poolQuery).toHaveBeenCalledWith(
            expect.stringContaining("DELETE FROM product_alert_subscriptions"),
            ["user-1", 42],
            expect.any(Function),
        );
    });

    it("writes both preference flags with a parameterized upsert", async () => {
        poolQuery.mockImplementationOnce((...args: unknown[]) => {
            const callback = args.at(-1);
            if (typeof callback === "function") callback(null, { affectedRows: 1 });
        });

        await new ProductAlertsRepository().savePreference("user-1", 42, {
            priceDropEnabled: true,
            backInStockEnabled: false,
        });

        expect(poolQuery).toHaveBeenCalledWith(
            expect.stringContaining("ON DUPLICATE KEY UPDATE"),
            ["user-1", 42, true, false],
            expect.any(Function),
        );
    });

    it("records each transition and fans out notifications with set-based inserts", async () => {
        const tx = {
            query: vi.fn()
                .mockResolvedValueOnce({ insertId: 11 })
                .mockResolvedValueOnce({ affectedRows: 2 })
                .mockResolvedValueOnce({ insertId: 12 })
                .mockResolvedValueOnce({ affectedRows: 3 }),
        };

        await new ProductAlertsRepository().recordTransitionsInTransaction(tx, [
            {
                type: "price_drop",
                productId: 42,
                previousPrice: 100,
                currentPrice: 90,
                previousStock: 0,
                currentStock: 4,
            },
            {
                type: "back_in_stock",
                productId: 42,
                previousPrice: 90,
                currentPrice: 90,
                previousStock: 0,
                currentStock: 4,
            },
        ]);

        expect(tx.query).toHaveBeenCalledTimes(4);
        expect(tx.query).toHaveBeenNthCalledWith(1, expect.stringContaining("INSERT INTO product_alert_events"), [42, "price_drop", 100, 90, 0, 4]);
        expect(tx.query).toHaveBeenNthCalledWith(2, expect.stringContaining("INSERT INTO customer_notifications"), ["price_drop", "Price drop alert", expect.any(String), 11, 42]);
        expect(tx.query).toHaveBeenNthCalledWith(3, expect.stringContaining("INSERT INTO product_alert_events"), [42, "back_in_stock", 90, 90, 0, 4]);
        expect(tx.query).toHaveBeenNthCalledWith(4, expect.stringContaining("INSERT INTO customer_notifications"), ["back_in_stock", "Back in stock alert", expect.any(String), 12, 42]);
        expect(tx.query.mock.calls[1][0]).toContain("SELECT");
    });
});
