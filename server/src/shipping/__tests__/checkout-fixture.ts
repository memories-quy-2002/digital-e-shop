import type { DeliveryAddress } from "../shipping.types";
export const deliveryAddress: DeliveryAddress = {
    recipientName: "Test Buyer", recipientPhone: "0900000000", addressLine: "1 Test Street",
    provinceCode: "1000001", provinceName: "Ho Chi Minh City", wardCode: "1003646", wardName: "Sandbox Ward One", districtCode: "1444", country: "VN",
};
export const deliveryCheckout = { shippingQuoteId: "11111111-1111-4111-8111-111111111111", deliveryAddress };
