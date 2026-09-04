import http from "../../lib/http";
import type { CustomerOrder, CustomerOrderDetail } from "./types";

export type { CustomerOrder, CustomerOrderDetail } from "./types";

export async function fetchCustomerOrders(uid: string): Promise<CustomerOrder[]> {
    const response = await http.get(`/api/orders/user/${uid}`);
    return response.data.orders || [];
}

export async function fetchCustomerOrderDetail(orderId: number): Promise<CustomerOrderDetail | null> {
    const response = await http.get(`/api/orders/${orderId}`);
    return response.data.order || null;
}

export async function addItemsToCustomerCart(
    uid: string,
    items: Array<{ productId: number; quantity: number; stock: number }>,
): Promise<void> {
    await Promise.all(
        items.map((item) =>
            http.post("/api/cart/", {
                uid,
                pid: item.productId,
                quantity: Math.min(item.quantity, item.stock),
            }),
        ),
    );
}
