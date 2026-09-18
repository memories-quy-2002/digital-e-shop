import { Injectable } from "@nestjs/common";
import type { TransactionContext } from "../database/transaction";
import { WishlistAlertsRepository } from "./wishlist-alerts.repository";
import type { ProductAlertChange } from "./wishlist-alerts.types";

const effectivePrice = (price: number, salePrice: number | string | null) => {
    const basePrice = Number(price) || 0;
    const sale = salePrice === null ? null : Number(salePrice);
    return sale !== null && Number.isFinite(sale) && sale > 0 && sale < basePrice ? sale : basePrice;
};

@Injectable()
export class WishlistAlertsService {
    constructor(private readonly wishlistAlertsRepository: WishlistAlertsRepository) {}

    async processProductChangeInTransaction(tx: TransactionContext, change: ProductAlertChange): Promise<void> {
        const preferences = await this.wishlistAlertsRepository.findPreferencesForProductForUpdate(tx, change.productId);
        if (preferences.length === 0) return;

        const previousPrice = effectivePrice(change.priceBefore, change.salePriceBefore);
        const currentPrice = effectivePrice(change.priceAfter, change.salePriceAfter);
        const stockAvailable = change.stockAfter > 0;

        for (const preference of preferences) {
            const priceDropEnabled = Boolean(preference.price_drop_enabled);
            const backInStockEnabled = Boolean(preference.back_in_stock_enabled);
            const baseline = Number(preference.price_baseline) || previousPrice;
            const wasAvailable = Boolean(preference.stock_available);

            if (priceDropEnabled && stockAvailable && currentPrice < baseline) {
                await this.wishlistAlertsRepository.insertNotificationInTransaction(tx, {
                    userId: preference.user_id,
                    type: "wishlist_price_drop",
                    title: `${change.productName} is now more affordable`,
                    message: `The price changed from ${previousPrice} to ${currentPrice}. Open the product to see the current offer.`,
                    link: `/product?id=${change.productId}`,
                    metadata: {
                        productId: change.productId,
                        productName: change.productName,
                        previousPrice,
                        currentPrice,
                    },
                });
            }

            if (backInStockEnabled && stockAvailable && !wasAvailable) {
                await this.wishlistAlertsRepository.insertNotificationInTransaction(tx, {
                    userId: preference.user_id,
                    type: "wishlist_back_in_stock",
                    title: `${change.productName} is back in stock`,
                    message: "The product is available again. Open it while stock is available.",
                    link: `/product?id=${change.productId}`,
                    metadata: {
                        productId: change.productId,
                        productName: change.productName,
                        currentPrice,
                        stock: change.stockAfter,
                    },
                });
            }

            await this.wishlistAlertsRepository.updatePreferenceStateInTransaction(tx, preference.id, {
                priceBaseline: currentPrice,
                stockAvailable,
            });
        }
    }
}

export { effectivePrice };
