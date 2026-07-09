import http from "../../lib/http";
import type { Product } from "../../types/product";
import type { AdminOrder, AdminOrderDetail, AdminOrderItem, AdminCustomerProfile } from "../../types/order";

export async function fetchAnalyticsSummary(): Promise<any> {
    const response = await http.get("/api/analytics/summary");
    return response.data;
}

export async function fetchAdminProducts(page = 1, limit = 60): Promise<Product[]> {
    const response = await http.get(`/api/products?page=${page}&limit=${limit}`);
    return response.data.products || [];
}

export async function fetchAllProducts(): Promise<Product[]> {
    const response = await http.get("/api/products");
    return response.data.products || [];
}

export async function fetchAdminOrders(page = 1, limit = 80): Promise<AdminOrder[]> {
    const response = await http.get(`/api/orders?page=${page}&limit=${limit}`);
    return response.data.orders || [];
}

export async function fetchAllOrders(): Promise<any[]> {
    const response = await http.get("/api/orders");
    return response.data.orders || [];
}

export async function fetchAdminUsers(page = 1, limit = 80): Promise<any[]> {
    const response = await http.get(`/api/users?page=${page}&limit=${limit}`);
    return response.data.accounts || [];
}

export async function fetchAllUsers(): Promise<any[]> {
    const response = await http.get("/api/users");
    return response.data.accounts || [];
}

export async function fetchOrderItems(page = 1, limit = 120): Promise<AdminOrderItem[]> {
    const response = await http.get(`/api/orders/item?page=${page}&limit=${limit}`);
    return response.data.orderItems ?? response.data.order_items ?? [];
}

export async function updateProduct(
    productId: number,
    data: Record<string, unknown>,
): Promise<Product> {
    const response = await http.put(`/api/products/${productId}`, data);
    return response.data.product;
}

export async function deleteProduct(productId: number): Promise<void> {
    await http.delete("/api/products/", { data: { pid: productId } });
}

export async function updateProductInventory(productId: number, stock: number): Promise<Product> {
    const response = await http.put(`/api/products/${productId}/inventory`, { stock });
    return response.data.product;
}

export async function fetchInventoryMovements(limit = 12): Promise<any[]> {
    const response = await http.get(`/api/products/admin/inventory-movements?limit=${limit}`);
    return response.data.movements || [];
}

export async function uploadBlob(file: File): Promise<string> {
    const formData = new FormData();
    formData.append("file", file);
    const response = await http.post("/api/blob/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
    });
    return response.data?.url || "";
}

export async function addProduct(formData: FormData): Promise<void> {
    await http.post("/api/products/add", formData, {
        headers: { "Content-Type": "multipart/form-data" },
    });
}

export async function fetchOrderDetail(orderId: number): Promise<AdminOrderDetail | null> {
    const response = await http.get(`/api/orders/${orderId}`);
    return response.data.order || null;
}

export async function updateOrderStatus(orderId: number, status: number): Promise<AdminOrder> {
    const response = await http.post(`/api/orders/status/${orderId}`, { status });
    return response.data.order;
}

export type BulkUpdateResult = {
    orderId: number;
    status: "fulfilled" | "rejected";
    error?: string;
    order?: AdminOrder;
};

export async function bulkUpdateOrderStatus(
    orderIds: number[],
    status: number,
): Promise<BulkUpdateResult[]> {
    const settled = await Promise.allSettled(orderIds.map((id) => updateOrderStatus(id, status)));
    return settled.map((result, index) => {
        if (result.status === "fulfilled") {
            return { orderId: orderIds[index], status: "fulfilled", order: result.value };
        }
        const reason = result.reason;
        const message =
            reason && typeof reason === "object" && "message" in reason
                ? String((reason as { message?: string }).message)
                : "Request failed";
        return { orderId: orderIds[index], status: "rejected", error: message };
    });
}

export async function updateAccount(
    userId: string,
    data: { role?: string; status?: string },
): Promise<any> {
    const response = await http.put(`/api/users/${userId}`, data);
    return response.data;
}

export async function fetchCustomerProfile(userId: string): Promise<AdminCustomerProfile | null> {
    const response = await http.get(`/api/users/${userId}/profile`);
    return response.data.profile || null;
}

export async function fetchPromotions(): Promise<any[]> {
    const response = await http.get("/api/promotions");
    return response.data.promotions || [];
}

export async function createPromotion(data: Record<string, unknown>): Promise<void> {
    await http.post("/api/promotions", data);
}

export async function updatePromotion(id: number, data: Record<string, unknown>): Promise<void> {
    await http.put(`/api/promotions/${id}`, data);
}

export async function deletePromotion(id: number): Promise<void> {
    await http.delete(`/api/promotions/${id}`);
}
