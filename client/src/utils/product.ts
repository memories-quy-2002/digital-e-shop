import type { Product } from "../types/product";

const asNumber = (value: unknown, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const nullableNumber = (value: unknown) => {
    if (value === null || value === undefined || value === "") {
        return null;
    }

    return asNumber(value, 0);
};

export const normalizeProduct = (value: unknown): Product => {
    const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};

    return {
        id: asNumber(source.id),
        name: String(source.name ?? ""),
        category: String(source.category ?? ""),
        brand: String(source.brand ?? ""),
        price: asNumber(source.price),
        sale_price: nullableNumber(source.sale_price),
        rating: asNumber(source.rating),
        reviews: asNumber(source.reviews),
        main_image: source.main_image ? String(source.main_image) : null,
        stock: asNumber(source.stock),
        description: String(source.description ?? ""),
        specifications:
            source.specifications === null || source.specifications === undefined
                ? null
                : String(source.specifications),
    };
};

export const normalizeProducts = (value: unknown): Product[] =>
    Array.isArray(value) ? value.map(normalizeProduct) : [];

export const formatProductRating = (value: number | string | null | undefined) => Number(value || 0).toFixed(1);
