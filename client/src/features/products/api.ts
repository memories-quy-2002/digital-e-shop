import http from "../../lib/http";
import type { Product, Review, ReviewSummary, Wishlist } from "../../types/product";
import { normalizeProduct } from "../../utils/product";

export type ProductAttributeType = "text" | "number";

export type ProductAttributeInput =
    | {
          key: string;
          label: string;
          type: "text";
          textValue: string;
          unit?: string;
          filterable?: boolean;
      }
    | {
          key: string;
          label: string;
          type: "number";
          numberValue: number;
          unit?: string;
          filterable?: boolean;
      };

export type ProductAttributeRow = {
    id: string;
    key: string;
    label: string;
    type: ProductAttributeType;
    value: string;
    unit: string;
    filterable: boolean;
};

export type ProductWithAttributes = Product & {
    attributes: ProductAttributeRow[];
};

type RawProductAttribute = Record<string, unknown>;

let attributeRowSequence = 0;

export const normalizeAttributeKey = (value: string): string =>
    value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "");

export const createProductAttributeRow = (): ProductAttributeRow => ({
    id: `attribute-${++attributeRowSequence}`,
    key: "",
    label: "",
    type: "text",
    value: "",
    unit: "",
    filterable: true,
});

const asBoolean = (value: unknown, fallback = true): boolean => {
    if (value === undefined || value === null || value === "") {
        return fallback;
    }

    if (typeof value === "string") {
        return value !== "false" && value !== "0";
    }

    return Boolean(value);
};

const asAttributeValue = (source: RawProductAttribute, type: ProductAttributeType): string => {
    const value = type === "number"
        ? source.numberValue ?? source.number_value ?? source.value
        : source.textValue ?? source.text_value ?? source.value;

    return value === null || value === undefined ? "" : String(value);
};

export const normalizeProductAttributes = (value: unknown): ProductAttributeRow[] => {
    const entries = Array.isArray(value)
        ? value.map((item, index) => [String(index), item] as const)
        : value && typeof value === "object"
          ? Object.entries(value as Record<string, unknown>)
          : [];

    if (entries.length === 0) {
        return [];
    }

    return entries.map(([entryKey, item], index) => {
        const source = item && typeof item === "object" ? (item as RawProductAttribute) : {};
        const rawType = source.type ?? source.value_type;
        const type: ProductAttributeType = rawType === "number" ||
            (rawType !== "text" &&
                ((source.numberValue !== null && source.numberValue !== undefined) ||
                    (source.number_value !== null && source.number_value !== undefined)))
            ? "number"
            : "text";
        const key = normalizeAttributeKey(String(source.key ?? source.attribute_key ?? entryKey ?? ""));

        return {
            id: String(source.id ?? `attribute-${index}-${key || "new"}`),
            key,
            label: String(source.label ?? ""),
            type,
            value: asAttributeValue(source, type),
            unit: String(source.unit ?? ""),
            filterable: asBoolean(source.filterable),
        };
    });
};

export const productAttributeRowsToInputs = (rows: ProductAttributeRow[]): ProductAttributeInput[] => {
    const seenKeys = new Set<string>();

    return rows.map((row) => {
        const key = normalizeAttributeKey(row.key);
        const label = row.label.trim();
        const value = row.value.trim();
        const unit = row.unit.trim();

        if (!key) {
            throw new Error("Each attribute needs a key.");
        }

        if (!/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test(key) || key.length > 80) {
            throw new Error(`Attribute key must use lowercase snake_case: ${key}`);
        }

        if (seenKeys.has(key)) {
            throw new Error(`Duplicate attribute key: ${key}`);
        }
        seenKeys.add(key);

        if (!label) {
            throw new Error(`Attribute ${key} needs a label.`);
        }

        if (!value) {
            throw new Error(`Attribute ${key} needs a value.`);
        }

        if (row.type === "number") {
            const numberValue = Number(value);
            if (!Number.isFinite(numberValue)) {
                throw new Error(`Attribute ${key} must contain a valid number.`);
            }

            return {
                key,
                label,
                type: "number",
                numberValue,
                ...(unit ? { unit } : {}),
                filterable: row.filterable,
            };
        }

        return {
            key,
            label,
            type: "text",
            textValue: value,
            ...(unit ? { unit } : {}),
            filterable: row.filterable,
        };
    });
};

