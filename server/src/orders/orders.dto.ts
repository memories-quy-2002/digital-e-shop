import type { CartCheckoutItem } from "../cart/cart.dto";

export type PurchasePayload = {
    totalPrice: number;
    cart: CartCheckoutItem[];
    discountCode?: string | null;
    shippingAddress: string;
    paymentMethod: string;
};
