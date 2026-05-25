import axios from "./axios";

export type CustomerIdentity = {
    id: string;
    email: string;
    username: string;
    first_name: string | null;
    last_name: string | null;
    role: string;
    created_at: string;
    last_login: string;
};

export type CustomerOrder = {
    id: number;
    date_added: string;
    status: number;
    total_price: number;
    discount: number;
    shipping_address: string;
    payment_method?: "bank_transfer" | "cash";
};

export type CustomerOrderItem = {
    productId: number;
    productName: string;
    brand: string;
    category: string;
    price: number;
    sale_price: number | null;
    stock: number;
    quantity: number;
    totalPrice: number;
};

export type CustomerOrderTimelineEvent = {
    id: number;
    label: string;
    note: string | null;
    created_at: string | null;
    status: number;
};

export type CustomerOrderDetail = CustomerOrder & {
    items: CustomerOrderItem[];
    timeline?: CustomerOrderTimelineEvent[];
};

export type CustomerAddress = {
    id: number;
    label: string;
    recipient_name: string | null;
    phone_number: string | null;
    address_line: string;
    city: string | null;
    country: string | null;
    is_default: boolean;
};

export type CustomerAddressPayload = {
    label: string;
    recipientName: string;
    phoneNumber: string;
    addressLine: string;
    city: string;
    country: string;
    isDefault: boolean;
};

export type CustomerNotification = {
    id: number;
    type: string;
    title: string;
    message: string;
    link: string | null;
    read_at: string | null;
    created_at: string;
    is_read: boolean;
};

export async function fetchCurrentCustomer(): Promise<CustomerIdentity | null> {
    const response = await axios.get("/api/users/me", { withCredentials: true });
    return response.data.userData || null;
}

export async function fetchCustomerOrders(uid: string): Promise<CustomerOrder[]> {
    const response = await axios.get(`/api/orders/user/${uid}`);
    return response.data.orders || [];
}

export async function fetchCustomerOrderDetail(orderId: number): Promise<CustomerOrderDetail | null> {
    const response = await axios.get(`/api/orders/${orderId}`);
    return response.data.order || null;
}

export async function addItemsToCustomerCart(
    uid: string,
    items: Array<{ productId: number; quantity: number; stock: number }>
): Promise<void> {
    await Promise.all(
        items.map((item) =>
            axios.post("/api/cart/", {
                uid,
                pid: item.productId,
                quantity: Math.min(item.quantity, item.stock),
            })
        )
    );
}

export async function fetchCustomerAddresses(uid: string): Promise<CustomerAddress[]> {
    const response = await axios.get(`/api/users/${uid}/addresses`);
    return response.data.addresses || [];
}

export async function createCustomerAddress(uid: string, payload: CustomerAddressPayload): Promise<CustomerAddress> {
    const response = await axios.post(`/api/users/${uid}/addresses`, payload);
    return response.data.address;
}

export async function updateCustomerAddress(
    uid: string,
    addressId: number,
    payload: CustomerAddressPayload
): Promise<CustomerAddress> {
    const response = await axios.put(`/api/users/${uid}/addresses/${addressId}`, payload);
    return response.data.address;
}

export async function deleteCustomerAddress(uid: string, addressId: number): Promise<void> {
    await axios.delete(`/api/users/${uid}/addresses/${addressId}`);
}

export async function fetchCustomerNotifications(uid: string, limit = 50): Promise<{ notifications: CustomerNotification[]; unread: number }> {
    const response = await axios.get(`/api/users/${uid}/notifications?limit=${limit}`);
    return {
        notifications: response.data.notifications || [],
        unread: Number(response.data.unread) || 0,
    };
}

export async function markAllCustomerNotificationsRead(uid: string): Promise<void> {
    await axios.post(`/api/users/${uid}/notifications/read-all`);
}