export const normalizeProductWithAttributes = (value: unknown): ProductWithAttributes => {
    const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
    return {
        ...normalizeProduct(value),
        attributes: normalizeProductAttributes(source.attributes),
    };
};

type RawWishlistItem = {
    id: number;
    product_id: number;
    name: string;
    category: string;
    brand: string;
    price: number;
    sale_price: number | null;
    rating: number;
    reviews: number;
    main_image: string | null;
    stock: number;
    description: string;
    specifications: string | null;
};

const normalizeReviews = (items: any[] = []): Review[] =>
    items.map((review: any) => ({
        id: review.id,
        username: review.username,
        rating: Number(review.rating) || 0,
        reviewText: review.review_text || review.reviewText || "",
        created_at: review.created_at,
        verified_purchase: Boolean(review.verified_purchase),
    }));

const normalizeSummary = (summary?: any): ReviewSummary => ({
    total: Number(summary?.total) || 0,
    average: Number(summary?.average) || 0,
    distribution: {
        5: Number(summary?.distribution?.[5]) || 0,
        4: Number(summary?.distribution?.[4]) || 0,
        3: Number(summary?.distribution?.[3]) || 0,
        2: Number(summary?.distribution?.[2]) || 0,
        1: Number(summary?.distribution?.[1]) || 0,
    },
});

const isNotFoundError = (error: unknown): boolean => {
    if (!error || typeof error !== "object" || !("response" in error)) {
        return false;
    }

    const response = (error as { response?: { status?: unknown } }).response;
    return response?.status === 404;
};

export async function fetchProduct(productId: number): Promise<ProductWithAttributes | null> {
    try {
        const response = await http.get(`/api/products/${productId}`);
        return response.data.product ? normalizeProductWithAttributes(response.data.product) : null;
    } catch (error) {
        if (isNotFoundError(error)) {
            return null;
        }

        throw error;
    }
}

export async function fetchRelevantProducts(productId: number): Promise<Product[]> {
    const response = await http.get(`/api/products/relevant/${productId}`);
    return Array.isArray(response.data.relevantProducts)
        ? response.data.relevantProducts.map(normalizeProductWithAttributes)
        : [];
}

export async function fetchWishlist(uid: string): Promise<Wishlist[]> {
    const response = await http.get(`/api/wishlist/${uid}`);
    return (response.data.wishlist || []).map((item: RawWishlistItem) => {
        const { id, product_id, ...productProps } = item;
        return {
            id,
            product: normalizeProductWithAttributes({ id: product_id, ...productProps }),
        };
    });
}

export async function fetchReviews(productId: number): Promise<{ reviews: Review[]; summary: ReviewSummary }> {
    const response = await http.get(`/api/reviews/${productId}`);
    return {
        reviews: normalizeReviews(response.data.reviews || []),
        summary: normalizeSummary(response.data.summary),
    };
}

export async function submitReview(
    uid: string,
    productId: number,
    rating: number,
    reviewText: string,
): Promise<void> {
    await http.post("/api/reviews/", {
        uid,
        pid: productId,
        rating,
        reviewText,
        comment: reviewText,
    });
}

export async function addToWishlist(uid: string, productId: number): Promise<any> {
    const response = await http.post("/api/wishlist/", { uid, pid: productId });
    return response.data;
}

export async function removeFromWishlist(productId: number): Promise<void> {
    await http.delete(`/api/wishlist/${productId}`);
}
