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

export type GuestPaymentMethod = "cash" | "payos";
export type GuestPurchasePayload = {
    cart: GuestCartItemInput[];
    contact: GuestContactDto;
    shipping: GuestShippingDto;
    discountCode?: string;
    paymentMethod: GuestPaymentMethod;
};

export type GuestPayOSCheckoutPayload = Omit<GuestPurchasePayload, "paymentMethod"> & {
    paymentMethod: "payos";
};

export type GuestOrderLookupPayload = {
    orderId: number;
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

export type PurchasePayload = {
    totalPrice: number;
    cart: CartCheckoutItem[];
    discount: number;
    discountCode?: string;
    shippingAddress: string;
    paymentMethod: "cash" | "payos";
};
