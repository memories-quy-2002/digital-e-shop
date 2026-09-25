import http from "../../lib/http";
import { AFTER_SALES_PAGINATION } from "./constants";
import type { AfterSalesCreateInput, AfterSalesListPage, AfterSalesListQuery, AfterSalesRequest, GuestAfterSalesCreateInput } from "./types";

const normalizeQuery = (query: AfterSalesListQuery = {}) => ({ page: query.page || AFTER_SALES_PAGINATION.FIRST_PAGE, limit: Math.min(query.limit || AFTER_SALES_PAGINATION.DEFAULT_PAGE_SIZE, AFTER_SALES_PAGINATION.MAX_PAGE_SIZE), ...(query.status ? { status: query.status } : {}), ...(query.kind ? { kind: query.kind } : {}) });

export async function fetchCustomerAfterSalesRequests(query: AfterSalesListQuery = {}): Promise<AfterSalesListPage> {
    const response = await http.get("/api/after-sales/requests", { params: normalizeQuery(query) });
    return response.data as AfterSalesListPage;
}

export async function createCustomerAfterSalesRequest(input: AfterSalesCreateInput): Promise<AfterSalesRequest> {
    const response = await http.post("/api/after-sales/requests", input);
    return response.data.request as AfterSalesRequest;
}

export async function fetchCustomerAfterSalesRequest(id: number): Promise<AfterSalesRequest> {
    const response = await http.get(`/api/after-sales/requests/${id}`);
    return response.data.request as AfterSalesRequest;
}

export async function createGuestAfterSalesRequest(input: GuestAfterSalesCreateInput): Promise<AfterSalesRequest> {
    const response = await http.post("/api/orders/guest/after-sales/requests", input);
    return response.data.request as AfterSalesRequest;
}

export async function fetchGuestAfterSalesRequests(orderId: number, guestOrderToken: string, query: AfterSalesListQuery = {}): Promise<AfterSalesListPage> {
    const response = await http.post("/api/orders/guest/after-sales/requests/lookup", { orderId, guestOrderToken, ...normalizeQuery(query) });
    return response.data as AfterSalesListPage;
}

export async function fetchGuestAfterSalesRequest(orderId: number, guestOrderToken: string, requestId: number): Promise<AfterSalesRequest> {
    const response = await http.post(`/api/orders/guest/after-sales/requests/${requestId}/lookup`, { orderId, guestOrderToken });
    return response.data.request as AfterSalesRequest;
}

export async function fetchAdminAfterSalesRequests(query: AfterSalesListQuery = {}): Promise<AfterSalesListPage> {
    const response = await http.get("/api/admin/after-sales/requests", { params: normalizeQuery(query) });
    return response.data as AfterSalesListPage;
}

export async function fetchAdminAfterSalesRequest(id: number): Promise<AfterSalesRequest> {
    const response = await http.get(`/api/admin/after-sales/requests/${id}`);
    return response.data.request as AfterSalesRequest;
}

export async function transitionAdminAfterSalesRequest(id: number, status: AfterSalesRequest["status"], note?: string): Promise<AfterSalesRequest> {
    const response = await http.patch(`/api/admin/after-sales/requests/${id}/status`, { status, ...(note ? { note } : {}) });
    return response.data.request as AfterSalesRequest;
}

export async function confirmAdminAfterSalesRefund(id: number, input: { refundReference: string; currency: string; idempotencyKey: string; note?: string }): Promise<AfterSalesRequest> {
    const response = await http.post(`/api/admin/after-sales/requests/${id}/refund`, input);
    return response.data.request as AfterSalesRequest;
}
