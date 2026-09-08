import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useRecentlyViewed } from "../useRecentlyViewed";

const product = {
    id: 190,
    name: "Intel Core Ultra Kit",
    category: "PC",
    brand: "Intel",
    price: 449,
    sale_price: 419,
    main_image: null,
    stock: 39,
    rating: 4,
    reviews: 2,
};

describe("useRecentlyViewed", () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    it("prunes entries whose product IDs are no longer in the live catalog", () => {
        const { result } = renderHook(() => useRecentlyViewed());
        const deletedProduct = { ...product, id: 901, name: "Deleted Demo Product" };

        act(() => {
            result.current.track(deletedProduct);
            result.current.track(product);
        });

        act(() => {
            result.current.prune(new Set([product.id]));
        });

        expect(result.current.items.map((item) => item.id)).toEqual([product.id]);
    });
});
