import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

    it("filters the loaded ticket queue without another request", async () => {
        vi.mocked(fetchSupportTickets).mockResolvedValue([
            {
                id: 1,
                category: "payment",
                subject: "Payment issue",
                message: "The customer cannot complete checkout.",
                status: "OPEN",
                priority: "HIGH",
                created_at: "2026-09-09T08:00:00.000Z",
                updated_at: "2026-09-09T08:00:00.000Z",
            },
            {
                id: 2,
                category: "shipping",
                subject: "Shipping address",
                message: "The customer needs to update delivery details.",
                status: "WAITING_FOR_CUSTOMER",
                priority: "NORMAL",
                created_at: "2026-09-09T08:05:00.000Z",
                updated_at: "2026-09-09T08:05:00.000Z",
            },
        ]);

        render(<AdminSupportPage />);

        expect(await screen.findByText(/Payment issue/)).toBeInTheDocument();
        const search = screen.getByRole("searchbox", { name: "Search support tickets" });
        fireEvent.change(search, { target: { value: "shipping" } });

        expect(screen.queryByText(/Payment issue/)).not.toBeInTheDocument();
        expect(screen.getByText(/Shipping address/)).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Clear" }));
        expect(screen.getByText(/Payment issue/)).toBeInTheDocument();
    });
});
