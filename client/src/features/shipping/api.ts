import http from "../../lib/http";
import type {
    DeliveryMapConfig,
    DeliveryAddress,
    FulfillmentOrder,
    ShipmentSummary,
    ShippingParcel,
    InternalDeliveryQuote,
} from "./types";

export async function fetchDeliveryMapConfig(): Promise<DeliveryMapConfig | null> {
    const response = await http.get("/api/shipping/delivery/map-config");
    return response.data.map ?? null;
}

export async function requestInternalDeliveryQuote(input: {
    address: DeliveryAddress;
    locale?: "en" | "vi";
    discountCode?: string;
    cart?: Array<{ productId: number; quantity: number }>;
}, guest = false): Promise<InternalDeliveryQuote> {
    const url = guest ? "/api/shipping/guest/quotes" : "/api/shipping/quotes";
    const response = await http.post(url, input);
    return response.data as InternalDeliveryQuote;
}

export async function fetchCustomerShipment(orderId: number): Promise<ShipmentSummary | null> {
    const response = await http.get(`/api/shipping/orders/${orderId}`);
    return response.data.shipment ?? null;
}

export async function fetchGuestShipment(orderId: number, guestOrderToken: string): Promise<ShipmentSummary | null> {
    const response = await http.post("/api/shipping/guest/shipment", { orderId, guestOrderToken });
    return response.data.shipment ?? null;
}

export async function fetchFulfillmentOrders(): Promise<FulfillmentOrder[]> {
    const response = await http.get("/api/admin/shipping");
    return Array.isArray(response.data) ? response.data : response.data.orders || [];
}

export async function fetchFulfillmentOrder(orderId: number): Promise<ShipmentSummary> {
    const response = await http.get(`/api/admin/shipping/${orderId}`);
    return response.data;
}

export async function transitionFulfillment(orderId: number, state: "CONFIRMED" | "PICKING" | "PACKED" | "READY_TO_SHIP") {
    return (await http.post(`/api/admin/shipping/${orderId}/transition`, { state })).data;
}

export async function createFulfillmentShipment(orderId: number, key: string) {
    return (await http.post(`/api/admin/shipping/${orderId}/create`, { key })).data;
}

export async function fetchFulfillmentLabel(orderId: number): Promise<{ token: string; expiresAt: string }> {
    return (await http.post(`/api/admin/shipping/${orderId}/label`, {})).data;
}

export async function confirmReturnedShipment(orderId: number) {
    return (await http.post(`/api/admin/shipping/${orderId}/receive-return`, {})).data;
}

export async function saveProductParcel(productId: number, parcel: ShippingParcel): Promise<ShippingParcel> {
    const response = await http.put(`/api/shipping/admin/products/${productId}/parcel`, parcel);
    return response.data.parcel as ShippingParcel;
}
