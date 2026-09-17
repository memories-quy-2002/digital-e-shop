import http from "../../lib/http";
import { normalizeProductWithAttributes, type ProductWithAttributes } from "../products/api";
import type { AdminOrder, AdminOrderDetail, AdminOrderItem, AdminCustomerProfile } from "../../types/order";
import type { DashboardRange } from "./utils/dashboardRange";

const ADMIN_PAGE_LIMIT = 100;

const fetchAllPages = async <T>(
    path: string,
    collectionKey: string,
    limit = ADMIN_PAGE_LIMIT,
): Promise<T[]> => {
    const rows: T[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
        const response = await http.get(`${path}?page=${page}&limit=${limit}`);
        const pageRows = response.data?.[collectionKey];
        if (Array.isArray(pageRows)) rows.push(...pageRows);
        const totalPages = Number(response.data?.pagination?.totalPages) || page;
        hasMore = page < totalPages;
        page += 1;
    }

    return rows;
};

export async function fetchAnalyticsSummary(range: DashboardRange = "30d"): Promise<any> {
    const response = await http.get("/api/analytics/summary", { params: { range } });
    return response.data;
}

export async function fetchAdminProducts(page = 1, limit = 60): Promise<ProductWithAttributes[]> {
    const response = await http.get(`/api/products?page=${page}&limit=${limit}`);
    return (response.data.products || []).map(normalizeProductWithAttributes);
}

export async function fetchAllProducts(): Promise<ProductWithAttributes[]> {
    const products = await fetchAllPages<unknown>("/api/products", "products");
    return products.map(normalizeProductWithAttributes);
}

export async function fetchAdminOrders(page = 1, limit = 80): Promise<AdminOrder[]> {
    const response = await http.get(`/api/orders?page=${page}&limit=${limit}`);
    return response.data.orders || [];
}

export async function fetchAllOrders(): Promise<AdminOrder[]> {
    return fetchAllPages<AdminOrder>("/api/orders", "orders");
}

export async function fetchAdminUsers(page = 1, limit = 80): Promise<any[]> {
    const response = await http.get(`/api/users?page=${page}&limit=${limit}`);
    return response.data.accounts || [];
}

export async function fetchAllUsers(): Promise<any[]> {
    return fetchAllPages<any>("/api/users", "accounts");
}

export async function fetchOrderItems(page = 1, limit = ADMIN_PAGE_LIMIT): Promise<AdminOrderItem[]> {
    const items: AdminOrderItem[] = [];
    let currentPage = page;
    let hasMore = true;

    while (hasMore) {
        const response = await http.get(`/api/orders/item?page=${currentPage}&limit=${limit}`);
        const pageItems = response.data.orderItems ?? response.data.order_items ?? [];
        if (Array.isArray(pageItems)) items.push(...pageItems);
        const totalPages = Number(response.data.pagination?.totalPages) || currentPage;
        hasMore = currentPage < totalPages;
        currentPage += 1;
    }

    return items;
}

export async function updateProduct(
    productId: number,
    data: Record<string, unknown>,
): Promise<ProductWithAttributes> {
    const response = await http.put(`/api/products/${productId}`, data);
    return normalizeProductWithAttributes(response.data.product);
}

export async function deleteProduct(productId: number): Promise<void> {
    await http.delete("/api/products/", { data: { pid: productId } });
}

