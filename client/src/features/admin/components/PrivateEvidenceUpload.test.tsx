import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PrivateEvidenceUpload from "./PrivateEvidenceUpload";
import { downloadFinancialEvidence, uploadFinancialEvidence } from "../operations.api";

vi.mock("../operations.api", () => ({ downloadFinancialEvidence: vi.fn(), uploadFinancialEvidence: vi.fn() }));

describe("PrivateEvidenceUpload", () => {
    it("rejects unsupported file types and files larger than 2 MiB before upload", () => {
        const onChange = vi.fn();
        render(<PrivateEvidenceUpload label="Transfer evidence" evidence={null} onChange={onChange} />);
        const input = screen.getByLabelText("Transfer evidence");
        fireEvent.change(input, { target: { files: [new File(["x"], "script.svg", { type: "image/svg+xml" })] } });
        expect(screen.getByRole("alert")).toHaveTextContent("PNG, JPEG, or PDF");
        expect(uploadFinancialEvidence).not.toHaveBeenCalled();
        fireEvent.change(input, { target: { files: [new File([new Uint8Array(2 * 1024 * 1024 + 1)], "large.pdf", { type: "application/pdf" })] } });
        expect(uploadFinancialEvidence).not.toHaveBeenCalled();
    });

    it("shows a recoverable message when private download access has expired", async () => {
        vi.mocked(downloadFinancialEvidence).mockRejectedValue(new Error("forbidden"));
        render(<PrivateEvidenceUpload label="Transfer evidence" evidence={{ id: 3, sha256: "x", originalFilename: "proof.pdf", mimeType: "application/pdf", byteSize: 5 }} onChange={vi.fn()} />);
        fireEvent.click(screen.getByRole("button", { name: "Download private file" }));
        await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("unavailable to this admin session"));
    });
});
