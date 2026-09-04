import http from "../../lib/http";
import type {
    CustomerAddress,
    CustomerAddressPayload,
    CustomerIdentity,
    CustomerNotification,
} from "./types";

export type {
    CustomerAddress,
    CustomerAddressPayload,
    CustomerIdentity,
    CustomerNotification,
} from "./types";

export async function fetchCurrentCustomer(): Promise<CustomerIdentity | null> {
    const response = await http.get("/api/users/me", { withCredentials: true });
    return response.data.userData || null;
}

export async function fetchCustomerAddresses(uid: string): Promise<CustomerAddress[]> {
    const response = await http.get(`/api/users/${uid}/addresses`);
    return response.data.addresses || [];
}

export async function createCustomerAddress(uid: string, payload: CustomerAddressPayload): Promise<CustomerAddress> {
    const response = await http.post(`/api/users/${uid}/addresses`, payload);
    return response.data.address;
}

export async function updateCustomerAddress(
    uid: string,
    addressId: number,
    payload: CustomerAddressPayload,
): Promise<CustomerAddress> {
    const response = await http.put(`/api/users/${uid}/addresses/${addressId}`, payload);
    return response.data.address;
}

export async function deleteCustomerAddress(uid: string, addressId: number): Promise<void> {
    await http.delete(`/api/users/${uid}/addresses/${addressId}`);
}

export async function fetchCustomerNotifications(
    uid: string,
    limit = 50,
): Promise<{ notifications: CustomerNotification[]; unread: number }> {
    const response = await http.get(`/api/users/${uid}/notifications?limit=${limit}`);
    return {
        notifications: response.data.notifications || [],
        unread: Number(response.data.unread) || 0,
    };
}

export async function markAllCustomerNotificationsRead(uid: string): Promise<void> {
    await http.post(`/api/users/${uid}/notifications/read-all`);
}
