import http from "../../lib/http";
import { AFTER_SALES_PAGINATION } from "./constants";
import type { PublicIdentifier } from "../../types/publicIdentifier";
import type { AfterSalesCreateInput, AfterSalesListPage, AfterSalesListQuery, AfterSalesRequest, GuestAfterSalesCreateInput, ManualRefundInput } from "./types";

const normalizeQuery = (query: AfterSalesListQuery = {}) => ({ page: query.page || AFTER_SALES_PAGINATION.FIRST_PAGE, limit: Math.min(query.limit || AFTER_SALES_PAGINATION.DEFAULT_PAGE_SIZE, AFTER_SALES_PAGINATION.MAX_PAGE_SIZE), ...(query.status ? { status: query.status } : {}), ...(query.kind ? { kind: query.kind } : {}) });

export async function fetchCustomerAfterSalesRequests(query: AfterSalesListQuery = {}): Promise<AfterSalesListPage> {
    const response = await http.get("/api/after-sales/requests", { params: normalizeQuery(query) });
    return response.data as AfterSalesListPage;
}

export async function createCustomerAfterSalesRequest(input: AfterSalesCreateInput): Promise<AfterSalesRequest> {
    const response = await http.post("/api/after-sales/requests", input);
    return response.data.request as AfterSalesRequest;
}

export async function fetchCustomerAfterSalesRequest(id: PublicIdentifier): Promise<AfterSalesRequest> {
    const response = await http.get(`/api/after-sales/requests/${encodeURIComponent(id)}`);
    return response.data.request as AfterSalesRequest;
}

export async function createGuestAfterSalesRequest(input: GuestAfterSalesCreateInput): Promise<AfterSalesRequest> {
    const response = await http.post("/api/orders/guest/after-sales/requests", input);
    return response.data.request as AfterSalesRequest;
}

export async function fetchGuestAfterSalesRequests(orderId: PublicIdentifier, guestOrderToken: string, query: AfterSalesListQuery = {}): Promise<AfterSalesListPage> {
    const response = await http.post("/api/orders/guest/after-sales/requests/lookup", { orderId, guestOrderToken, ...normalizeQuery(query) });
    return response.data as AfterSalesListPage;
}

export async function fetchGuestAfterSalesRequest(orderId: PublicIdentifier, guestOrderToken: string, requestId: PublicIdentifier): Promise<AfterSalesRequest> {
    const response = await http.post(`/api/orders/guest/after-sales/requests/${encodeURIComponent(requestId)}/lookup`, { orderId, guestOrderToken });
    return response.data.request as AfterSalesRequest;
}

export async function fetchAdminAfterSalesRequests(query: AfterSalesListQuery = {}): Promise<AfterSalesListPage> {
    const response = await http.get("/api/admin/after-sales/requests", { params: normalizeQuery(query) });
    return response.data as AfterSalesListPage;
}

export async function fetchAdminAfterSalesRequest(id: PublicIdentifier): Promise<AfterSalesRequest> {
    const response = await http.get(`/api/admin/after-sales/requests/${encodeURIComponent(id)}`);
    return response.data.request as AfterSalesRequest;
}

export async function transitionAdminAfterSalesRequest(id: PublicIdentifier, status: AfterSalesRequest["status"], note?: string): Promise<AfterSalesRequest> {
    const response = await http.patch(`/api/admin/after-sales/requests/${encodeURIComponent(id)}/status`, { status, ...(note ? { note } : {}) });
    return response.data.request as AfterSalesRequest;
}

export async function confirmAdminAfterSalesRefund(id: PublicIdentifier, input: { refundReference: string; currency: string; idempotencyKey: string; note?: string }): Promise<AfterSalesRequest> {
    const response = await http.post(`/api/admin/after-sales/requests/${encodeURIComponent(id)}/refund`, input);
    return response.data.request as AfterSalesRequest;
}

export async function confirmAdminManualRefund(id: PublicIdentifier, input: ManualRefundInput): Promise<AfterSalesRequest> {
    const response = await http.post(`/api/admin/after-sales/requests/${encodeURIComponent(id)}/manual-refund`, input);
    return response.data.request as AfterSalesRequest;
}
