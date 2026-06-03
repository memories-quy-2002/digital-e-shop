import type { CartCheckoutItem } from "#/modules/cart/cart.dto";

export type PurchasePayload = {
    totalPrice: number;
    cart: CartCheckoutItem[];
    discount: number;
    shippingAddress: string;
    paymentMethod: string;
};
