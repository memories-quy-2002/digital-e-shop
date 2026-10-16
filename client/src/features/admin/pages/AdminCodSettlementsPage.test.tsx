import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminCodSettlementsPage from "./AdminCodSettlementsPage";
import { confirmCodRemittance, fetchCodSettlements, uploadFinancialEvidence } from "../operations.api";

vi.mock("../operations.api", () => ({
    fetchCodSettlements: vi.fn(),
    confirmCodRemittance: vi.fn(),
    uploadFinancialEvidence: vi.fn(),
}));
vi.mock("../../../components/layout/AdminLayout", () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("../../../context/LocaleContext", () => ({ useLocale: () => ({ locale: "en" }) }));

describe("AdminCodSettlementsPage", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(uploadFinancialEvidence).mockResolvedValue({ id: 2, sha256: "hash", originalFilename: "proof.pdf", mimeType: "application/pdf", byteSize: 5 });
        vi.mocked(fetchCodSettlements).mockResolvedValue({
            settlements: [{ id: 1, orderId: 17, expectedCodVnd: 100_000, collectedVnd: 100_000, carrierFeeVnd: 10_000, remittedVnd: 85_000, currency: "VND", status: "MISMATCH", actualCarrierFeeVnd: 10_000, sandbox: true }],
            nextAfterId: null,
        });
    });

    it("distinguishes staff collection from store remittance and surfaces the mismatch and sandbox marker", async () => {
        render(<AdminCodSettlementsPage />);
        expect(await screen.findByText("Collected by delivery staff")).toBeInTheDocument();
        expect(screen.getByText("Remitted to store")).toBeInTheDocument();
        expect(screen.getByText("Mismatch")).toBeInTheDocument();
        expect(screen.getByText("Sandbox record")).toBeInTheDocument();
        expect(screen.getByRole("status")).toHaveTextContent("5.000");
    });

    it("requires a transfer reference, date, and evidence before remittance can submit", async () => {
        render(<AdminCodSettlementsPage />);
        await screen.findByText("Collected by delivery staff");
        expect(screen.getByRole("button", { name: "Record remittance" })).toBeDisabled();
    });

    it("blocks remittance until the delivery fee is available", async () => {
        vi.mocked(fetchCodSettlements).mockResolvedValue({
            settlements: [{ id: 1, orderId: 17, expectedCodVnd: 100_000, collectedVnd: 100_000, carrierFeeVnd: 0, remittedVnd: 0, currency: "VND", status: "PENDING", actualCarrierFeeVnd: null }],
            nextAfterId: null,
        });
        render(<AdminCodSettlementsPage />);
        expect(await screen.findByText(/The delivery fee is not available yet/)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Record remittance" })).toBeDisabled();
    });

    it("disables duplicate confirmation while a remittance is pending", async () => {
        let resolveRequest!: (value: unknown) => void;
        vi.mocked(confirmCodRemittance).mockReturnValue(new Promise((resolve) => { resolveRequest = resolve; }) as never);
        render(<AdminCodSettlementsPage />);
        await screen.findByText("Collected by delivery staff");
        fireEvent.change(screen.getByLabelText("Transfer reference"), { target: { value: "BANK-17" } });
        fireEvent.change(screen.getByLabelText("Transfer date"), { target: { value: "2026-10-14" } });
        fireEvent.change(screen.getByLabelText("Remitted amount (VND)"), { target: { value: "85000" } });
        fireEvent.change(screen.getByLabelText("Transfer evidence"), { target: { files: [new File(["proof"], "proof.pdf", { type: "application/pdf" })] } });
        await waitFor(() => expect(screen.getByText("proof.pdf")).toBeInTheDocument());
        const submit = screen.getByRole("button", { name: "Record remittance" });
        fireEvent.click(submit);
        fireEvent.click(submit);
        expect(confirmCodRemittance).toHaveBeenCalledTimes(1);
        expect(confirmCodRemittance).toHaveBeenCalledWith(17, { remittedVnd: 85000, transferReference: "BANK-17", transferDate: "2026-10-14", evidenceId: 2 });
        resolveRequest({ id: 1 });
    });
});
