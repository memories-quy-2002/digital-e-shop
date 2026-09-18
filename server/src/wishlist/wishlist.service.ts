import { Injectable, NotFoundException } from "@nestjs/common";
import type { ServiceResultMessage } from "#src/shared/interfaces/domain";
import type { WishlistRow } from "./wishlist.types";
import { WishlistRepository } from "./wishlist.repository";
import { WishlistAlertsRepository } from "./wishlist-alerts.repository";
import type { WishlistAlertPreferenceUpdate } from "./wishlist-alerts.types";

@Injectable()
export class NestWishlistService {
    constructor(
        private readonly wishlistRepository: WishlistRepository,
        private readonly wishlistAlertsRepository: WishlistAlertsRepository,
    ) {}

    async addItemToWishlist(uid: string, pid: number): Promise<ServiceResultMessage> {
        await this.wishlistRepository.addItemToWishlist(uid, pid);
        await this.wishlistAlertsRepository.createPreference(uid, pid);
        return `Product with id = ${pid} has been added successfully to the user id = ${uid}`;
    }

    getWishlist(uid: string): Promise<WishlistRow[]> {
        return this.wishlistRepository.getWishlist(uid);
    }

    async deleteWishlistItem(uid: string, pid: number): Promise<ServiceResultMessage> {
        await this.wishlistRepository.deleteWishlistItem(uid, pid);
        await this.wishlistAlertsRepository.deletePreferences(uid, [pid]);
        return `Wishlist item with product_id = ${pid} has been deleted for user_id = ${uid}`;
    }

    async deleteWishlistItems(uid: string, productIds: number[]): Promise<ServiceResultMessage> {
        if (!Array.isArray(productIds) || productIds.length === 0) {
            return "No wishlist items selected.";
        }
        await this.wishlistRepository.deleteWishlistItems(uid, productIds);
        await this.wishlistAlertsRepository.deletePreferences(uid, productIds);
        return `${productIds.length} wishlist item(s) deleted for user_id = ${uid}`;
    }

    async updateAlerts(uid: string, pid: number, update: WishlistAlertPreferenceUpdate) {
        // Wishlist rows created before alert preferences were introduced do not
        // have a preference row yet. The insert is idempotent and preserves any
        // existing baseline or enabled state.
        await this.wishlistAlertsRepository.createPreference(uid, pid);
        const alerts = await this.wishlistAlertsRepository.updatePreference(uid, pid, update);
        if (!alerts) {
            throw new NotFoundException({ msg: "Wishlist item not found" });
        }
        return alerts;
    }
}
