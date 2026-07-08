export type CartCheckoutItem = {
    productId: number;
    quantity: number;
    price: number;
    sale_price?: number | null;
};
