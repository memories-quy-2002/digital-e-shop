import type { Wishlist } from "../../types/product";

export type WishlistMutation =
    | { type: "add"; item: Wishlist }
    | { type: "remove"; productId: number };

export const applyWishlistMutation = (
    wishlist: Wishlist[],
    mutation: WishlistMutation,
): Wishlist[] => {
    if (mutation.type === "remove") {
        return wishlist.filter((item) => item.product.id !== mutation.productId);
    }

    if (wishlist.some((item) => item.product.id === mutation.item.product.id)) {
        return wishlist;
    }

    return [...wishlist, mutation.item];
};
