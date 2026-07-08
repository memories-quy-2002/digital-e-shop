import type { CartCheckoutItem } from "../cart/cart.dto";

export type PurchasePayload = {
    totalPrice: number;
    cart: CartCheckoutItem[];
    discount: number;
    shippingAddress: string;
    paymentMethod: string;
};
