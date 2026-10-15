import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminAfterSalesPage from "./AdminAfterSalesPage";
import { confirmAdminManualRefund, fetchAdminAfterSalesRequest, fetchAdminAfterSalesRequests } from "../api";
import { uploadFinancialEvidence } from "../../admin/operations.api";
import type { AfterSalesRequest } from "../types";

vi.mock("../api", () => ({
    confirmAdminManualRefund: vi.fn(),
    fetchAdminAfterSalesRequest: vi.fn(),
    fetchAdminAfterSalesRequests: vi.fn(),
    transitionAdminAfterSalesRequest: vi.fn(),
}));
vi.mock("../../admin/operations.api", () => ({
    uploadFinancialEvidence: vi.fn(),
    downloadFinancialEvidence: vi.fn(),
}));
vi.mock("../../../components/layout/AdminLayout", () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("../../../context/ToastContext", () => ({ useToast: () => ({ addToast: vi.fn() }) }));
vi.mock("../../../context/LocaleContext", () => ({ useLocale: () => ({ locale: "en" }) }));

const request: AfterSalesRequest = { id: 7, orderId: 17, userId: "admin-customer", kind: "RETURN", status: "REFUND_PENDING", reason: "Damaged on arrival", adminNote: null, refundAmount: null, refundCurrency: "VND", refundReference: null, createdAt: "2026-10-14T00:00:00.000Z", updatedAt: "2026-10-14T00:00:00.000Z", approvedAt: null, receivedAt: "2026-10-14T00:00:00.000Z", refundedAt: null, closedAt: null, items: [], events: [] };

describe("AdminAfterSalesPage manual refund", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(fetchAdminAfterSalesRequests).mockResolvedValue({ requests: [request], pagination: { page: 1, limit: 100, total: 1, totalPages: 1 } });
        vi.mocked(fetchAdminAfterSalesRequest).mockResolvedValue(request);
        vi.mocked(uploadFinancialEvidence).mockResolvedValue({ id: 6, sha256: "proof-hash", originalFilename: "transfer.pdf", mimeType: "application/pdf", byteSize: 8 });
    });

    it("submits reviewed transfer details and evidence without a client refund amount, locking duplicate clicks", async () => {
        let resolveRequest!: (value: typeof request) => void;
        vi.mocked(confirmAdminManualRefund).mockReturnValue(new Promise((resolve) => { resolveRequest = resolve; }) as never);
        render(<AdminAfterSalesPage />);
        fireEvent.click(await screen.findByRole("button", { name: /#7 · Order #17/ }));
        fireEvent.change(await screen.findByLabelText("Transfer reference"), { target: { value: "BANK-REF-17" } });
        fireEvent.change(screen.getByLabelText("Transfer date"), { target: { value: "2026-10-14" } });
        fireEvent.change(screen.getByLabelText("Reviewed reason"), { target: { value: "Reviewed order and paid ledger" } });
        fireEvent.change(screen.getByLabelText("Private transfer evidence"), { target: { files: [new File(["proofdata"], "transfer.pdf", { type: "application/pdf" })] } });
        await screen.findByText("transfer.pdf");
        const submit = screen.getByRole("button", { name: "Record manual refund" });
        fireEvent.click(submit);
        fireEvent.click(submit);
        await waitFor(() => expect(confirmAdminManualRefund).toHaveBeenCalledTimes(1));
        expect(confirmAdminManualRefund).toHaveBeenCalledWith(7, {
            idempotencyKey: "manual-refund-7-BANK-REF-17",
            transferReference: "BANK-REF-17",
            transferDate: "2026-10-14",
            reviewedReason: "Reviewed order and paid ledger",
            evidenceId: 6,
            currency: "VND",
        });
        resolveRequest({ ...request, status: "REFUNDED", refundAmount: 5000 });
    });
});
