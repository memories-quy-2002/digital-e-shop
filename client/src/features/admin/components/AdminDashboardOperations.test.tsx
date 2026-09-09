import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import AdminDashboardOperations from "./AdminDashboardOperations";

const formatters = {
    formatCurrency: (value: number) => `$${value.toFixed(2)}`,
    formatReportDate: (date: Date) => date.toISOString(),
};

const pendingOrder = {
    id: 42,
    date_added: new Date("2026-09-09T08:00:00.000Z"),
    user_id: "user-1",
    customer_name: "Ada Lovelace",
    customer_email: "ada@example.com",
    status: 0,
    total_price: 120,
    discount: 5,
    payment_method: "bank_transfer",
};

describe("AdminDashboardOperations", () => {
    it("renders pending orders with a clear queue action", () => {
        render(
            <MemoryRouter>
                <AdminDashboardOperations
                    pendingOrders={[pendingOrder]}
                    lowStockProducts={[]}
                    ordersStatus="success"
                    productsStatus="success"
                    {...formatters}
                />
            </MemoryRouter>,
        );

        expect(screen.getByRole("heading", { name: "Orders needing action" })).toBeTruthy();
        expect(screen.getByText("#42")).toBeTruthy();
        expect(screen.getByRole("link", { name: "Open orders" })).toHaveAttribute("href", "/admin/orders");
    });

    it("renders successful empty states", () => {
        render(
            <MemoryRouter>
                <AdminDashboardOperations
                    pendingOrders={[]}
                    lowStockProducts={[]}
                    ordersStatus="success"
                    productsStatus="success"
                    {...formatters}
                />
            </MemoryRouter>,
        );

        expect(screen.getByText("No pending orders")).toBeTruthy();
        expect(screen.getByText("No low-stock products")).toBeTruthy();
    });

    it("shows a retryable status instead of an empty table after a request failure", () => {
        render(
            <MemoryRouter>
                <AdminDashboardOperations
                    pendingOrders={[]}
                    lowStockProducts={[]}
                    ordersStatus="error"
                    productsStatus="success"
                    onRetry={vi.fn()}
                    {...formatters}
                />
            </MemoryRouter>,
        );

        expect(screen.getByRole("alert")).toBeTruthy();
        expect(screen.queryByText("No pending orders")).toBeNull();
    });
});
