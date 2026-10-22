import http from "../../../lib/http";
import type {
    AdminListPage,
    AdminListPagination,
    PurchaseOrder,
    PurchaseOrderInput,
    PurchaseReceipt,
    ReceiptLineInput,
    StockCount,
    Supplier,
    SupplierInput,
} from "./types";

const DEFAULT_PAGE_SIZE = 25;

const paginationFrom = (value: Record<string, unknown> | undefined, page: number, limit: number): AdminListPagination => ({
    page: Number(value?.page) || page,
    limit: Number(value?.limit) || limit,
    total: Number(value?.total) || 0,
    totalPages: Number(value?.totalPages) || 0,
});

async function fetchPage<T>(path: string, key: string, query: { page?: number; limit?: number; search?: string; status?: string; supplierId?: number }): Promise<AdminListPage<T>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const response = await http.get(path, { params: { ...query, page, limit } });
    const data = response.data as Record<string, unknown>;
    return {
        items: Array.isArray(data[key]) ? data[key] as T[] : [],
        pagination: paginationFrom(data.pagination as Record<string, unknown> | undefined, page, limit),
    };
}

const unwrap = <T>(data: Record<string, unknown>, key: string): T => data[key] as T;

export const fetchSuppliers = (query: { page?: number; limit?: number; search?: string; status?: "active" | "archived" | "all" } = {}) =>
    fetchPage<Supplier>("/api/admin/suppliers", "suppliers", query);

export async function createSupplier(input: SupplierInput): Promise<Supplier> {
    const response = await http.post("/api/admin/suppliers", input);
    return unwrap<Supplier>(response.data, "supplier");
}

export async function updateSupplier(id: number, input: Partial<SupplierInput> & { version: number }): Promise<Supplier> {
    const response = await http.patch(`/api/admin/suppliers/${id}`, input);
    return unwrap<Supplier>(response.data, "supplier");
}

export async function archiveSupplier(id: number, input: { version: number; reason: string }): Promise<Supplier> {
    const response = await http.post(`/api/admin/suppliers/${id}/archive`, input);
    return unwrap<Supplier>(response.data, "supplier");
}

export const fetchPurchaseOrders = (query: { page?: number; limit?: number; search?: string; status?: string } = {}) =>
    fetchPage<PurchaseOrder>("/api/admin/purchase-orders", "orders", query);

export async function fetchPurchaseOrder(id: number): Promise<PurchaseOrder> {
    const response = await http.get(`/api/admin/purchase-orders/${id}`);
    return unwrap<PurchaseOrder>(response.data, "order");
}

export async function createPurchaseOrder(input: PurchaseOrderInput): Promise<PurchaseOrder> {
    const response = await http.post("/api/admin/purchase-orders", input);
    return unwrap<PurchaseOrder>(response.data, "order");
}

export async function updatePurchaseOrder(id: number, input: PurchaseOrderInput & { version: number }): Promise<PurchaseOrder> {
    const response = await http.patch(`/api/admin/purchase-orders/${id}`, input);
    return unwrap<PurchaseOrder>(response.data, "order");
}

export async function transitionPurchaseOrder(id: number, action: "confirm" | "cancel" | "close", input: { version: number; reason?: string }): Promise<PurchaseOrder> {
    const response = await http.post(`/api/admin/purchase-orders/${id}/${action}`, input);
    return unwrap<PurchaseOrder>(response.data, "order");
}

export const fetchPurchaseReceipts = (orderId: number, query: { page?: number; limit?: number } = {}) =>
    fetchPage<PurchaseReceipt>(`/api/admin/purchase-orders/${orderId}/receipts`, "receipts", query);

export async function postPurchaseReceipt(orderId: number, input: { idempotencyKey: string; note?: string; lines: ReceiptLineInput[] }): Promise<PurchaseReceipt> {
    const response = await http.post(`/api/admin/purchase-orders/${orderId}/receipts`, input);
    return unwrap<PurchaseReceipt>(response.data, "receipt");
}

export const fetchStockCounts = (query: { page?: number; limit?: number; status?: string } = {}) =>
    fetchPage<StockCount>("/api/admin/stock-counts", "counts", query);

export async function fetchStockCount(id: number): Promise<StockCount> {
    const response = await http.get(`/api/admin/stock-counts/${id}`);
    return unwrap<StockCount>(response.data, "count");
}

export async function createStockCount(input: { productIds: number[]; note?: string }): Promise<StockCount> {
    const response = await http.post("/api/admin/stock-counts", input);
    return unwrap<StockCount>(response.data, "count");
}

export async function updateStockCount(id: number, input: { version: number; observations: Array<{ itemId: number; countedQuantity: number; reason?: string }> }): Promise<StockCount> {
    const response = await http.patch(`/api/admin/stock-counts/${id}`, input);
    return unwrap<StockCount>(response.data, "count");
}

export async function transitionStockCount(id: number, action: "submit" | "reopen" | "approve" | "cancel", input: { version: number; itemIds?: number[]; reason?: string }): Promise<StockCount> {
    const response = await http.post(`/api/admin/stock-counts/${id}/${action}`, input);
    return unwrap<StockCount>(response.data, "count");
}
