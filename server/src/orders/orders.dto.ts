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
export type GuestStripePaymentMethod = "card" | "stripe";

export type GuestPurchasePayload = {
    cart: GuestCartItemInput[];
    contact: GuestContactDto;
    shipping: GuestShippingDto;
    discountCode?: string;
    paymentMethod: GuestPaymentMethod;
};

export type GuestCheckoutSessionPayload = {
    cart: GuestCartItemInput[];
    contact: GuestContactDto;
    shipping: GuestShippingDto;
    discountCode?: string;
    paymentMethod: GuestStripePaymentMethod;
};

export type GuestPayOSCheckoutPayload = Omit<GuestCheckoutSessionPayload, "paymentMethod"> & {
    paymentMethod: "payos";
};

export type GuestSessionLookupPayload = {
    sessionId: string;
    guestOrderToken: string;
};

export type GuestPayOSOrderLookupPayload = {
    orderCode: number;
    guestOrderToken: string;
};

export type MockPayOSConfirmPayload = {
    orderCode: number;
    paymentLinkId: string;
    amount: number;
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
