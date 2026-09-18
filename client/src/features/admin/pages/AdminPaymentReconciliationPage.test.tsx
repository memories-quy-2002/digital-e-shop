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

        expect(await screen.findByRole("columnheader", { name: "Expected amount" })).toBeInTheDocument();
        expect(screen.getByRole("columnheader", { name: "Provider result" })).toBeInTheDocument();
        expect(screen.getByText("PayOS and COD prioritized; legacy records retained for audit.")).toBeInTheDocument();

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
});
