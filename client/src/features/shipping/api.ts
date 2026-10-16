import http from "../../lib/http";
import type {
    DeliveryMapConfig,
    DeliveryAddress,
    FulfillmentOrder,
    ShipmentSummary,
    InternalDeliveryQuote,
    DeliveryAssignment,
    DeliverySettings,
    DeliverySettingsConfig,
    DeliveryStaffMember,
    AssignableDeliveryOrder,
    DeliveryStatus,
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

export async function fetchAdminDeliverySettings(): Promise<DeliverySettingsConfig> {
    const response = await http.get("/api/admin/delivery/settings");
    return response.data as DeliverySettingsConfig;
}

export async function updateAdminDeliverySettings(input: Omit<DeliverySettings, "version">): Promise<DeliverySettings> {
    const response = await http.put("/api/admin/delivery/settings", input);
    return response.data.settings as DeliverySettings;
}

export async function fetchAssignableDeliveryOrders(): Promise<AssignableDeliveryOrder[]> {
    const response = await http.get("/api/admin/delivery/assignable-orders");
    return Array.isArray(response.data.orders) ? response.data.orders : [];
}

export async function fetchDeliveryStaff(): Promise<DeliveryStaffMember[]> {
    const response = await http.get("/api/admin/delivery/staff");
    return Array.isArray(response.data.staff) ? response.data.staff : [];
}

export async function fetchDeliveryAssignmentHistory(orderId: number): Promise<DeliveryAssignment[]> {
    const response = await http.get(`/api/admin/delivery/orders/${orderId}`);
    return Array.isArray(response.data.assignments) ? response.data.assignments : [];
}

export async function assignDeliveryOrder(orderId: number, input: {
    employeeId: string;
    scheduledStartAt: string;
    scheduledEndAt: string;
}): Promise<DeliveryAssignment> {
    const response = await http.post(`/api/admin/delivery/orders/${orderId}/assignments`, input);
    return response.data as DeliveryAssignment;
}

export async function fetchDeliveryStaffAssignments(): Promise<DeliveryAssignment[]> {
    const response = await http.get("/api/delivery/staff/assignments");
    return Array.isArray(response.data.assignments) ? response.data.assignments : [];
}

export async function updateDeliveryStaffAssignment(assignmentId: number, input: {
    status: Exclude<DeliveryStatus, "ASSIGNED">;
    failureReason?: string;
}): Promise<DeliveryAssignment> {
    const response = await http.post(`/api/delivery/staff/assignments/${assignmentId}/status`, input);
    return response.data as DeliveryAssignment;
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
