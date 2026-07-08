export interface Product {
    id: number;
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
}

export type Review = {
    id?: number;
    username: string;
    rating: number;
    reviewText: string;
    created_at: string;
    verified_purchase?: boolean;
};

export type ReviewSummary = {
    total: number;
    average: number;
    distribution: Record<1 | 2 | 3 | 4 | 5, number>;
};

export type Wishlist = {
    id: number;
    product: Product;
};
