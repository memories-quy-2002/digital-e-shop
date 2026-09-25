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

import type { PaymentProviderName, PayOSPaymentProvider } from "../payments/payment.types";

export type GuestPaymentMethod = PaymentProviderName;
export type GuestPurchasePayload = {
    cart: GuestCartItemInput[];
    contact: GuestContactDto;
    shipping: GuestShippingDto;
    discountCode?: string;
    paymentMethod: GuestPaymentMethod;
};

export type GuestPayOSCheckoutPayload = Omit<GuestPurchasePayload, "paymentMethod"> & {
    paymentMethod: PayOSPaymentProvider;
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
    paymentMethod: PaymentProviderName;
};
