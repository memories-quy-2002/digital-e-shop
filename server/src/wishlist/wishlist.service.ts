import { Injectable } from "@nestjs/common";
import type { ServiceResultMessage } from "#src/shared/interfaces/domain";
import type { WishlistRow } from "./wishlist.types";
import { WishlistRepository } from "./wishlist.repository";

@Injectable()
export class NestWishlistService {
    constructor(private readonly wishlistRepository: WishlistRepository) {}

    async addItemToWishlist(uid: string, pid: number): Promise<ServiceResultMessage> {
        await this.wishlistRepository.addItemToWishlist(uid, pid);
        return `Product with id = ${pid} has been added successfully to the user id = ${uid}`;
    }

    getWishlist(uid: string): Promise<WishlistRow[]> {
        return this.wishlistRepository.getWishlist(uid);
    }

    async deleteWishlistItem(uid: string, pid: number): Promise<ServiceResultMessage> {
        await this.wishlistRepository.deleteWishlistItem(uid, pid);
        return `Wishlist item with product_id = ${pid} has been deleted for user_id = ${uid}`;
    }

    async deleteWishlistItems(uid: string, productIds: number[]): Promise<ServiceResultMessage> {
        if (!Array.isArray(productIds) || productIds.length === 0) {
            return "No wishlist items selected.";
        }
        await this.wishlistRepository.deleteWishlistItems(uid, productIds);
        return `${productIds.length} wishlist item(s) deleted for user_id = ${uid}`;
    }
}
