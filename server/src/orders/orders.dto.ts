import type { CartCheckoutItem } from "../cart/cart.dto";

export type PurchasePayload = {
    totalPrice: number;
    cart: CartCheckoutItem[];
    discount: number;
    discountCode?: string;
    shippingAddress: string;
    paymentMethod: string;
};
