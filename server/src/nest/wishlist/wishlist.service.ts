import { Injectable } from "@nestjs/common";
import type { ServiceResultMessage } from "#src/shared/interfaces/domain";
import type { WishlistRow } from "#src/modules/wishlist/wishlist.types";

const wishlistService = require("#src/modules/wishlist/wishlist.service");

@Injectable()
export class NestWishlistService {
    addItemToWishlist(uid: string, pid: number): Promise<ServiceResultMessage> {
        return wishlistService.addItemToWishlist(uid, pid);
    }

    getWishlist(uid: string): Promise<WishlistRow[]> {
        return wishlistService.getWishlist(uid);
    }

    deleteWishlistItem(uid: string, pid: number): Promise<ServiceResultMessage> {
        return wishlistService.deleteWishlistItem(uid, pid);
    }

    deleteWishlistItems(uid: string, productIds: number[]): Promise<ServiceResultMessage> {
        return wishlistService.deleteWishlistItems(uid, productIds);
    }
}
