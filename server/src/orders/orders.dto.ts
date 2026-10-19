import type { CartCheckoutItem, GuestCartItemInput } from "../cart/cart.dto";
import type { InternalDeliveryAddress } from "../shipping/shipping.types";
export type DeliveryCheckoutInput = { shippingQuoteId: string; deliveryAddress: InternalDeliveryAddress; locale?: "en" | "vi" };

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
export type GuestPurchasePayload = DeliveryCheckoutInput & {
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
    orderId: number | string;
    guestOrderToken: string;
};

export type GuestPayOSOrderLookupPayload = {
    orderCode: number;
    guestOrderToken: string;
};

export type MockPayOSConfirmPayload = {
    paymentAttemptId: string;
    orderCode: number;
    paymentLinkId: string;
    amount: number;
};

export type PurchasePayload = DeliveryCheckoutInput & {
    totalPrice: number;
    cart: CartCheckoutItem[];
    discount: number;
    discountCode?: string;
    loyaltyPoints?: number;
    shippingAddress: string;
    paymentMethod: PaymentProviderName;
};
