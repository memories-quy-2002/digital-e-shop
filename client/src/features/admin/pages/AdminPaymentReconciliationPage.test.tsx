import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminPaymentReconciliationPage from "./AdminPaymentReconciliationPage";
import {
    confirmAdminCodPayment,
    fetchPaymentReconciliationCandidates,
    fetchPaymentWebhookEvents,
    reconcileAdminPayment,
    runPaymentReconciliation,
} from "../api";
import { fetchPaymentAttemptException, fetchPaymentAttemptExceptions, recordPaymentAttemptRefund, retryPaymentAttempt, uploadFinancialEvidence } from "../operations.api";

vi.mock("../operations.api", () => ({
    fetchPaymentAttemptException: vi.fn(),
    fetchPaymentAttemptExceptions: vi.fn(),
    recordPaymentAttemptRefund: vi.fn(),
    retryPaymentAttempt: vi.fn(),
    uploadFinancialEvidence: vi.fn(),
    downloadFinancialEvidence: vi.fn(),
}));

const addToast = vi.fn();

vi.mock("../api", () => ({
    confirmAdminCodPayment: vi.fn(),
    fetchPaymentReconciliationCandidates: vi.fn(),
    fetchPaymentWebhookEvents: vi.fn(),
    reconcileAdminPayment: vi.fn(),
    runPaymentReconciliation: vi.fn(),
}));
vi.mock("../../../components/layout/AdminLayout", () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("../../../context/ToastContext", () => ({ useToast: () => ({ addToast }) }));

const payosCandidate = {
    targetType: "order_payment" as const,
    targetId: 77,
    provider: "payos",
    localStatus: "pending",
    reconciliationStatus: "MISMATCH",
    providerReference: "payos-link",
    providerOrderCode: 123456,
    expectedAmount: 250000,
    expectedCurrency: "VND",
    providerAmount: null,
    providerCurrency: null,
    providerStatus: null,
    lastEventStatus: null,
    lastEventAt: null,
    mismatchReason: "Provider lookup required.",
    reservationExpiresAt: null,
    orderId: 42,
};

const cashCandidate = {
    ...payosCandidate,
    targetId: 88,
    provider: "cash",
    reconciliationStatus: "PENDING",
    providerReference: null,
    providerOrderCode: null,
    orderId: 43,
    mismatchReason: null,
};

const loadedPage = {
    candidates: [payosCandidate, cashCandidate],
    pagination: { page: 1, limit: 50, total: 2, totalPages: 1 },
};

describe("AdminPaymentReconciliationPage", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(fetchPaymentReconciliationCandidates).mockResolvedValue(loadedPage);
        vi.mocked(runPaymentReconciliation).mockResolvedValue({ results: [{ targetType: "order_payment", targetId: 77, outcome: "MATCHED" }], limit: 100 });
        vi.mocked(reconcileAdminPayment).mockResolvedValue({ targetType: "order_payment", targetId: 77, paymentId: 77, outcome: "MATCHED" });
        vi.mocked(confirmAdminCodPayment).mockResolvedValue({ id: 88, status: "paid" });
        vi.mocked(fetchPaymentWebhookEvents).mockResolvedValue([]);
        vi.mocked(fetchPaymentAttemptExceptions).mockResolvedValue({ items: [], pagination: { page: 1, limit: 25, total: 0, totalPages: 0 }, msg: "ok", requestId: "req" });
        vi.mocked(fetchPaymentAttemptException).mockResolvedValue({
            attemptId: "a57f967b-e1b5-4be5-b38f-8597ba864e60", providerOrderCode: "100", paymentState: "PAID", orderState: "PENDING",
            resolutionState: "OPEN", expectedAmountVnd: 100000, receivedAmountVnd: 100000, refundedAmountVnd: 20000, refundableAmountVnd: 80000,
            pendingCheckoutId: 5, createdAt: "2026-10-15T00:00:00.000Z", updatedAt: "2026-10-15T00:00:00.000Z", currency: "VND",
            items: [{ productId: 1, name: "Safe snapshot product", quantity: 1, unitPriceVnd: 100000 }], subtotalVnd: 100000, discountVnd: 0,
            shippingVnd: 0, payableVnd: 100000, refunds: [],
        });
        vi.mocked(retryPaymentAttempt).mockResolvedValue({ orderId: 55 });
        vi.mocked(recordPaymentAttemptRefund).mockResolvedValue({ operationId: "rf-1", amountVnd: 10000, replayed: false, resolutionState: "OPEN" });
        vi.mocked(uploadFinancialEvidence).mockResolvedValue({ id: 9, sha256: "hash", originalFilename: "transfer.pdf", mimeType: "application/pdf", byteSize: 12 });
    });

    it("shows a retryable error instead of an empty reconciliation queue", async () => {
        vi.mocked(fetchPaymentReconciliationCandidates).mockRejectedValueOnce(new Error("network"));
        render(<AdminPaymentReconciliationPage />);

        expect(await screen.findByRole("alert")).toHaveTextContent("Reconciliation unavailable");
        expect(screen.getByRole("button", { name: "Retry" })).toBeVisible();
        expect(screen.queryByText("Reconciliation queue is clear")).not.toBeInTheDocument();
    });

    it("shows the fulfilled empty state", async () => {
        vi.mocked(fetchPaymentReconciliationCandidates).mockResolvedValueOnce({
            candidates: [],
            pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
        });
        render(<AdminPaymentReconciliationPage />);

        expect(await screen.findByText("Reconciliation queue is clear")).toBeInTheDocument();
    });

    it("runs PayOS checks, confirms COD, and loads webhook history", async () => {
        vi.mocked(fetchPaymentWebhookEvents).mockResolvedValueOnce([{
            id: 4,
            provider: "payos",
            eventKey: "payos:ref-4",
            eventType: "PAYMENT_SUCCESS",
            payloadHash: "hash",
            normalizedPayload: null,
            orderCode: 123456,
            paymentLinkId: "payos-link",
            amount: 250000,
            currency: "VND",
            status: "PROCESSED",
            attemptCount: 1,
            lastError: null,
            receivedAt: "2026-09-17T08:00:00.000Z",
            processedAt: "2026-09-17T08:00:01.000Z",
            createdAt: null,
            updatedAt: null,
        }]);
        render(<AdminPaymentReconciliationPage />);

        const payosRow = await screen.findByText("Order #42").then((target) => target.closest("tr"));
        expect(payosRow).not.toBeNull();
        fireEvent.click(within(payosRow!).getByRole("button", { name: "Reconcile" }));
        await waitFor(() => expect(reconcileAdminPayment).toHaveBeenCalledWith(77));

        const cashRow = screen.getByText("Order #43").closest("tr");
        expect(cashRow).not.toBeNull();
        fireEvent.change(within(cashRow!).getByRole("textbox", { name: "COD note for payment 88" }), { target: { value: "Collected at delivery" } });
        fireEvent.click(within(cashRow!).getByRole("button", { name: "Confirm COD" }));
        await waitFor(() => expect(confirmAdminCodPayment).toHaveBeenCalledWith(88, "Collected at delivery"));

        fireEvent.click(within(payosRow!).getByRole("button", { name: "Webhook events" }));
        expect(await screen.findByText("PAYMENT_SUCCESS")).toBeInTheDocument();
        expect(fetchPaymentWebhookEvents).toHaveBeenCalledWith(77);
    });

    it("passes provider and status filters to the API", async () => {
        render(<AdminPaymentReconciliationPage />);
        await screen.findByText("Order #42");

        fireEvent.change(screen.getByRole("combobox", { name: "Filter by provider" }), { target: { value: "payos" } });
        fireEvent.change(screen.getByRole("combobox", { name: "Filter by reconciliation status" }), { target: { value: "MISMATCH" } });

        await waitFor(() => expect(fetchPaymentReconciliationCandidates).toHaveBeenLastCalledWith({
            page: 1,
            limit: 50,
            provider: "payos",
            reconciliationStatus: "MISMATCH",
        }));
    });

    it("shows queue loading, retryable errors, and empty state explicitly", async () => {
        vi.mocked(fetchPaymentAttemptExceptions).mockImplementationOnce(() => new Promise(() => {}));
        render(<AdminPaymentReconciliationPage />);
        expect(screen.getByText("Loading payment exceptions")).toBeInTheDocument();
    });

    it("shows an exception load error separately from the empty result", async () => {
        vi.mocked(fetchPaymentAttemptExceptions).mockRejectedValueOnce(new Error("offline"));
        render(<AdminPaymentReconciliationPage />);
        expect(await screen.findByRole("alert")).toBeInTheDocument();
        expect(screen.queryByText("No paid payment exceptions")).not.toBeInTheDocument();
    });

    it("shows the resolved empty exception state", async () => {
        render(<AdminPaymentReconciliationPage />);
        expect(await screen.findByText("No paid payment exceptions")).toBeInTheDocument();
    });

    it("loads a safe detail, retries with a reason, and records a partial refund with uploaded evidence", async () => {
        const item = {
            attemptId: "a57f967b-e1b5-4be5-b38f-8597ba864e60", providerOrderCode: "100", paymentState: "PAID", orderState: "PENDING",
            resolutionState: "OPEN", expectedAmountVnd: 100000, receivedAmountVnd: 100000, refundedAmountVnd: 20000, refundableAmountVnd: 80000,
            pendingCheckoutId: 5, createdAt: "2026-10-15T00:00:00.000Z", updatedAt: "2026-10-15T00:00:00.000Z",
        };
        vi.mocked(fetchPaymentAttemptExceptions).mockResolvedValue({ items: [item], pagination: { page: 1, limit: 25, total: 1, totalPages: 1 }, msg: "ok", requestId: "req" });
        render(<AdminPaymentReconciliationPage />);
        fireEvent.click(await screen.findByRole("button", { name: "Review" }));
        expect(await screen.findByText("Safe snapshot product × 1")).toBeInTheDocument();
        expect(screen.queryByText(/customer|email|phone/i)).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Retry fulfillment" })).toBeDisabled();
        expect(screen.getByRole("button", { name: "Record transfer refund" })).toBeDisabled();

        fireEvent.change(screen.getByLabelText("Fulfillment retry reason"), { target: { value: "Verified no order exists" } });
        fireEvent.click(screen.getByRole("button", { name: "Retry fulfillment" }));
        await waitFor(() => expect(retryPaymentAttempt).toHaveBeenCalledWith(item.attemptId, "Verified no order exists"));

        fireEvent.change(screen.getByLabelText("Refund amount (VND)"), { target: { value: "10000" } });
        fireEvent.change(screen.getByLabelText("Transfer reference"), { target: { value: "bank-ref-1" } });
        fireEvent.change(screen.getByLabelText("Transfer date"), { target: { value: "2026-10-15" } });
        const evidenceFile = new File(["proof"], "transfer.pdf", { type: "application/pdf" });
        fireEvent.change(screen.getByLabelText("Private transfer evidence"), { target: { files: [evidenceFile] } });
        await waitFor(() => expect(uploadFinancialEvidence).toHaveBeenCalledWith(evidenceFile));
        fireEvent.change(screen.getByLabelText("Transfer refund reason"), { target: { value: "Bank transfer verified" } });
        await waitFor(() => expect(screen.getByRole("button", { name: "Record transfer refund" })).toBeEnabled());
        fireEvent.click(screen.getByRole("button", { name: "Record transfer refund" }));
        await waitFor(() => expect(recordPaymentAttemptRefund).toHaveBeenCalledWith(item.attemptId, expect.objectContaining({ amountVnd: 10000, evidenceId: 9, transferReference: "bank-ref-1", transferredAt: "2026-10-15" })));
        expect(await screen.findByRole("status")).toHaveTextContent("Partial refund; remaining balance stays open.");
    });

    it("disables refund submission when evidence or a valid balance amount is missing", async () => {
        const item = {
            attemptId: "a57f967b-e1b5-4be5-b38f-8597ba864e60", providerOrderCode: "100", paymentState: "MISMATCH", orderState: "PENDING",
            resolutionState: "OPEN", expectedAmountVnd: 100000, receivedAmountVnd: 100000, refundedAmountVnd: 100000, refundableAmountVnd: 0,
            pendingCheckoutId: 5, createdAt: "2026-10-15T00:00:00.000Z", updatedAt: "2026-10-15T00:00:00.000Z",
        };
        vi.mocked(fetchPaymentAttemptExceptions).mockResolvedValueOnce({ items: [item], pagination: { page: 1, limit: 25, total: 1, totalPages: 1 }, msg: "ok", requestId: "req" });
        vi.mocked(fetchPaymentAttemptException).mockResolvedValueOnce({
            attemptId: item.attemptId, providerOrderCode: item.providerOrderCode, paymentState: item.paymentState, orderState: item.orderState,
            resolutionState: item.resolutionState, expectedAmountVnd: item.expectedAmountVnd, receivedAmountVnd: item.receivedAmountVnd,
            refundedAmountVnd: item.refundedAmountVnd, refundableAmountVnd: item.refundableAmountVnd, pendingCheckoutId: item.pendingCheckoutId,
            createdAt: item.createdAt, updatedAt: item.updatedAt, currency: "VND", items: [], subtotalVnd: 0, discountVnd: 0,
            shippingVnd: 0, payableVnd: 0, refunds: [],
        });
        render(<AdminPaymentReconciliationPage />);
        fireEvent.click(await screen.findByRole("button", { name: "Review" }));
        expect(await screen.findByText("No refundable balance remains.")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Record transfer refund" })).not.toBeInTheDocument();
    });
});
