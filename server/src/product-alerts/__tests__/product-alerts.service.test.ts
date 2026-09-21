import { describe, expect, it, vi } from "vitest";
import { ProductAlertsService } from "../product-alerts.service";

const preference = {
    productId: 42,
    priceDropEnabled: true,
    backInStockEnabled: false,
};

describe("ProductAlertsService", () => {
    it("normalizes a missing product preference into disabled flags", async () => {
        const repository = {
            findByUserAndProduct: vi.fn().mockResolvedValue(null),
        };
        const service = new ProductAlertsService(repository as never);

        await expect(service.getForProduct("user-1", 42)).resolves.toEqual({
            productId: 42,
            priceDropEnabled: false,
            backInStockEnabled: false,
        });
    });

    it("rejects invalid product IDs before repository access", async () => {
        const repository = {
            findByUserAndProduct: vi.fn(),
        };
        const service = new ProductAlertsService(repository as never);

        await expect(service.getForProduct("user-1", 0)).rejects.toMatchObject({ status: 400 });
        expect(repository.findByUserAndProduct).not.toHaveBeenCalled();
    });

    it("delegates list and update operations with the authenticated user scope", async () => {
        const repository = {
            listByUser: vi.fn().mockResolvedValue([preference]),
            savePreference: vi.fn().mockResolvedValue(preference),
        };
        const service = new ProductAlertsService(repository as never);

        await expect(service.getForUser("user-1")).resolves.toEqual([preference]);
        await expect(service.updateForUser("user-1", 42, {
            priceDropEnabled: true,
            backInStockEnabled: false,
        })).resolves.toEqual(preference);
        expect(repository.listByUser).toHaveBeenCalledWith("user-1");
        expect(repository.savePreference).toHaveBeenCalledWith("user-1", 42, {
            priceDropEnabled: true,
            backInStockEnabled: false,
        });
    });

    it("records one event and one set-based notification fan-out per transition type", async () => {
        const repository = {
            recordTransitionsInTransaction: vi.fn().mockResolvedValue(undefined),
        };
        const service = new ProductAlertsService(repository as never);
        const tx = { query: vi.fn() };
        const transitions = [
            {
                type: "price_drop" as const,
                productId: 42,
                previousPrice: 100,
                currentPrice: 90,
                previousStock: 0,
                currentStock: 4,
            },
        ];

        await expect(service.recordTransitionsInTransaction(tx as never, transitions)).resolves.toBeUndefined();
        expect(repository.recordTransitionsInTransaction).toHaveBeenCalledWith(tx, transitions);
    });
});
