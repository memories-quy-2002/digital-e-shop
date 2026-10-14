import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminEmailOperationsPage from "./AdminEmailOperationsPage";
import { fetchEmailOperations, retryEmail, runOperations } from "../operations.api";

vi.mock("../operations.api", () => ({
    fetchEmailOperations: vi.fn(),
    retryEmail: vi.fn(),
    runOperations: vi.fn(),
}));
vi.mock("../../../components/layout/AdminLayout", () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("../../../context/LocaleContext", () => ({ useLocale: () => ({ locale: "en" }) }));

describe("AdminEmailOperationsPage", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(fetchEmailOperations).mockResolvedValue({
            messages: [
                { id: 9, eventType: "order_placed", recipientMasked: "m***@example.test", locale: "en", state: "accepted", providerMessageId: "p-1", createdAt: "2026-10-14T10:00:00.000Z", updatedAt: "2026-10-14T10:00:01.000Z", lastErrorCode: null },
                { id: 8, eventType: "shipment_update", recipientMasked: "a***@example.test", locale: "vi", state: "sandbox", providerMessageId: null, createdAt: "2026-10-14T09:00:00.000Z", updatedAt: "2026-10-14T09:00:01.000Z", lastErrorCode: null },
                { id: 7, eventType: "refund_confirmation", recipientMasked: "b***@example.test", locale: "en", state: "failed", providerMessageId: null, createdAt: "2026-10-14T08:00:00.000Z", updatedAt: "2026-10-14T08:00:01.000Z", lastErrorCode: "provider_rejected" },
                { id: 6, eventType: "order_placed", recipientMasked: "c***@example.test", locale: "en", state: "delivered", providerMessageId: "p-2", createdAt: "2026-10-14T07:00:00.000Z", updatedAt: "2026-10-14T07:00:01.000Z", lastErrorCode: null },
            ],
            nextAfterId: 4,
        });
    });

    it("labels accepted, delivered, failed, sandbox records and shows masked recipients and safe error codes", async () => {
        render(<AdminEmailOperationsPage />);
        expect(await screen.findByText("Accepted by provider")).toBeInTheDocument();
        expect(screen.getByText("Delivered")).toBeInTheDocument();
        expect(screen.getByText("Sandbox delivery")).toBeInTheDocument();
        expect(screen.getByText("m***@example.test")).toBeInTheDocument();
        expect(screen.getByText("provider_rejected")).toBeInTheDocument();
    });

    it("requires explicit acknowledgement before retrying an ambiguous delivery", async () => {
        vi.mocked(fetchEmailOperations).mockResolvedValue({
            messages: [{ id: 4, eventType: "order_placed", recipientMasked: "m***@example.test", locale: "en", state: "review_required", providerMessageId: null, createdAt: "2026-10-14T10:00:00.000Z", updatedAt: "2026-10-14T10:00:01.000Z", lastErrorCode: "delivery_outcome_unknown" }],
            nextAfterId: null,
        });
        render(<AdminEmailOperationsPage />);
        await screen.findByText("Review required");
        fireEvent.click(screen.getByRole("button", { name: "Retry email #4" }));
        expect(await screen.findByRole("dialog", { name: "Confirm resend" })).toBeInTheDocument();
        fireEvent.click(screen.getByLabelText("I understand the first delivery may have completed."));
        fireEvent.click(screen.getByRole("button", { name: "Confirm resend" }));
        await waitFor(() => expect(retryEmail).toHaveBeenCalledWith(4, true));
    });

    it("clamps the runner batch to its server bound", async () => {
        vi.mocked(runOperations).mockResolvedValue({ claimed: 0, succeeded: 0, retried: 0, failed: 0, reviewRequired: 0, elapsedMs: 1 });
        render(<AdminEmailOperationsPage />);
        await screen.findByText("Accepted by provider");
        fireEvent.change(screen.getByLabelText("Runner batch size"), { target: { value: "500" } });
        fireEvent.click(screen.getByRole("button", { name: "Run operations" }));
        await waitFor(() => expect(runOperations).toHaveBeenCalledWith(100));
    });

    it("pages through messages using the bounded cursor", async () => {
        render(<AdminEmailOperationsPage />);
        await screen.findByText("Accepted by provider");
        fireEvent.click(screen.getByRole("button", { name: "Next messages" }));
        await waitFor(() => expect(fetchEmailOperations).toHaveBeenLastCalledWith({ limit: 25, afterId: 4 }));
        fireEvent.click(screen.getByRole("button", { name: "Previous messages" }));
        await waitFor(() => expect(fetchEmailOperations).toHaveBeenLastCalledWith({ limit: 25, afterId: undefined }));
    });
});
