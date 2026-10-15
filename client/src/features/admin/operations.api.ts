import http from "../../lib/http";
import type {
    CodSettlementsPage,
    EmailOperationsPage,
    FinancialEvidence,
    PaymentAttemptExceptionDetail,
    PaymentAttemptExceptionPage,
    SettlementInput,
    TaskRunnerSummary,
} from "./operations.types";

export type OperationsListFilters = { limit?: number; afterId?: number };
const boundedLimit = (value: number | undefined, fallback: number) => Number.isFinite(value)
    ? Math.min(100, Math.max(1, Math.trunc(Number(value))))
    : fallback;
const normalizeFilters = (filters: OperationsListFilters = {}) => ({
    limit: boundedLimit(filters.limit, 25),
    ...(Number.isSafeInteger(filters.afterId) && Number(filters.afterId) > 0 ? { afterId: filters.afterId } : {}),
});

export async function fetchCodSettlements(filters: OperationsListFilters = {}): Promise<CodSettlementsPage> {
    const response = await http.get("/api/admin/payments/cod-settlements", { params: normalizeFilters(filters) });
    return response.data as CodSettlementsPage;
}

export async function confirmCodRemittance(orderId: number, input: SettlementInput) {
    const response = await http.post(`/api/admin/payments/cod-settlements/${orderId}/remittance`, input);
    return response.data.settlement;
}

export async function uploadFinancialEvidence(file: File): Promise<FinancialEvidence> {
    const form = new FormData();
    form.append("file", file);
    const response = await http.post("/api/admin/evidence", form);
    return response.data.evidence as FinancialEvidence;
}

export async function downloadFinancialEvidence(evidenceId: number): Promise<Blob> {
    const response = await http.get(`/api/admin/evidence/${evidenceId}`, { responseType: "blob", headers: { "Cache-Control": "no-store" } });
    return response.data as Blob;
}

export async function fetchEmailOperations(filters: OperationsListFilters = {}): Promise<EmailOperationsPage> {
    const response = await http.get("/api/admin/email", { params: normalizeFilters(filters) });
    return response.data as EmailOperationsPage;
}

export async function runOperations(limit: number): Promise<TaskRunnerSummary> {
    const bounded = boundedLimit(limit, 20);
    const response = await http.post("/api/admin/operations/run", { limit: bounded });
    return response.data as TaskRunnerSummary;
}

export async function retryEmail(messageId: number, acknowledgeUnknownOutcome: boolean) {
    const response = await http.post(`/api/admin/email/${messageId}/resend`, { acknowledgeUnknownOutcome });
    return response.data;
}

export type PaymentAttemptRefundInput = {
    amountVnd: number;
    transferReference: string;
    idempotencyKey: string;
    transferredAt: string;
    evidenceId: number;
    reason: string;
};

export async function fetchPaymentAttemptExceptions(page = 1, limit = 25): Promise<PaymentAttemptExceptionPage> {
    const response = await http.get("/api/admin/payments/attempt-exceptions", {
        params: { page: Math.max(1, Math.trunc(page)), limit: Math.min(100, Math.max(1, Math.trunc(limit))) },
    });
    return response.data as PaymentAttemptExceptionPage;
}

export async function fetchPaymentAttemptException(attemptId: string): Promise<PaymentAttemptExceptionDetail> {
    const response = await http.get(`/api/admin/payments/attempt-exceptions/${encodeURIComponent(attemptId)}`);
    return response.data.attempt as PaymentAttemptExceptionDetail;
}

export async function retryPaymentAttempt(attemptId: string, reason: string) {
    const response = await http.post(`/api/admin/payments/attempt-exceptions/${encodeURIComponent(attemptId)}/retry`, { reason });
    return response.data.result;
}

export async function recordPaymentAttemptRefund(attemptId: string, input: PaymentAttemptRefundInput) {
    const response = await http.post(`/api/admin/payments/attempt-exceptions/${encodeURIComponent(attemptId)}/refunds`, input);
    return response.data.refund as { operationId: string; amountVnd: number; replayed: boolean; resolutionState: string };
}
