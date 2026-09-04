import { useCallback, useMemo } from "react";
import { useLocalStorage } from "./useLocalStorage";
import type { Product } from "../utils/interface";

const STORAGE_KEY = "digital-e:recently-viewed:v1";
const MAX_ITEMS = 12;

export type RecentlyViewedEntry = Pick<
    Product,
    "id" | "name" | "category" | "brand" | "price" | "sale_price" | "main_image" | "stock" | "rating" | "reviews"
>;

const sanitizeEntry = (product: Product | RecentlyViewedEntry): RecentlyViewedEntry => ({
    id: product.id,
    name: product.name,
    category: product.category,
    brand: product.brand,
    price: Number(product.price) || 0,
    sale_price:
        product.sale_price === null || product.sale_price === undefined
            ? null
            : Number(product.sale_price) || null,
    main_image: product.main_image ?? null,
    stock: Number(product.stock) || 0,
    rating: Number(product.rating) || 0,
    reviews: Number(product.reviews) || 0,
});

export function useRecentlyViewed() {
    const [items, setItems] = useLocalStorage<RecentlyViewedEntry[]>(STORAGE_KEY, []);

    const track = useCallback(
        (product: Product | RecentlyViewedEntry) => {
            if (!product || !product.id) {
                return;
            }
            const entry = sanitizeEntry(product);
            setItems((previous) => {
                const filtered = previous.filter((item) => item.id !== entry.id);
                return [entry, ...filtered].slice(0, MAX_ITEMS);
            });
        },
        [setItems],
    );

    const clear = useCallback(() => {
        setItems([]);
    }, [setItems]);

    const value = useMemo(() => ({ items, track, clear }), [items, track, clear]);

    return value;
}