export async function updateProductInventory(productId: number, stock: number): Promise<ProductWithAttributes> {
    const response = await http.put(`/api/products/${productId}/inventory`, { stock });
    return normalizeProductWithAttributes(response.data.product);
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

export type AdminAlert = {
    id: string;
    type: "order" | "payment" | "inventory" | "support" | "customer";
    title: string;
    description: string;
    createdAt: string;
    priority: "High" | "Medium" | "Low";
    actionLabel: string;
    route: string;
    unread: boolean;
};

export async function fetchAdminAlerts(): Promise<{ alerts: AdminAlert[]; unread: number }> {
    const response = await http.get("/api/admin/alerts");
    return { alerts: response.data.alerts || [], unread: Number(response.data.unread || 0) };
}

export type PaymentReconciliationStatus =
    | "PENDING"
    | "MATCHED"
    | "MISMATCH"
    | "UNAVAILABLE"
    | "MANUAL_CONFIRMED";

export type PaymentReconciliationCandidate = {
    targetType: "pending_checkout" | "order_payment";
    targetId: number;
    provider: "cash" | "payos" | string;
    localStatus: string;
    reconciliationStatus: PaymentReconciliationStatus | string;
    providerReference: string | null;
    providerOrderCode: number | null;
    expectedAmount: number | null;
    expectedCurrency: string | null;
    providerAmount: number | null;
    providerCurrency: string | null;
    providerStatus: string | null;
    lastEventStatus: string | null;
    lastEventAt: string | null;
    mismatchReason: string | null;
    reservationExpiresAt: string | null;
    orderId: number | null;
};

export type PaymentReconciliationPagination = {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
};

export type PaymentReconciliationPage = {
    candidates: PaymentReconciliationCandidate[];
    pagination: PaymentReconciliationPagination;
};

export type PaymentReconciliationResult = {
    targetType: "pending_checkout" | "order_payment" | string;
    targetId: number;
    paymentId?: number;
    outcome: string;
    error?: string;
};

export type PaymentWebhookEvent = {
    id: number;
    provider: string;
    eventKey: string;
    eventType: string;
    payloadHash: string;
    normalizedPayload: unknown;
    orderCode: number | null;
    paymentLinkId: string | null;
    amount: number | null;
    currency: string | null;
    status: string;
    attemptCount: number;
    lastError: string | null;
    receivedAt: string | null;
    processedAt: string | null;
    createdAt: string | null;
    updatedAt: string | null;
};

type PaymentReconciliationFilters = {
    provider?: "cash" | "payos";
    reconciliationStatus?: PaymentReconciliationStatus;
    page?: number;
    limit?: number;
};

const numberOrNull = (value: unknown): number | null => {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

const stringOrNull = (value: unknown): string | null => {
    if (value === null || value === undefined || value === "") return null;
    return String(value);
};

const normalizePaymentCandidate = (candidate: Record<string, unknown>): PaymentReconciliationCandidate => ({
    targetType: candidate.targetType === "order_payment" || candidate.target_type === "order_payment"
        ? "order_payment"
        : "pending_checkout",
    targetId: numberOrNull(candidate.targetId ?? candidate.target_id) || 0,
    provider: String(candidate.provider || "unknown"),
    localStatus: String(candidate.localStatus ?? candidate.local_status ?? "UNKNOWN"),
    reconciliationStatus: String(candidate.reconciliationStatus ?? candidate.reconciliation_status ?? "PENDING"),
    providerReference: stringOrNull(candidate.providerReference ?? candidate.provider_reference),
    providerOrderCode: numberOrNull(candidate.providerOrderCode ?? candidate.provider_order_code),
    expectedAmount: numberOrNull(candidate.expectedAmount ?? candidate.payment_amount),
    expectedCurrency: stringOrNull(candidate.expectedCurrency ?? candidate.payment_currency),
    providerAmount: numberOrNull(candidate.providerAmount ?? candidate.provider_amount),
    providerCurrency: stringOrNull(candidate.providerCurrency ?? candidate.provider_currency),
    providerStatus: stringOrNull(candidate.providerStatus ?? candidate.provider_status),
    lastEventStatus: stringOrNull(candidate.lastEventStatus ?? candidate.last_event_status),
    lastEventAt: stringOrNull(candidate.lastEventAt ?? candidate.last_event_at),
    mismatchReason: stringOrNull(candidate.mismatchReason ?? candidate.mismatch_reason ?? candidate.last_reconciliation_error),
    reservationExpiresAt: stringOrNull(candidate.reservationExpiresAt ?? candidate.reservation_expires_at),
    orderId: numberOrNull(candidate.orderId ?? candidate.order_id),
});

const normalizePagination = (pagination: Record<string, unknown> | undefined, page: number, limit: number): PaymentReconciliationPagination => ({
    page: numberOrNull(pagination?.page) || page,
    limit: numberOrNull(pagination?.limit) || limit,
    total: numberOrNull(pagination?.total) || 0,
    totalPages: numberOrNull(pagination?.totalPages) || 0,
});

export async function fetchPaymentReconciliationCandidates(
    filters: PaymentReconciliationFilters = {},
): Promise<PaymentReconciliationPage> {
    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const params = {
        page,
        limit,
        ...(filters.provider ? { provider: filters.provider } : {}),
        ...(filters.reconciliationStatus ? { reconciliationStatus: filters.reconciliationStatus } : {}),
    };
    const response = await http.get("/api/admin/payments/reconciliation", { params });
    const candidates = Array.isArray(response.data?.candidates)
        ? response.data.candidates.map((candidate: Record<string, unknown>) => normalizePaymentCandidate(candidate))
        : [];
    return {
        candidates,
        pagination: normalizePagination(response.data?.pagination, page, limit),
    };
}

export async function runPaymentReconciliation(limit = 100): Promise<{ results: PaymentReconciliationResult[]; limit: number }> {
    const response = await http.post("/api/admin/payments/reconciliation/run", { limit });
    return {
        results: Array.isArray(response.data?.results)
            ? response.data.results.map((result: Record<string, unknown>) => ({
                targetType: String(result.targetType || "unknown") as PaymentReconciliationResult["targetType"],
                targetId: numberOrNull(result.targetId) || 0,
                paymentId: numberOrNull(result.paymentId) || undefined,
                outcome: String(result.outcome || "UNKNOWN"),
                error: stringOrNull(result.error) || undefined,
            }))
            : [],
        limit: numberOrNull(response.data?.limit) || limit,
    };
}

export async function reconcileAdminPayment(paymentId: number): Promise<PaymentReconciliationResult> {
    const response = await http.post(`/api/admin/payments/${paymentId}/reconcile`);
    const result = response.data?.result || {};
    return {
        targetType: String(result.targetType || "order_payment") as PaymentReconciliationResult["targetType"],
        targetId: numberOrNull(result.targetId) || paymentId,
        paymentId: numberOrNull(result.paymentId) || paymentId,
        outcome: String(result.outcome || "UNKNOWN"),
        error: stringOrNull(result.error) || undefined,
    };
}

export async function confirmAdminCodPayment(paymentId: number, note?: string): Promise<Record<string, unknown> | null> {
    const trimmedNote = note?.trim();
    const response = await http.post(
        `/api/admin/payments/${paymentId}/confirm-cod`,
        trimmedNote ? { note: trimmedNote } : {},
    );
    return response.data?.payment || null;
}

export async function fetchPaymentWebhookEvents(paymentId: number): Promise<PaymentWebhookEvent[]> {
    const response = await http.get(`/api/admin/payments/${paymentId}/webhook-events`);
    const events = Array.isArray(response.data?.events) ? response.data.events : [];
    return events.map((event: Record<string, unknown>) => ({
        id: numberOrNull(event.id) || 0,
        provider: String(event.provider || "unknown"),
        eventKey: String(event.eventKey ?? event.event_key ?? ""),
        eventType: String(event.eventType ?? event.event_type ?? "UNKNOWN"),
        payloadHash: String(event.payloadHash ?? event.payload_hash ?? ""),
        normalizedPayload: event.normalizedPayload ?? event.normalized_payload ?? null,
        orderCode: numberOrNull(event.orderCode ?? event.order_code),
        paymentLinkId: stringOrNull(event.paymentLinkId ?? event.payment_link_id),
        amount: numberOrNull(event.amount),
        currency: stringOrNull(event.currency),
        status: String(event.status || "UNKNOWN"),
        attemptCount: numberOrNull(event.attemptCount ?? event.attempt_count) || 0,
        lastError: stringOrNull(event.lastError ?? event.last_error),
        receivedAt: stringOrNull(event.receivedAt ?? event.received_at),
        processedAt: stringOrNull(event.processedAt ?? event.processed_at),
        createdAt: stringOrNull(event.createdAt ?? event.created_at),
        updatedAt: stringOrNull(event.updatedAt ?? event.updated_at),
    }));
}
