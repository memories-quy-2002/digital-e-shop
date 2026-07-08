import http from "../../lib/http";
import type { Product, Review, ReviewSummary, Wishlist } from "../../types/product";

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

export async function fetchProduct(productId: number): Promise<Product | null> {
    const response = await http.get(`/api/products/${productId}`);
    return response.data.product || null;
}

export async function fetchRelevantProducts(productId: number): Promise<Product[]> {
    const response = await http.get(`/api/products/relevant/${productId}`);
    return response.data.relevantProducts || [];
}

export async function fetchWishlist(uid: string): Promise<Wishlist[]> {
    const response = await http.get(`/api/wishlist/${uid}`);
    return (response.data.wishlist || []).map((item: RawWishlistItem) => {
        const { id, product_id, ...productProps } = item;
        return {
            id,
            product: { id: product_id, ...productProps },
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

export async function addToCart(uid: string, productId: number, quantity: number): Promise<void> {
    await http.post("/api/cart/", {
        uid,
        pid: productId,
        quantity,
    });
}

export async function addToWishlist(uid: string, productId: number): Promise<any> {
    const response = await http.post("/api/wishlist/", { uid, pid: productId });
    return response.data;
}

export async function removeFromWishlist(productId: number): Promise<void> {
    await http.delete(`/api/wishlist/${productId}`);
}
