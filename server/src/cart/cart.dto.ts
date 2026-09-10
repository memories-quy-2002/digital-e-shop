export type CartCheckoutItem = {
    productId: number;
    quantity: number;
    price: number;
    sale_price?: number | null;
};

export type GuestCartItemInput = {
    productId: number;
    quantity: number;
};

export type GuestCartPreviewInput = {
    items: GuestCartItemInput[];
    discountCode?: string;
};
