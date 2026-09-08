import type { CartCheckoutItem, GuestCartItemInput } from "../cart/cart.dto";

export type GuestContactDto = {
    email: string;
    name: string;
    phone?: string | null;
};

export type GuestShippingDto = {
    address: string;
    city: string;
    country: string;
};

export type GuestPaymentMethod = "cash" | "bank_transfer" | "payos";

export type GuestPurchasePayload = {
    cart: GuestCartItemInput[];
    contact: GuestContactDto;
    shipping: GuestShippingDto;
    discountCode?: string;
    paymentMethod: GuestPaymentMethod;
};

export type GuestOrderLookupPayload = {
    orderId: number;
    guestOrderToken: string;
};

export type PurchasePayload = {
    totalPrice: number;
    cart: CartCheckoutItem[];
    discount: number;
    discountCode?: string;
    shippingAddress: string;
    paymentMethod: string;
};
