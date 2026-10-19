import type { InternalDeliveryAddress } from "../shipping.types";
export const deliveryAddress: InternalDeliveryAddress = {
    recipientName: "Test Buyer", recipientPhone: "0900000000", addressLine: "1 Test Street",
    city: "Ho Chi Minh City", latitude: 10.7769, longitude: 106.7009, country: "VN",
};
export const deliveryCheckout = { shippingQuoteId: "11111111-1111-4111-8111-111111111111", deliveryAddress };
