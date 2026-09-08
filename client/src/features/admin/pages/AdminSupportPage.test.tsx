import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminSupportPage from "./AdminSupportPage";
import { fetchSupportTickets } from "../../support/api";

vi.mock("../../support/api", () => ({
    fetchSupportTickets: vi.fn(),
    updateSupportTicket: vi.fn(),
}));
vi.mock("../../../components/layout/AdminLayout", () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("../../../context/ToastContext", () => ({ useToast: () => ({ addToast: vi.fn() }) }));

describe("AdminSupportPage request states", () => {
    beforeEach(() => vi.clearAllMocks());

    it("shows a retryable error instead of the filtered empty state", async () => {
        vi.mocked(fetchSupportTickets).mockRejectedValue({ response: { status: 403 } });
        render(<AdminSupportPage />);

        await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Access denied"));
        expect(screen.queryByText("No support tickets match this filter.")).not.toBeInTheDocument();
    });

    it("shows the fulfilled empty state", async () => {
        vi.mocked(fetchSupportTickets).mockResolvedValue([]);
        render(<AdminSupportPage />);

        await waitFor(() => expect(screen.getByText("No support tickets match this filter")).toBeInTheDocument());
    });
});
