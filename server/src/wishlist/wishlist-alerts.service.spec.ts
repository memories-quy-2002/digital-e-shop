import { describe, expect, it, vi } from "vitest";
import type { TransactionContext } from "../database/transaction";
import { WishlistAlertsService } from "./wishlist-alerts.service";

const transaction = {} as TransactionContext;

describe("WishlistAlertsService", () => {
    it("creates one price-drop notification when the effective price falls below the baseline", async () => {
        const repository = {
            findPreferencesForProductForUpdate: vi.fn().mockResolvedValue([{
                id: 1,
                user_id: "customer-1",
                product_id: 41,
                price_drop_enabled: 1,
                back_in_stock_enabled: 0,
                price_baseline: 1_000_000,
                stock_available: 1,
            }]),
            insertNotificationInTransaction: vi.fn().mockResolvedValue(undefined),
            updatePreferenceStateInTransaction: vi.fn().mockResolvedValue(undefined),
        };
        const service = new WishlistAlertsService(repository as never);

        await service.processProductChangeInTransaction(transaction, {
            productId: 41,
            productName: "Studio headphones",
            priceBefore: 1_000_000,
            salePriceBefore: null,
            stockBefore: 5,
            priceAfter: 1_000_000,
            salePriceAfter: 850_000,
            stockAfter: 5,
        });

        expect(repository.insertNotificationInTransaction).toHaveBeenCalledWith(
            transaction,
            expect.objectContaining({
                userId: "customer-1",
                type: "wishlist_price_drop",
                metadata: expect.objectContaining({
                    productId: 41,
                    previousPrice: 1_000_000,
                    currentPrice: 850_000,
                }),
            }),
        );
        expect(repository.insertNotificationInTransaction).toHaveBeenCalledTimes(1);
        expect(repository.updatePreferenceStateInTransaction).toHaveBeenCalledWith(
            transaction,
            1,
            expect.objectContaining({ priceBaseline: 850_000, stockAvailable: true }),
        );
    });

    it("creates one back-in-stock notification for a zero-to-positive stock transition", async () => {
        const repository = {
            findPreferencesForProductForUpdate: vi.fn().mockResolvedValue([{
                id: 2,
                user_id: "customer-2",
                product_id: 52,
                price_drop_enabled: 0,
                back_in_stock_enabled: 1,
                price_baseline: 500_000,
                stock_available: 0,
            }]),
            insertNotificationInTransaction: vi.fn().mockResolvedValue(undefined),
            updatePreferenceStateInTransaction: vi.fn().mockResolvedValue(undefined),
        };
        const service = new WishlistAlertsService(repository as never);

        await service.processProductChangeInTransaction(transaction, {
            productId: 52,
            productName: "USB-C dock",
            priceBefore: 500_000,
            salePriceBefore: null,
            stockBefore: 0,
            priceAfter: 500_000,
            salePriceAfter: null,
            stockAfter: 3,
        });

        expect(repository.insertNotificationInTransaction).toHaveBeenCalledWith(
            transaction,
            expect.objectContaining({
                userId: "customer-2",
                type: "wishlist_back_in_stock",
                metadata: expect.objectContaining({ productId: 52, stock: 3 }),
            }),
        );
        expect(repository.insertNotificationInTransaction).toHaveBeenCalledTimes(1);
        expect(repository.updatePreferenceStateInTransaction).toHaveBeenCalledWith(
            transaction,
            2,
            expect.objectContaining({ priceBaseline: 500_000, stockAvailable: true }),
        );
    });
});
