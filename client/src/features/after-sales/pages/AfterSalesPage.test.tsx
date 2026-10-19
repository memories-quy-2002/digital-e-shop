import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AfterSalesPage from "./AfterSalesPage";
import { LocaleProvider } from "../../../context/LocaleContext";
import { fetchCustomerOrderDetail, fetchCustomerOrders } from "../../orders/api";
import { fetchCustomerAfterSalesRequests } from "../api";

vi.mock("../../../components/layout/Layout", () => ({
    default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("../../users/components/CustomerAccountShell", () => ({
    default: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

vi.mock("../../../context/AuthContext", () => ({
    useAuth: () => ({ userData: { id: "customer-1" } }),
}));

vi.mock("../../../context/ToastContext", () => ({
    useToast: () => ({ addToast: vi.fn() }),
}));

vi.mock("react-helmet-async", () => ({
    Helmet: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("../../orders/api", () => ({
    fetchCustomerOrders: vi.fn(),
    fetchCustomerOrderDetail: vi.fn(),
}));

vi.mock("../api", () => ({
    createCustomerAfterSalesRequest: vi.fn(),
    fetchCustomerAfterSalesRequests: vi.fn(),
}));

describe("AfterSalesPage request history", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(fetchCustomerOrders).mockResolvedValue([]);
        vi.mocked(fetchCustomerAfterSalesRequests).mockResolvedValue({ requests: [], pagination: {} } as never);
    });

    it("shows a loading state, offers retry after failure, then shows the empty state", async () => {
        vi.mocked(fetchCustomerAfterSalesRequests)
            .mockRejectedValueOnce(new Error("offline"))
            .mockResolvedValueOnce({ requests: [], pagination: {} } as never);

        render(
            <LocaleProvider>
                <MemoryRouter>
                    <AfterSalesPage />
                </MemoryRouter>
            </LocaleProvider>,
        );

        expect(screen.getAllByText("Loading…").length).toBeGreaterThan(0);
        expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load after-sales requests.");

        fireEvent.click(screen.getByRole("button", { name: "Refresh requests" }));

        await waitFor(() => expect(screen.getByText("No after-sales requests yet.")).toBeVisible());
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("shows the server-provided inclusive UTC return deadline for the loaded order", async () => {
        vi.mocked(fetchCustomerOrderDetail).mockResolvedValue({
            id: 42,
            date_added: "2026-09-01T10:00:00.000Z",
            delivered_at: "2026-09-01T12:00:00.000Z",
            return_eligible_until: "2026-09-08T23:59:59.999Z",
            status: 1,
            total_price: 100,
            discount: 0,
            shipping_address: "",
            items: [],
        });
        render(<LocaleProvider><MemoryRouter><AfterSalesPage /></MemoryRouter></LocaleProvider>);

        fireEvent.change(screen.getByLabelText("Order ID"), { target: { value: "42" } });
        fireEvent.click(screen.getByRole("button", { name: "Load order items" }));

        expect(await screen.findByRole("note")).toHaveTextContent("The return window ended");
        expect(screen.getByRole("note")).toHaveTextContent("2026");
        expect(screen.getByRole("note")).toHaveTextContent("UTC");
    });

    it("loads customer order details from a UUIDv7 public reference", async () => {
        const publicId = "019a0000-0000-7000-8000-000000000001";
        vi.mocked(fetchCustomerOrderDetail).mockResolvedValue({
            id: 42,
            public_id: publicId,
            date_added: "2026-09-01T10:00:00.000Z",
            status: 1,
            total_price: 100,
            discount: 0,
            shipping_address: "",
            items: [],
        });

        render(<LocaleProvider><MemoryRouter initialEntries={[`/account/after-sales?order=${publicId}`]}><AfterSalesPage /></MemoryRouter></LocaleProvider>);
        fireEvent.click(screen.getByRole("button", { name: "Load order items" }));

        await waitFor(() => expect(fetchCustomerOrderDetail).toHaveBeenCalledWith(publicId));
    });
});
